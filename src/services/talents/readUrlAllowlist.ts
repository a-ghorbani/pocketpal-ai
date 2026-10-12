// Run-scoped allowlist guarding read_url against prompt-injected exfiltration:
// only URLs the model legitimately saw — web_search hits and user-written
// text — may be fetched. Injected page content can name a URL, but it never
// enters this set, and appending data to an allowed URL fails exact match.
// Assumes one agent run at a time; reset and reseeded at each run start.

const allowed = new Set<string>();

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

export function resetReadUrlAllowlist(): void {
  allowed.clear();
}

export function allowReadUrls(urls: Iterable<string>): void {
  for (const url of urls) {
    const canonical = canonicalize(url);
    if (canonical) {
      allowed.add(canonical.toString());
    }
  }
}

const WWW = 'www.';

// IP-like hosts never toggle `www.`: the RN polyfill parses `www.1.2.3.4` as a domain.
const isWwwEligible = (host: string): boolean => {
  const lastLabel = host.split('.').filter(Boolean).pop() ?? '';
  return !host.startsWith('[') && /[^0-9]/.test(lastLabel);
};

const siteKey = (host: string): string =>
  host.startsWith(WWW) ? host.slice(WWW.length) : host;

const wwwPartner = (canonical: URL): string | null => {
  const host = canonical.hostname;
  if (!isWwwEligible(host)) {
    return null;
  }
  const key = siteKey(host);
  if (key !== host && key.startsWith(WWW)) {
    return null;
  }
  const target = key === host ? WWW + host : key;
  const partner = new URL(canonical.toString());
  partner.hostname = target;
  return partner.hostname === target ? partner.toString() : null;
};

export function matchReadUrl(url: string): string | null {
  const canonical = canonicalize(url);
  if (!canonical) {
    return null;
  }
  const exact = canonical.toString();
  if (allowed.has(exact)) {
    return exact;
  }
  const partner = wwwPartner(canonical);
  return partner !== null && allowed.has(partner) ? partner : null;
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
