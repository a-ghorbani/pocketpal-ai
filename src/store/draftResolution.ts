import {isMTPCapable, nEmbdOut} from '../utils/mtp';
import {CacheType, DraftConfig, Model, ModelOrigin} from '../utils/types';

// These must stay module-level functions: makeAutoObservable wraps class
// methods in `action`, actions run untracked, so a computed calling one would
// latch its first value and never recompute.

export type DraftCandidate =
  | {mode: 'off'}
  | {mode: 'embedded'}
  | {mode: 'paired'; draftModel: Model};

// A model paired with itself is loaded twice, so it never counts as its own draft.
export const resolveDraftModelId = (
  target: Model,
  selectedDraftModelId?: string,
): string | undefined => {
  const draftId = target.defaultDraftModel ?? selectedDraftModelId;
  return draftId === target.id ? undefined : draftId;
};

export const unpairedDraftCandidate = (
  target: Model,
): Exclude<DraftCandidate, {mode: 'paired'}> =>
  isMTPCapable(target) ? {mode: 'embedded'} : {mode: 'off'};

const isUsableDraft = (draft?: Model): draft is Model =>
  !!draft?.isDownloaded && isMTPCapable(draft);

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
  if (isUsableDraft(draftModel)) {
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

// The draft settings are global next-load knobs, so without a local target
// there is no width to check against and nothing loading to protect: the mode
// is whatever the global pick alone implies.
export const effectiveDraftModeOf = (
  source: DraftResolutionSource,
): DraftConfig['mode'] => {
  const target =
    source.activeModel?.origin === ModelOrigin.REMOTE
      ? undefined
      : source.activeModel;

  if (target) {
    return resolveDraftCandidate(
      target,
      source.models,
      source.contextInitParams,
    ).mode;
  }

  const {speculativeEnabled, selectedDraftModelId} = source.contextInitParams;
  if (!speculativeEnabled || !selectedDraftModelId) {
    return 'off';
  }

  return isUsableDraft(source.models.find(m => m.id === selectedDraftModelId))
    ? 'paired'
    : 'off';
};

export const draftCacheDefaults = (
  mode: DraftConfig['mode'],
): {k: CacheType; v: CacheType} =>
  mode === 'paired'
    ? {k: CacheType.F16, v: CacheType.F16}
    : {k: CacheType.Q8_0, v: CacheType.Q8_0};
