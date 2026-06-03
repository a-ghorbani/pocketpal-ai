import type {CompletionResult} from './completionTypes';
import type {MessageType} from './types';
import {talentRegistry} from '../services/talents';

/**
 * Snapshot of the most recent finished `CompletionResult` for the active
 * session. Lives on `ChatSessionStore.lastCompletionResult` and is also
 * persisted on `message.metadata.completionResult` for the last assistant
 * turn so the snapshot survives process restart and session switch.
 */
export type FinishReason =
  | 'length'
  | 'stop'
  | 'eos'
  | 'content_filter'
  | 'unknown';

export type CompletionResultSnapshot = {
  tokensCached: number;
  tokensEvaluated: number;
  tokensPredicted: number;
  contextFull: boolean;
  finishReason: FinishReason;
};

/**
 * Ratio of `(cached + evaluated + predicted) / n_ctx` at which the warning
 * variant starts firing. 0.80 gives ~410 tokens of runway on the default
 * n_ctx=2048 (roughly one average follow-up turn) — early enough to be
 * actionable, late enough to avoid noise on short chats.
 */
export const WARNING_THRESHOLD = 0.8;

/**
 * Tokens of headroom required before the sticky `context-full` variant
 * auto-clears. Absolute (not ratio) so it scales identically at small and
 * large n_ctx values.
 */
export const AUTOCLEAR_RUNWAY = 32;

/**
 * Derive a stable snapshot from the raw `CompletionResult` returned by
 * either the local llama.rn engine or the remote OpenAI engine.
 *
 * `truncationLikely` reflects the abort-catch path's tool-args parse
 * failure (the n_ctx-exhaustion smoking gun) and forces `contextFull`
 * true. Caller is responsible for passing `true` only when the catch
 * path saw `isToolArgsParseError`.
 */
export function deriveSnapshotFromResult(
  result: CompletionResult,
  truncationLikely: boolean,
): CompletionResultSnapshot {
  let finishReason: FinishReason;
  if (result.stopped_limit === 1) {
    finishReason = 'length';
  } else if (result.interrupted === true) {
    finishReason = 'content_filter';
  } else if (result.stopped_word) {
    finishReason = 'stop';
  } else if (result.stopped_eos === true) {
    finishReason = 'eos';
  } else {
    finishReason = 'unknown';
  }

  const contextFull =
    result.context_full === true ||
    result.truncated === true ||
    truncationLikely === true ||
    result.stopped_limit === 1;

  return {
    tokensCached: result.tokens_cached ?? 0,
    tokensEvaluated: result.tokens_evaluated ?? 0,
    tokensPredicted: result.tokens_predicted ?? 0,
    contextFull,
    finishReason,
  };
}

/**
 * Banner-variant value returned by the resolver. Exactly one variant
 * renders per chat frame. `kind: 'none'` means the banner shell is
 * hidden entirely.
 */
export type BannerVariant =
  | {
      kind: 'context-full';
      escalated: boolean;
      nextTierTokens: number | null;
      heavyTalent: {name: string} | null;
      /** Used/n_ctx ratio clamped to [0, 1] for the fullness meter. */
      ratio: number;
    }
  | {
      kind: 'context-warning';
      nextTierTokens: number | null;
      ratio: number;
    }
  | {kind: 'context-remote-hedged'}
  | {kind: 'html-soft-cap'}
  | {kind: 'none'};

/**
 * Sentence-terminator marks that turn off the remote weak-signal hedge.
 * Covers the eight integrated languages' primary enders. Adding to the
 * set is a single-character edit.
 */
const REMOTE_TERMINAL_PUNCT = new Set(['.', '!', '?', '。', '！', '？']);

const REMOTE_HEDGE_MIN_TOKENS = 500;

const ESCALATION_THRESHOLD = 2;

/**
 * Resolver input. Composed at the call site (ChatView) so the resolver
 * stays pure — no MobX reads, no async, no JSX.
 */
export interface BannerVariantContext {
  snapshot: CompletionResultSnapshot | null;
  effectiveNCtx: number;
  isRemote: boolean;
  htmlPreviewCount: number;
  consecutiveFullFailures: number;
  /** `${sessionId}:${variant}` keys; resolver returns 'none' when the
   *  candidate variant key is present. */
  dismissedKeys: Set<string>;
  sessionId: string | null;
  /** Pre-computed by the caller via memory-aware tier picker. `null` =
   *  no next tier fits memory or session is remote. */
  nextTierTokens: number | null;
  /** Final visible content of the newest assistant message (via
   *  `derivedText`); used only by the remote weak-signal heuristic. */
  lastAssistantText: string;
  /** Newest assistant turn — used only by the heavy-talent sub-copy
   *  scan when the resolved variant is `context-full`. `undefined` for
   *  legacy `text` rows or fresh sessions. */
  lastAssistantTurn?: MessageType.AssistantTurn;
}

/**
 * Pure resolver. Returns exactly ONE banner variant per render in the
 * precedence order context-full -> context-warning -> remote-hedged
 * -> html-soft-cap -> none. Caller maps the variant to the right
 * l10n key set and renders the shared banner shell.
 */
