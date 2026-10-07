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
  error?: string;
  data?: {
    markdown?: string;
    metadata?: {title?: string};
  } | null;
}

// A scrape renders the page server-side, so it needs longer than the 12s default.
const SCRAPE_SERVER_TIMEOUT_MS = 25000;
const SCRAPE_CLIENT_TIMEOUT_MS = 30000;

export class FirecrawlProvider implements SearchProvider {
  readonly id = 'firecrawl' as const;

  constructor(private getKey: () => string) {}

  async search(query: string, opts: SearchOptions): Promise<SearchHit[]> {
    const key = requireKey(this.getKey(), 'Firecrawl');
    const data = await fetchJson<FirecrawlSearchResponse>(
      'https://api.firecrawl.dev/v2/search',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          query,
          limit: opts.maxResults,
          origin: 'pocketpal',
        }),
      },
    );
    return (data.data?.web ?? []).map(r => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: r.description ?? '',
    }));
  }

  async read(url: string): Promise<PageContent> {
    const key = requireKey(this.getKey(), 'Firecrawl');
    const res = await fetchJson<FirecrawlScrapeResponse>(
      'https://api.firecrawl.dev/v2/scrape',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          url,
          formats: ['markdown'],
          onlyMainContent: true,
          timeout: SCRAPE_SERVER_TIMEOUT_MS,
          origin: 'pocketpal',
        }),
      },
      SCRAPE_CLIENT_TIMEOUT_MS,
    );
    if (res.success !== true || !res.data) {
      throw new Error(res.error || 'scrape failed');
    }
    return {
      url,
      ...(res.data.metadata?.title ? {title: res.data.metadata.title} : {}),
      text: res.data.markdown ?? '',
    };
  }
}
