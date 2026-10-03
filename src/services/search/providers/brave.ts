import type {SearchProvider, SearchHit, SearchOptions} from '../types';
import {fetchJson, requireKey} from './http';

interface BraveResult {
  title?: string;
  url?: string;
  description?: string;
  page_age?: string;
}

interface BraveResponse {
  web?: {results?: BraveResult[]};
}

export class BraveProvider implements SearchProvider {
  readonly id = 'brave' as const;

  constructor(private getKey: () => string) {}

  async search(query: string, opts: SearchOptions): Promise<SearchHit[]> {
    const key = requireKey(this.getKey(), 'Brave');
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(
      query,
    )}&count=${opts.maxResults}`;
    const data = await fetchJson<BraveResponse>(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': key,
      },
    });
    return (data.web?.results ?? []).map(r => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: r.description ?? '',
      ...(r.page_age ? {publishedAt: r.page_age} : {}),
    }));
  }
}
