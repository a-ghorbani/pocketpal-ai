import {BannerVariant, CompletionResultSnapshot} from './completionTypes';

// Used / n_ctx ratio at which the soft "getting tight" warning fires.
export const WARNING_THRESHOLD = 0.8;
// Headroom below n_ctx; the full banner auto-clears once a later turn's
// `used` drops below `effectiveNCtx - AUTOCLEAR_RUNWAY`.
export const AUTOCLEAR_RUNWAY = 256;
// Remote replies shorter than this are never flagged as hedged-truncated.
export const MIN_REMOTE_TOKENS = 500;

// Context-size stops offered by the IncreaseContextSheet slider. The slider
// clamps to min(CONTEXT_LADDER[last], model.ggufMetadata.context_length).
export const CONTEXT_LADDER = [
  2048, 4096, 6144, 8192, 12288, 16384, 24576, 32768, 49152, 65536, 98304,
  131072,
] as const;

export interface BannerResolverInput {
  effectiveNCtx: number | undefined;
  isRemote: boolean;
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

function endsWithTerminalPunctuation(text: string | undefined): boolean {
  if (!text) {
    return false;
  }
  return /[.!?。！？]["')\]]?\s*$/.test(text.trimEnd());
}

/**
 * Resolve the single banner variant to render, in precedence order:
 * context-full → context-warning → context-remote-hedged → html-soft-cap →
 * none. Pure: no JSX, no MobX writes, no async.
 */
export function resolveBannerVariant(
  snapshot: CompletionResultSnapshot | undefined,
  input: BannerResolverInput,
): BannerResolution {
  const {
    effectiveNCtx,
    isRemote,
    htmlPreviewCount,
    activeModelId,
    dismissed,
    heavyTalentName,
  } = input;

  // context-* variants require a loaded model. The nCtx-reading variants
  // (full, warning) additionally need a known runtime n_ctx; the remote
  // hedged advisory does not read n_ctx and only needs a loaded model.
  const modelLoaded = activeModelId !== undefined;

  if (snapshot && modelLoaded) {
    if (effectiveNCtx !== undefined) {
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

      // 2. context-warning — local, near the limit, dismissable per draft.
      if (
        !isRemote &&
        !snapshot.contextFull &&
        snapshot.used / nCtx >= WARNING_THRESHOLD &&
        !dismissed.has('context-warning')
      ) {
        return {variant: 'context-warning', ratio};
      }
    }

    // 3. context-remote-hedged — remote weak-signal truncation, dismissable.
    // Remote models never set activeContextSettings.n_ctx, so this branch
    // must not depend on effectiveNCtx.
    if (
      isRemote &&
      snapshot.finishReason !== 'length' &&
      (snapshot.tokensPredicted ?? 0) >= MIN_REMOTE_TOKENS &&
      !endsWithTerminalPunctuation(snapshot.content) &&
      !dismissed.has('context-remote-hedged')
    ) {
      return {variant: 'context-remote-hedged'};
    }
  }

  // 4. html-soft-cap — preventative hint, independent of model state.
  if (htmlPreviewCount >= 4) {
    return {variant: 'html-soft-cap'};
  }

  // 5. none.
  return {variant: 'none'};
}
