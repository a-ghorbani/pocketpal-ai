/**
 * Verbatim `timings` object from a llama-server SSE finish chunk, captured on a
 * cache-reuse turn: `prompt_n` counts only the newly evaluated tokens and
 * `cache_n` the reused prefix, so the prompt total is their sum. All nine keys
 * are as they arrived — a stand-in trimmed to the fields a reader finds
 * interesting would test the parser against a shape no server emits.
 *
 * Captured from llama-server build `b9976-e3546c794` (2026-07-11, Linux
 * aarch64). Every wire fact here was observed on that one build; cross-build
 * generalisation is unverified.
 *
 * Upstream's own `timings` assertions (`test_completion.py:659`,
 * `test_kv_keep_only_active.py:80`) run against the native `POST /completion`
 * and read the response body non-streaming, while this app reads the
 * OpenAI-compatible endpoint's SSE finish chunk — a different endpoint and a
 * different envelope. Upstream does not cover this path, and this capture is
 * the app's own rather than a copy of theirs.
 */
export const cacheReuseTimings = {
  cache_n: 31,
  prompt_n: 1,
  prompt_ms: 6.454,
  prompt_per_token_ms: 6.454,
  prompt_per_second: 154.94267121165169,
  predicted_n: 3,
  predicted_ms: 12.9,
  predicted_per_token_ms: 4.3,
  predicted_per_second: 232.5581395348837,
};
