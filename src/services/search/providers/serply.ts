import type {SearchProvider, SearchHit, SearchOptions} from '../types';
import {fetchJson, requireKey} from './http';

interface SerplyResult {
  title?: string;
  link?: string;
  description?: string;
}

interface SerplyResponse {
  results?: SerplyResult[];
}

const hasPageUrl = (r: SerplyResult): r is SerplyResult & {link: string} =>
  !!r.link && /^https?:\/\//i.test(r.link);

export class SerplyProvider implements SearchProvider {
  readonly id = 'serply' as const;

  constructor(private getKey: () => string) {}

  async search(
    query: string,
    opts: SearchOptions,
    signal?: AbortSignal,
  ): Promise<SearchHit[]> {
    const key = requireKey(this.getKey(), 'Serply');
    const url = `https://api.serply.io/v1/search?q=${encodeURIComponent(
      query,
    )}&num=${opts.maxResults}`;
    const data = await fetchJson<SerplyResponse | null>(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Api-Key': key,
        'User-Agent': 'pocketpal',
      },
      signal,
    });
    const results = data?.results;
    if (!Array.isArray(results)) {
      throw new Error('unexpected response');
    }
    // `num` caps the Google page loosely, so trim to the budget; drop rows without a page URL.
    return results
      .filter(hasPageUrl)
      .slice(0, opts.maxResults)
      .map(r => ({
        title: r.title ?? '',
        url: r.link,
        snippet: r.description ?? '',
      }));
  }
}
