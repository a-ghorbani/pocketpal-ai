import {isMTPCapable, nEmbdOut} from '../utils/mtp';
import {CacheType, DraftConfig, Model} from '../utils/types';

export type DraftCandidate =
  | {mode: 'off'}
  | {mode: 'embedded'}
  | {mode: 'paired'; draftModel: Model};

export const resolveDraftModelId = (
  target: Model,
  selectedDraftModelId?: string,
): string | undefined => target.defaultDraftModel ?? selectedDraftModelId;

export const unpairedDraftCandidate = (
  target: Model,
): Exclude<DraftCandidate, {mode: 'paired'}> =>
  isMTPCapable(target) ? {mode: 'embedded'} : {mode: 'off'};

// A width mismatch on a paired draft is an uncatchable native abort
// (LM_GGML_ASSERT → SIGABRT in init_mtp), so an unknown width is not paired.
export const resolveDraftCandidate = (
  target: Model,
  models: Model[],
  params: {speculativeEnabled?: boolean; selectedDraftModelId?: string},
): DraftCandidate => {
  if (!params.speculativeEnabled) {
    return {mode: 'off'};
  }

  const draftId = resolveDraftModelId(target, params.selectedDraftModelId);
  const draftModel = draftId ? models.find(m => m.id === draftId) : undefined;
  if (draftModel?.isDownloaded && isMTPCapable(draftModel)) {
    const draftWidth = nEmbdOut(draftModel.ggufMetadata);
    const targetWidth = target.ggufMetadata?.n_embd;
    if (
      draftWidth !== undefined &&
      targetWidth !== undefined &&
      draftWidth === targetWidth
    ) {
      return {mode: 'paired', draftModel};
    }
  }

  return unpairedDraftCandidate(target);
};

export interface DraftResolutionSource {
  models: Model[];
  activeModel?: Model;
  contextInitParams: {
    speculativeEnabled?: boolean;
    selectedDraftModelId?: string;
  };
}

export const effectiveDraftModeOf = (
  source: DraftResolutionSource,
): DraftConfig['mode'] =>
  source.activeModel
    ? resolveDraftCandidate(
        source.activeModel,
        source.models,
        source.contextInitParams,
      ).mode
    : 'off';

export const draftCacheDefaults = (
  mode: DraftConfig['mode'],
): {k: CacheType; v: CacheType} =>
  mode === 'paired'
    ? {k: CacheType.F16, v: CacheType.F16}
    : {k: CacheType.Q8_0, v: CacheType.Q8_0};
