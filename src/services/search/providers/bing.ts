import type {SearchProvider, SearchHit, SearchOptions} from '../types';
import {fetchText} from './http';

/**
 * Keyless Bing web search.
 *
 * The device's own connection is the only credential — there is no BYOK entry
 * to fill in, which is the point: a user who just installed the app can search
 * without signing up for anything. Bing serves server-rendered results for a
 * plain GET with a mobile UA (no JS challenge), verified 2026-10-20 across
 * multiple queries: HTTP 200 with 10 `b_algo` blocks each time.
 *
 * Parsing is regex-based because RN has no DOM parser. That makes this adapter
 * structurally more brittle than the JSON providers, so a markup change or an
 * interstitials page surfaces as a thrown error — per the provider contract,
 * never a silent empty result. Bing's HTML also has no reliable per-result
 * date field, so hits carry no `publishedAt`.
 */

const MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';

const BLOCK_RE = /<li class="b_algo[^>]*>([\s\S]*?)<\/li>/g;
const HREF_RE = /href="(https?:\/\/[^"]+)"/;
const TITLE_RE = /<h2[^>]*>([\s\S]*?)<\/h2>/;
const SNIPPET_RE = /<p[^>]*>([\s\S]*?)<\/p>/;

const codePointOrBlank = (code: number): string =>
  Number.isFinite(code) && code >= 0 && code <= 0x10ffff
    ? String.fromCodePoint(code)
    : '';

const decodeEntities = (input: string): string =>
  input
    .replace(/&#x([0-9a-fA-F]+);/gi, (_, hex) =>
      codePointOrBlank(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec) => codePointOrBlank(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'");

const toText = (html: string): string =>
  decodeEntities(html.replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();

/** Exported for tests only — the adapter itself never needs it directly. */
export const parseBingResults = (html: string): SearchHit[] => {
  const hits: SearchHit[] = [];
  const blocks = html.match(BLOCK_RE) ?? [];
  for (const block of blocks) {
    const url = block.match(HREF_RE)?.[1];
    // A block without a resolvable http(s) target is an ad/suggestion card,
    // not a web result — skip rather than emit a hit the model can't cite.
    if (!url) {
      continue;
    }
    const title = block.match(TITLE_RE)?.[1];
    const snippet = block.match(SNIPPET_RE)?.[1];
    hits.push({
      title: title ? toText(title) : url,
      url,
      snippet: snippet ? toText(snippet) : '',
    });
  }
  return hits;
};

export class BingProvider implements SearchProvider {
  readonly id = 'bing' as const;

  /** Keyless by construction: there is no key to inject. */
  async search(
    query: string,
    opts: SearchOptions,
    signal?: AbortSignal,
  ): Promise<SearchHit[]> {
    const url =
      `https://www.bing.com/search?q=${encodeURIComponent(query)}` +
      `&count=${opts.maxResults}&mkt=en-US`;
    const html = await fetchText(
      url,
      {
        method: 'GET',
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
          'User-Agent': MOBILE_UA,
        },
        signal,
      },
      12000,
    );
    const hits = parseBingResults(html).slice(0, opts.maxResults);
    if (hits.length === 0) {
      throw new Error(
        'Bing returned no parseable results (blocked or markup changed)',
      );
    }
    return hits;
  }
}
