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
