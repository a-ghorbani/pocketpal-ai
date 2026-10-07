import type {
  SearchProvider,
  SearchHit,
  SearchOptions,
  PageContent,
} from '../types';
import {fetchJson, requireKey} from './http';

interface FirecrawlWebResult {
  title?: string;
  url?: string;
  description?: string;
}

interface FirecrawlSearchResponse {
  data?: {web?: FirecrawlWebResult[]} | null;
}

interface FirecrawlScrapeResponse {
  success?: boolean;
  data?: {
    markdown?: string;
    metadata?: {title?: string; statusCode?: number};
  } | null;
}

const SCRAPE_SERVER_TIMEOUT_MS = 10000;

export class FirecrawlProvider implements SearchProvider {
  readonly id = 'firecrawl' as const;

  constructor(private getKey: () => string) {}

  async search(query: string, opts: SearchOptions): Promise<SearchHit[]> {
    const data = await this.post<FirecrawlSearchResponse>('/search', {
      query,
      limit: opts.maxResults,
    });
    return (data.data?.web ?? []).map(r => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: r.description ?? '',
    }));
  }

  async read(url: string): Promise<PageContent> {
    const res = await this.post<FirecrawlScrapeResponse>('/scrape', {
      url,
      formats: ['markdown'],
      onlyMainContent: true,
      timeout: SCRAPE_SERVER_TIMEOUT_MS,
    });
    if (res.success !== true || !res.data) {
      throw new Error('scrape failed');
    }
    const code = res.data.metadata?.statusCode;
    if (code !== undefined && code >= 400) {
      throw new Error(`page returned ${code}`);
    }
    return {
      url,
      ...(res.data.metadata?.title ? {title: res.data.metadata.title} : {}),
      text: res.data.markdown ?? '',
    };
  }

  private post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const key = requireKey(this.getKey(), 'Firecrawl');
    return fetchJson<T>(`https://api.firecrawl.dev/v2${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({...body, origin: 'pocketpal'}),
    });
  }
}
