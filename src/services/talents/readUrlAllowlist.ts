// Run-scoped allowlist guarding read_url against prompt-injected exfiltration:
// only URLs the model legitimately saw — web_search hits and user-written
// text — may be fetched. Injected page content can name a URL, but it never
// enters this set, and appending data to an allowed URL fails exact match.
// Assumes one agent run at a time; reset and reseeded at each run start.

const allowed = new Set<string>();

// Canonicalize via URL (drops the fragment; normalizes host case and the
// bare-origin trailing slash) so trivial model transcription noise still
// matches, while any query/path mutation does not.
const normalize = (raw: string): string | null => {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }
  parsed.hash = '';
  return parsed.toString();
};

export function resetReadUrlAllowlist(): void {
  allowed.clear();
}

export function allowReadUrls(urls: Iterable<string>): void {
  for (const url of urls) {
    const normalized = normalize(url);
    if (normalized) {
      allowed.add(normalized);
    }
  }
}

export function isReadUrlAllowed(url: string): boolean {
  const normalized = normalize(url);
  return normalized !== null && allowed.has(normalized);
}

const URL_PATTERN = /https?:\/\/[^\s"'<>)\]}]+/gi;

/** Extract http(s) URLs from free text (used to seed from user messages). */
export function extractUrls(text: string): string[] {
  const matches = text.match(URL_PATTERN) ?? [];
  return matches.map(url => url.replace(/[.,;:!?]+$/, ''));
}
