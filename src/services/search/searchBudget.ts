/**
 * The single on-device budgeting enforcement point for internet-search talents.
 *
 * Pure module — no network, no Keychain, no provider choice. Both `web_search`
 * and `read_url` engines call this so the cap / strip / truncate / token-ceiling
 * / cache rules live in exactly one place.
 */

import type {
  SearchHit,
  PageContent,
  SearchProviderId,
  SearchBudget,
} from './types';

/** Rough token estimate: ~4 chars per token, the common heuristic. */
const CHARS_PER_TOKEN = 4;

const estimateTokens = (text: string): number =>
  Math.ceil(text.length / CHARS_PER_TOKEN);

/**
 * Strip HTML/markdown markup and collapse whitespace to plain text. URLs are
 * never passed through here — they are kept verbatim on the hit.
 */
const toPlainText = (raw: string): string =>
  raw
    .replace(/<[^>]*>/g, ' ') // HTML tags
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ') // markdown images
    .replace(/\[([^\]]*)]\([^)]*\)/g, '$1') // markdown links → label
    .replace(/[*_`#>~]+/g, ' ') // markdown emphasis / heading markers
    .replace(/\s+/g, ' ')
    .trim();

/** Drop a trailing unpaired high surrogate so a slice never splits an emoji. */
const stripTrailingHighSurrogate = (text: string): string => {
  const last = text.charCodeAt(text.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) {
    return text.slice(0, -1);
  }
  return text;
};

/**
 * Truncate to at most `maxChars` on a word boundary — never mid-word. Returns
 * the text unchanged when it already fits. For space-less scripts (CJK/Thai)
 * the cut falls back to a character boundary, never splitting a surrogate pair.
 */
const truncateOnWordBoundary = (text: string, maxChars: number): string => {
  if (maxChars <= 0) {
    return '';
  }
  if (text.length <= maxChars) {
    return text;
  }
  const slice = text.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(' ');
  const cut =
    lastSpace > 0
      ? slice.slice(0, lastSpace)
      : stripTrailingHighSurrogate(slice);
  return `${cut.trimEnd()}…`;
};

/**
 * Apply the budgeting invariants to raw provider hits, in order:
 * 1. cap result count, 2. strip to plain text (keep url), 3. word-boundary
 * snippet cap, 4. assemble hit-by-hit dropping trailing hits past the token
 * ceiling (never mid-fact).
 */
export const budgetHits = (
  hits: SearchHit[],
  budget: SearchBudget,
): SearchHit[] => {
  const capped = hits.slice(0, Math.max(0, budget.maxResults));

  const cleaned: SearchHit[] = capped.map(hit => ({
    title: toPlainText(hit.title),
    url: hit.url,
    snippet: truncateOnWordBoundary(
      toPlainText(hit.snippet),
      budget.perSnippetChars,
    ),
    ...(hit.publishedAt ? {publishedAt: hit.publishedAt} : {}),
  }));

  const out: SearchHit[] = [];
  let usedTokens = 0;
  for (const hit of cleaned) {
    const hitTokens = estimateTokens(
      `${hit.title}\n${hit.url}\n${hit.snippet}\n${hit.publishedAt ?? ''}`,
    );
    if (out.length > 0 && usedTokens + hitTokens > budget.tokenCeiling) {
      break; // drop trailing hits whole — never truncate a hit mid-fact
    }
    out.push(hit);
    usedTokens += hitTokens;
  }
  return out;
};

/**
 * Bound a full-page read to the token ceiling, keeping the leading content and
 * dropping the tail on a word boundary.
 */
export const budgetPage = (
  page: PageContent,
  tokenCeiling: number,
): PageContent => {
  const text = toPlainText(page.text);
  const maxChars = Math.max(0, tokenCeiling) * CHARS_PER_TOKEN;
  return {
    url: page.url,
    ...(page.title ? {title: toPlainText(page.title)} : {}),
    text: truncateOnWordBoundary(text, maxChars),
  };
};

/**
 * In-session cache for identical `(providerId, query, maxResults)` searches.
 * Module-scoped and ephemeral — cleared on app restart, on any key / consent /
 * provider change (via `resetSearchCache`), and via the test hook. Bounded by
 * `MAX_CACHE_ENTRIES` with oldest-key (insertion-order) eviction so it can't
 * grow unbounded over a long session.
 *
 * The BYOK key is deliberately NOT part of the cache key — invalidation on key
 * change is explicit (`resetSearchCache`) so a secret never lands in a key.
 */
const MAX_CACHE_ENTRIES = 50;
const searchCache = new Map<string, SearchHit[]>();

const cacheKey = (
  providerId: SearchProviderId,
  query: string,
  maxResults: number,
): string => `${providerId}::${maxResults}::${query}`;

export const getCachedHits = (
  providerId: SearchProviderId,
  query: string,
  maxResults: number,
): SearchHit[] | undefined =>
  searchCache.get(cacheKey(providerId, query, maxResults));

export const setCachedHits = (
  providerId: SearchProviderId,
  query: string,
  maxResults: number,
  hits: SearchHit[],
): void => {
  const key = cacheKey(providerId, query, maxResults);
  // Re-insert moves the key to newest so eviction stays LRU-ish on overwrite.
  searchCache.delete(key);
  searchCache.set(key, hits);
  if (searchCache.size > MAX_CACHE_ENTRIES) {
    const oldest = searchCache.keys().next().value;
    if (oldest !== undefined) {
      searchCache.delete(oldest);
    }
  }
};

/** Test hook: clear the in-session cache. */
export const resetSearchCache = (): void => {
  searchCache.clear();
};
