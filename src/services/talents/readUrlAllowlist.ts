import {URL_PATTERN} from '../search/searchBudget';

// Run-scoped allowlist guarding read_url against prompt-injected exfiltration.
// Sources: sites the user named (any page on that host), web_search hit URLs,
// and the `links` a read_url result carries (exact URLs). A result's `summary`
// is never parsed, so injected text can only add URLs a page visibly wrote.
// Assumes one agent run at a time; reset and reseeded at each run start.

// Match key → stored canonical URL. A lookup only ever returns a stored
// entry, so a key collision can never fetch a string the run did not allow.
const allowed = new Map<string, string>();
const userSites = new Set<string>();

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

const siteKey = (hostname: string): string => hostname.replace(/^www\./, '');

const matchKey = (url: URL): string =>
  siteKey(url.hostname) +
  (url.port ? ':' + url.port : '') +
  url.pathname.replace(/\/$/, '') +
  url.search;

export function resetReadUrlAllowlist(): void {
  allowed.clear();
  userSites.clear();
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
  if (!canonical || canonical.username || canonical.password) {
    return null;
  }
  return (
    allowed.get(matchKey(canonical)) ??
    (userSites.has(siteKey(canonical.hostname)) ? canonical.toString() : null)
  );
}

export function isReadUrlAllowed(url: string): boolean {
  return matchReadUrl(url) !== null;
}

const countOf = (text: string, char: string): number =>
  text.split(char).length - 1;

const trimUrl = (url: string): string => {
  let trimmed = url.replace(/[.,;:!?]+$/, '');
  while (
    trimmed.endsWith(')') &&
    countOf(trimmed, '(') < countOf(trimmed, ')')
  ) {
    trimmed = trimmed.slice(0, -1).replace(/[.,;:!?]+$/, '');
  }
  return trimmed;
};

/** Extract http(s) URLs from user or page text. */
export function extractUrls(text: string): string[] {
  return (text.match(URL_PATTERN) ?? []).map(trimUrl);
}

// Hermes has no \p{} escapes, so scripts and symbols are explicit ranges.
const BOUNDARY =
  /[\u00A9\u00AB\u00AE\u00BB\u2000-\u206F\u2190-\u2BFF\u3000-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uD800-\uDFFF\uFE0F\uFF00-\uFFEF]/g;
const BARE_HOST =
  /(^|[^a-z0-9@./_%\u0080-\uFFFF-])([a-z0-9\u0080-\uFFFF-]+(?:\.[a-z0-9\u0080-\uFFFF-]+)+)(?![a-z0-9@_\u0080-\uFFFF-]|\.[a-z0-9_\u0080-\uFFFF-])/gi;
const FILE_EXTENSIONS = new Set([
  'txt',
  'json',
  'md',
  'js',
  'ts',
  'py',
  'sh',
  'pdf',
  'png',
  'jpg',
  'csv',
  'html',
  'xml',
  'yml',
  'yaml',
  'log',
  'zip',
]);

const isBareHost = (host: string): boolean => {
  const labels = host.split('.');
  const tld = labels[labels.length - 1].toLowerCase();
  return (
    labels.every(
      label =>
        label.length <= 63 && !label.startsWith('-') && !label.endsWith('-'),
    ) &&
    /^(?:[a-z]{2,63}|xn--[a-z0-9-]+)$/.test(tld) &&
    !FILE_EXTENSIONS.has(tld)
  );
};

const bareHosts = (text: string): string[] =>
  [...text.replace(URL_PATTERN, ' ').replace(BOUNDARY, ' ').matchAll(BARE_HOST)]
    .map(match => match[2])
    .filter(isBareHost);

function addUserSites(text: string): void {
  const urls = [
    ...extractUrls(text).map(url => canonicalize(url)),
    ...bareHosts(text).map(host => canonicalize('https://' + host)),
  ];
  for (const url of urls) {
    if (url && !url.username && !url.password) {
      userSites.add(siteKey(url.hostname));
    }
  }
}

/**
 * Run-start seed, the single definition of trusted sources: sites from
 * user-written text, and URLs from this session's persisted search hits and
 * read_url `links`. Never assistant text, tool arguments or any `summary`.
 * Parameters are structural so chat code can pass its own message shapes.
 */
export function seedReadUrlAllowlist(
  assembledMessages: Array<{role: string; content?: unknown}>,
  sessionRows: Array<{
    type?: string;
    steps?: Array<{
      toolOutcomes?: Array<{
        toolName?: string;
        result?: {type: string; results?: {url: string}[]; links?: string[]};
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
      addUserSites(msg.content);
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part?.type === 'text' && typeof part.text === 'string') {
          addUserSites(part.text);
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
        const result = outcome.result;
        if (result?.type === 'search') {
          allowReadUrls((result.results ?? []).map(r => r.url));
        } else if (
          outcome.toolName === 'read_url' &&
          result?.type === 'text' &&
          Array.isArray(result.links)
        ) {
          allowReadUrls(result.links);
        }
      }
    }
  }
}
