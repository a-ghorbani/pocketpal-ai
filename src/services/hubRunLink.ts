/**
 * Parser for the `pocketpal://hub/run` deep link.
 *
 * This is the single parse/validate site for the hub/run route. Both delivery
 * paths (iOS native emitter, Android prod Linking) call it on a raw URL string.
 * It does not extend DeepLinkService.parseURL.
 */

export interface HubRunRequest {
  repoId: string; // "author/model"
  filename: string; // "*.gguf"
  source: string | undefined; // optional attribution tag, e.g. "hf"
}

const isValidRepoId = (value: string): boolean => {
  const parts = value.split('/');
  return parts.length === 2 && parts[0].length > 0 && parts[1].length > 0;
};

const isGgufFilename = (value: string): boolean =>
  value.toLowerCase().endsWith('.gguf');

/**
 * Parses and validates a `pocketpal://hub/run?repo_id=…&filename=…&source=…`
 * URL. Returns a HubRunRequest on success, or null on any failure (unknown
 * host/path, missing or malformed params). Never throws, never mutates state.
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

  const filename = (parsed.searchParams.get('filename') || '').trim();
  if (!filename || !isGgufFilename(filename)) {
    return null;
  }

  const source = parsed.searchParams.get('source') || undefined;

  return {repoId, filename, source};
};
