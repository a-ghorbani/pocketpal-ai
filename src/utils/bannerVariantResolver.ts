import {BannerVariant, CompletionResultSnapshot} from './completionTypes';

// Used / n_ctx ratio at which the soft "getting tight" warning fires.
export const WARNING_THRESHOLD = 0.8;
// Headroom below n_ctx; the full banner auto-clears once a later turn's
// `used` drops below `effectiveNCtx - AUTOCLEAR_RUNWAY`.
export const AUTOCLEAR_RUNWAY = 256;

// Context-size stops offered by the IncreaseContextSheet slider. The slider
// clamps to min(CONTEXT_LADDER[last], model.ggufMetadata.context_length).
export const CONTEXT_LADDER = [
  2048, 4096, 6144, 8192, 12288, 16384, 24576, 32768, 49152, 65536, 98304,
  131072,
] as const;

export interface BannerResolverInput {
  effectiveNCtx: number | undefined;
  htmlPreviewCount: number;
  activeModelId: string | undefined;
  dismissed: Set<BannerVariant>;
  heavyTalentName?: string;
}

export interface BannerResolution {
  variant: BannerVariant;
  heavyTalentName?: string;
  // used/effectiveNCtx clamped to [0, 1], driving the fullness meter. Present
  // only on context-full and context-warning (the nCtx-reading branches).
  ratio?: number;
}

/**
 * Resolve the single banner variant to render, in precedence order:
 * context-full → context-warning → html-soft-cap → none. Pure: no JSX, no
 * MobX writes, no async.
 */
export function resolveBannerVariant(
  snapshot: CompletionResultSnapshot | undefined,
  input: BannerResolverInput,
): BannerResolution {
  const {
    effectiveNCtx,
    htmlPreviewCount,
    activeModelId,
    dismissed,
    heavyTalentName,
  } = input;

  // context-* variants require a loaded model and a known runtime n_ctx.
  const modelLoaded = activeModelId !== undefined;

  if (snapshot && modelLoaded && effectiveNCtx !== undefined) {
    const nCtx = effectiveNCtx;

    const ratio = Math.min(1, Math.max(0, snapshot.used / nCtx));

    // 1. context-full — freshness gate corroborates the frozen flag;
    // dismissable per draft (the dismissal clears on the next finished turn).
    if (
      snapshot.contextFull &&
      snapshot.used >= nCtx - AUTOCLEAR_RUNWAY &&
      !dismissed.has('context-full')
    ) {
      return {
        variant: 'context-full',
        heavyTalentName,
        ratio,
      };
    }

    // 2. context-warning — near the limit, dismissable per draft.
    if (
      !snapshot.contextFull &&
      snapshot.used / nCtx >= WARNING_THRESHOLD &&
      !dismissed.has('context-warning')
    ) {
      return {variant: 'context-warning', ratio};
    }
  }

  // 3. html-soft-cap — preventative hint, independent of model state.
  if (htmlPreviewCount >= 4) {
    return {variant: 'html-soft-cap'};
  }

  // 4. none.
  return {variant: 'none'};
}
