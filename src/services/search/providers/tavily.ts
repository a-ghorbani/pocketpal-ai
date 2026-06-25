import type {SearchProvider, SearchHit, SearchOptions} from '../types';
import {fetchJson, requireKey} from './http';

interface TavilyResult {
  title?: string;
  url?: string;
  content?: string;
  published_date?: string;
}

interface TavilyResponse {
  results?: TavilyResult[];
}

/**
 * Tavily adapter. Requests `basic` content (the smallest faithful body field)
 * and maps it to `SearchHit.snippet`; never pulls full page bodies for search.
 */
export class TavilyProvider implements SearchProvider {
  readonly id = 'tavily' as const;

  constructor(private getKey: () => string) {}

  async search(query: string, opts: SearchOptions): Promise<SearchHit[]> {
    const key = requireKey(this.getKey(), 'Tavily');
    const data = await fetchJson<TavilyResponse>(
      'https://api.tavily.com/search',
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          api_key: key,
          query,
          max_results: opts.maxResults,
          search_depth: 'basic',
        }),
      },
    );
    return (data.results ?? []).map(r => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: r.content ?? '',
      ...(r.published_date ? {publishedAt: r.published_date} : {}),
    }));
  }
}
