/** Single budgeting enforcement point for search talents — pure (no network/Keychain). */

import type {
  SearchHit,
  PageContent,
  SearchProviderId,
  SearchBudget,
} from './types';

/** ~4 chars per token (rough heuristic). */
const CHARS_PER_TOKEN = 4;

export const estimateTokens = (text: string): number =>
  Math.ceil(text.length / CHARS_PER_TOKEN);

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

/** Word-boundary cut; for space-less scripts (CJK/Thai) falls back to a char
 *  boundary, never splitting a surrogate pair. */
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

// Per-field caps so no single provider-controlled field (title/URL) can blow
// the token ceiling; a clamped legit hit always fits. URLs are dropped rather
// than truncated — a cut URL would be uncopyable for read_url.
const TITLE_MAX_CHARS = 200;
const URL_MAX_CHARS = 2048;

/**
 * `renderHit` must be the exact renderer fed to the model: the token ceiling is
 * charged against rendered text (markup/indentation count).
 */
export const budgetHits = (
  hits: SearchHit[],
  budget: SearchBudget,
  renderHit: (hit: SearchHit) => string,
): SearchHit[] => {
  const capped = hits
    .filter(hit => hit.url.length <= URL_MAX_CHARS)
    .slice(0, Math.max(0, budget.maxResults));

  const cleaned: SearchHit[] = capped.map(hit => ({
    title: truncateOnWordBoundary(toPlainText(hit.title), TITLE_MAX_CHARS),
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
    const hitTokens = estimateTokens(renderHit(hit));
    if (usedTokens + hitTokens > budget.tokenCeiling) {
      break; // drop hits whole (even the first) — never truncate mid-fact
    }
    out.push(hit);
    usedTokens += hitTokens;
  }
  return out;
};

export const budgetPage = (
  page: PageContent,
  tokenCeiling: number,
): PageContent => {
  const text = toPlainText(page.text);
  const maxChars = Math.max(0, tokenCeiling) * CHARS_PER_TOKEN;
  return {
    url: page.url,
    // Clamp the provider-controlled title like search hits do, so no single
    // untrusted field can blow the page's rendered size.
    ...(page.title
      ? {
          title: truncateOnWordBoundary(
            toPlainText(page.title),
            TITLE_MAX_CHARS,
          ),
        }
      : {}),
    text: truncateOnWordBoundary(text, maxChars),
  };
};

/**
 * The BYOK key is deliberately NOT part of the cache key — a secret must never
 * land in a key; invalidation on key change is explicit (`resetSearchCache`).
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

export const resetSearchCache = (): void => {
  searchCache.clear();
};
