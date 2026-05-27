import type {CompletionResult} from './completionTypes';

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
