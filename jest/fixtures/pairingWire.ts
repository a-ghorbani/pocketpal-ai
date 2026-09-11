/**
 * Wire bodies the pairing probe reads, beyond the `/v1/models` shapes already
 * held by `remoteModelList.ts`.
 *
 * The first two are verbatim, untrimmed captures from `llama-server` build
 * **9976 (e3546c794)**, piped straight to file — no key reordered, no
 * whitespace tidied, and neither body carries a trailing newline. Reproduce:
 *
 *   llama-server --api-key sk-test ...
 *   curl -s http://127.0.0.1:9931/props            # 401 envelope below
 *   curl -s http://127.0.0.1:9931/health           # health body below
 *
 * The third is CONSTRUCTED, not captured — see its own note.
 */

/** Verbatim: the 401 envelope a gated endpoint returns with no or a wrong key. */
export const authErrorBody = {
  error: {
    message: 'Invalid API Key',
    type: 'authentication_error',
    code: 401,
  },
};

/** Verbatim: `GET /health` on a running server. */
export const healthOkBody = {status: 'ok'};

/**
 * CONSTRUCTED, not captured. No server we measured emits a zero-row
 * `/v1/models` — the minimal router still returns one synthetic `default`
 * row — so this body is written to exercise the empty-list branch, which
 * exists to keep "we read a real, empty list" distinguishable from "we could
 * not read the response".
 *
 * Assert only that `data` is an array: the sibling keys, their order and any
 * row content are unpinned, so a real empty server turning up slightly
 * differently upgrades this fixture rather than failing as a regression.
 */
export const constructedEmptyModelsBody = {data: []};
