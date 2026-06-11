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

// Hugging Face repo-id grammar: exactly `org/name`, each segment limited to
// safe chars. Rejects path-traversal and unsafe input at parse time.
const REPO_ID_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

const isValidRepoId = (value: string): boolean => {
  if (!REPO_ID_RE.test(value)) {
    return false;
  }
  // Reject dot-only segments (`.`, `..`) that survive the char class but are
  // path-traversal.
  return value.split('/').every(seg => seg !== '.' && seg !== '..');
};

/**
 * True only for the exact `pocketpal://hub/run` route (host=hub, path=run),
 * regardless of query payload. Gates the delivery paths so non-hub URLs and
 * unknown hub paths are ignored silently; a malformed `hub/run` payload still
 * reaches the handler (and alerts). Never throws.
 */
export const isHubLink = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === 'hub' && parsed.pathname.replace(/^\/+/, '') === 'run'
    );
  } catch {
    return false;
  }
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
