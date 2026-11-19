import type {
  SearchProvider,
  SearchHit,
  SearchOptions,
  PageContent,
} from '../types';
import {fetchJson, requireKey} from './http';

interface OutcrawlSearchHit {
  title?: string;
  url?: string;
  snippet?: string;
}

interface OutcrawlSearchResponse {
  hits?: OutcrawlSearchHit[] | null;
}

interface OutcrawlScrapeResponse {
  statusCode?: number;
  markdown?: string;
  metadata?: {title?: string};
}

export class OutcrawlProvider implements SearchProvider {
  readonly id = 'outcrawl' as const;

  constructor(private getKey: () => string) {}

  async search(
    query: string,
    opts: SearchOptions,
    signal?: AbortSignal,
  ): Promise<SearchHit[]> {
    const res = await this.post<OutcrawlSearchResponse | null>(
      '/search',
      {query, limit: opts.maxResults},
      {retryOn429: true, signal},
    );
    if (!Array.isArray(res?.hits)) {
      throw new Error('unexpected response');
    }
    return res.hits.map(r => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: r.snippet ?? '',
    }));
  }

  async read(url: string, signal?: AbortSignal): Promise<PageContent> {
    const res = await this.post<OutcrawlScrapeResponse | null>(
      '/scrape',
      {url, formats: ['markdown'], onlyMainContent: true},
      {signal},
    );
    if (!res || typeof res !== 'object') {
      throw new Error('scrape failed');
    }
    const code = res.statusCode;
    if (code !== undefined && code >= 400) {
      throw new Error(`page returned ${code}`);
    }
    return {
      url,
      ...(res.metadata?.title ? {title: res.metadata.title} : {}),
      text: res.markdown ?? '',
    };
  }

  private post<T>(
    path: string,
    body: Record<string, unknown>,
    {retryOn429, signal}: {retryOn429?: boolean; signal?: AbortSignal} = {},
  ): Promise<T> {
    const key = requireKey(this.getKey(), 'Outcrawl');
    return fetchJson<T>(
      `https://api.outcrawl.ai/v1${path}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
        signal,
      },
      {retryOn429},
    );
  }
}
