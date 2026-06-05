import {BannerVariant, CompletionResultSnapshot} from './completionTypes';

// Used / n_ctx ratio at which the soft "getting tight" warning fires.
export const WARNING_THRESHOLD = 0.8;
// Headroom below n_ctx; the sticky full banner clears once a later turn's
// `used` drops below `effectiveNCtx - AUTOCLEAR_RUNWAY`.
export const AUTOCLEAR_RUNWAY = 256;
// Remote replies shorter than this are never flagged as hedged-truncated.
export const MIN_REMOTE_TOKENS = 500;

export interface BannerResolverInput {
  effectiveNCtx: number | undefined;
  isRemote: boolean;
  htmlPreviewCount: number;
  activeModelId: string | undefined;
  dismissed: Set<BannerVariant>;
  heavyTalentName?: string;
  // Returns whether the device can fit a candidate n_ctx, using the same
  // estimator the load path uses. Supplied by the caller so this module
  // stays pure and store-free.
  canFitNCtx?: (candidate: number) => boolean;
}

export interface BannerResolution {
  variant: BannerVariant;
  nextNCtx?: number;
  heavyTalentName?: string;
}

// Next larger n_ctx (doubling) whose memory requirement still fits, or
// undefined when nothing larger fits. The only upper bound is the device's
// memory ceiling — there is no n_ctx slider max.
function computeNextFitNCtx(
  effectiveNCtx: number,
  canFitNCtx: ((candidate: number) => boolean) | undefined,
): number | undefined {
  if (!canFitNCtx) {
    return undefined;
  }
  const candidate = effectiveNCtx * 2;
  return canFitNCtx(candidate) ? candidate : undefined;
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
    canFitNCtx,
  } = input;

  // context-* variants require a loaded model. The nCtx-reading variants
  // (full, warning) additionally need a known runtime n_ctx; the remote
  // hedged advisory does not read n_ctx and only needs a loaded model.
  const modelLoaded = activeModelId !== undefined;

  if (snapshot && modelLoaded) {
    if (effectiveNCtx !== undefined) {
      const nCtx = effectiveNCtx;

      // 1. context-full — sticky; freshness gate corroborates the frozen flag.
      if (snapshot.contextFull && snapshot.used >= nCtx - AUTOCLEAR_RUNWAY) {
        return {
          variant: 'context-full',
          nextNCtx: computeNextFitNCtx(nCtx, canFitNCtx),
          heavyTalentName,
        };
      }

      // 2. context-warning — local, near the limit, dismissable per draft.
      if (
        !isRemote &&
        !snapshot.contextFull &&
        snapshot.used / nCtx >= WARNING_THRESHOLD &&
        !dismissed.has('context-warning')
      ) {
        return {variant: 'context-warning'};
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