export function resolveBannerVariant(ctx: BannerVariantContext): BannerVariant {
  const snap = ctx.snapshot;

  // Fullness ratio used by both the warning and full variants for the
  // banner meter. Remote sessions don't surface a meter.
  const used = snap
    ? snap.tokensCached + snap.tokensEvaluated + snap.tokensPredicted
    : 0;
  const ratio =
    ctx.effectiveNCtx > 0 ? Math.min(1, used / ctx.effectiveNCtx) : 0;

  if (snap !== null && snap.contextFull) {
    // Sticky variant — no dismiss affordance, no Set lookup.
    return {
      kind: 'context-full',
      escalated: ctx.consecutiveFullFailures >= ESCALATION_THRESHOLD,
      nextTierTokens: ctx.isRemote ? null : ctx.nextTierTokens,
      heavyTalent: ctx.isRemote ? null : findHeavyTalent(ctx.lastAssistantTurn),
      ratio: ctx.isRemote ? 0 : 1,
    };
  }

  if (snap !== null && !ctx.isRemote) {
    const warning = ratio >= WARNING_THRESHOLD;
    if (
      warning &&
      !(
        ctx.sessionId &&
        ctx.dismissedKeys.has(`${ctx.sessionId}:context-warning`)
      )
    ) {
      return {
        kind: 'context-warning',
        nextTierTokens: ctx.nextTierTokens,
        ratio,
      };
    }
  }

  if (
    snap !== null &&
    ctx.isRemote &&
    shouldHedgeRemote(snap, ctx.lastAssistantText)
  ) {
    if (
      !(
        ctx.sessionId &&
        ctx.dismissedKeys.has(`${ctx.sessionId}:context-remote-hedged`)
      )
    ) {
      return {kind: 'context-remote-hedged'};
    }
  }

  if (
    ctx.htmlPreviewCount >= 4 &&
    !(ctx.sessionId && ctx.dismissedKeys.has(`${ctx.sessionId}:html-soft-cap`))
  ) {
    return {kind: 'html-soft-cap'};
  }

  return {kind: 'none'};
}

function shouldHedgeRemote(
  snap: CompletionResultSnapshot,
  lastAssistantText: string,
): boolean {
  if (snap.finishReason === 'length') {
    return false;
  }
  if (snap.tokensPredicted < REMOTE_HEDGE_MIN_TOKENS) {
    return false;
  }
  const trimmed = lastAssistantText.trimEnd();
  if (trimmed.length === 0) {
    return false;
  }
  const lastChar = trimmed[trimmed.length - 1];
  return !REMOTE_TERMINAL_PUNCT.has(lastChar);
}

/**
 * Scan the newest assistant turn for a tool call whose talent declares
 * `recommendedContextTokens`. First match wins (turns rarely call more
 * than one heavy talent in the same step). Returns `null` when nothing
 * matches or the field is unset.
 */
function findHeavyTalent(
  turn: MessageType.AssistantTurn | undefined,
): {name: string} | null {
  if (!turn?.steps) {
    return null;
  }
  for (const step of turn.steps) {
    if (!step.toolCalls) {
      continue;
    }
    for (const call of step.toolCalls) {
      const name = call.function?.name;
      if (!name) {
        continue;
      }
      const engine = talentRegistry.get(name);
      if (engine?.recommendedContextTokens) {
        return {name};
      }
    }
  }
  return null;
}

/**
 * Single source of truth for the precedence rule between
 * session-scoped overrides and the global `contextInitParams.n_ctx`.
 * Both the banner resolver and `ModelStore.getEffectiveContextInitParams`
 * call this with the same Map so the two never disagree.
 */
export function effectiveNCtx(
  overrides: Map<string, number>,
  activeSessionId: string | null,
  baseNCtx: number,
): number {
  if (activeSessionId && overrides.has(activeSessionId)) {
    return overrides.get(activeSessionId)!;
  }
  return baseNCtx;
}

/**
 * Quantised n_ctx steps offered by the "Increase context" CTA. Tiers
 * grow by 2x so the UX matches user mental models of "double the room"
 * without exposing every llama.cpp valid value.
 */
export const CONTEXT_TIERS = [2048, 4096, 8192, 16384, 32768] as const;

/**
 * Finer-grained ladder used by the IncreaseContextSheet slider — gives
 * the user agency beyond the doubling banner-CTA tiers. The slider clamps
 * to `min(CONTEXT_LADDER[last], model.ggufMetadata.context_length)`.
 */
export const CONTEXT_LADDER = [
  2048, 4096, 6144, 8192, 12288, 16384, 24576, 32768, 49152, 65536, 98304,
  131072,
] as const;

/**
 * Find the smallest tier strictly greater than `currentNCtx` that the
 * memory check accepts. Returns `null` when no tier fits. The caller
 * supplies the predicate (typically `hasEnoughMemoryWithNCtx`) so the
 * resolver module stays free of MobX / device dependencies.
 */
export async function pickNextTier(
  currentNCtx: number,
  fitsMemory: (nCtx: number) => Promise<boolean>,
): Promise<number | null> {
  for (const tier of CONTEXT_TIERS) {
    if (tier <= currentNCtx) {
      continue;
    }
    if (await fitsMemory(tier)) {
      return tier;
    }
  }
  return null;
}
