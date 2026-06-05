/**
 * Parser for the `pocketpal://hub/run` deep link.
 *
 * This is the single parse/validate site for the hub/run route. Both delivery
 * paths (iOS native emitter, Android prod Linking) call it on a raw URL string.
 * It does not extend DeepLinkService.parseURL.
 *
 * Only `repo_id` is load-bearing: it gates acceptance and drives resolution.
 * `filename` is optional and never gates acceptance — the landing sheet lists
 * the full repo and the user picks a file; the parsed value is kept only for
 * future attribution use.
 */

export interface HubRunRequest {
  repoId: string; // "author/model"
  filename: string | undefined; // optional; kept for attribution, not load-bearing
  source: string | undefined; // optional attribution tag, e.g. "hf"
}

const isValidRepoId = (value: string): boolean => {
  const parts = value.split('/');
  return parts.length === 2 && parts[0].length > 0 && parts[1].length > 0;
};

/**
 * Parses and validates a `pocketpal://hub/run?repo_id=…&filename=…&source=…`
 * URL. Returns a HubRunRequest on success, or null on any failure (unknown
 * host/path, missing or malformed `repo_id`). A missing or non-`.gguf`
 * `filename` is a normal success — it is trimmed and stored if present, else
 * left undefined. Never throws, never mutates state.
 */
export const parseHubRunURL = (url: string): HubRunRequest | null => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.hostname !== 'hub') {
    return null;
  }

  const path = parsed.pathname.replace(/^\/+/, '');
  if (path !== 'run') {
    return null;
  }

  const repoId = (parsed.searchParams.get('repo_id') || '').trim();
  if (!repoId || !isValidRepoId(repoId)) {
    return null;
  }

  const rawFilename = (parsed.searchParams.get('filename') || '').trim();
  const filename = rawFilename || undefined;

  const source = parsed.searchParams.get('source') || undefined;

  return {repoId, filename, source};
};
