// Run-scoped allowlist guarding read_url against prompt-injected exfiltration:
// only URLs the model legitimately saw — web_search hits and user-written
// text — may be fetched. Injected page content can name a URL, but it never
// enters this set, and appending data to an allowed URL fails exact match.
// Assumes one agent run at a time; reset and reseeded at each run start.

// Match key → stored canonical URL. A lookup only ever returns a stored
// entry, so a key collision can never fetch a string the run did not allow.
const allowed = new Map<string, string>();

// The RN URL polyfill does not lowercase hosts, so ASCII case is folded here.
const canonicalize = (raw: string): URL | null => {
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
  if (/[A-Z]/.test(parsed.hostname)) {
    parsed.hostname = parsed.hostname.replace(/[A-Z]/g, c => c.toLowerCase());
  }
  return parsed;
};

const matchKey = (url: URL): string =>
  url.protocol +
  '//' +
  url.hostname.replace(/^www\./, '') +
  (url.port ? ':' + url.port : '') +
  url.pathname +
  url.search;

export function resetReadUrlAllowlist(): void {
  allowed.clear();
}

export function allowReadUrls(urls: Iterable<string>): void {
  for (const url of urls) {
    const canonical = canonicalize(url);
    if (canonical && !canonical.username && !canonical.password) {
      allowed.set(matchKey(canonical), canonical.toString());
    }
  }
}

export function matchReadUrl(url: string): string | null {
  const canonical = canonicalize(url);
  return canonical ? (allowed.get(matchKey(canonical)) ?? null) : null;
}

export function isReadUrlAllowed(url: string): boolean {
  return matchReadUrl(url) !== null;
}

const URL_PATTERN = /https?:\/\/[^\s"'<>)\]}]+/gi;

/** Extract http(s) URLs from free text (used to seed from user messages). */
export function extractUrls(text: string): string[] {
  const matches = text.match(URL_PATTERN) ?? [];
  return matches.map(url => url.replace(/[.,;:!?]+$/, ''));
}

/**
 * Run-start seed — the single place that defines what counts as a trusted URL
 * source: user-written message text and structured `{type:'search'}` hit URLs
 * from this session's persisted turns. Never assistant text and never
 * tool-message text (page bodies are untrusted). Live hits register in
 * WebSearchEngine as searches complete.
 *
 * Parameters are structural so chat code can pass its own message shapes
 * without this module importing them.
 */
export function seedReadUrlAllowlist(
  assembledMessages: Array<{role: string; content?: unknown}>,
  sessionRows: Array<{
    type?: string;
    steps?: Array<{
      toolOutcomes?: Array<{
        result?: {type: string; results?: {url: string}[]};
      }>;
    }>;
  }>,
): void {
  resetReadUrlAllowlist();
  for (const msg of assembledMessages) {
    if (msg.role !== 'user') {
      continue;
    }
    if (typeof msg.content === 'string') {
      allowReadUrls(extractUrls(msg.content));
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part?.type === 'text' && typeof part.text === 'string') {
          allowReadUrls(extractUrls(part.text));
        }
      }
    }
  }
  for (const row of sessionRows) {
    if (row.type !== 'assistant_turn') {
      continue;
    }
    for (const step of row.steps ?? []) {
      for (const outcome of step.toolOutcomes ?? []) {
        if (outcome.result?.type === 'search') {
          allowReadUrls((outcome.result.results ?? []).map(r => r.url));
        }
      }
    }
  }
}
