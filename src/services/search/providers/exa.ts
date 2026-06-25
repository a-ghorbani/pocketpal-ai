import type {
  SearchProvider,
  SearchHit,
  SearchOptions,
  PageContent,
} from '../types';
import {fetchJson, requireKey} from './http';

interface ExaResult {
  title?: string;
  url?: string;
  highlights?: string[];
  summary?: string;
  text?: string;
  publishedDate?: string;
}

interface ExaResponse {
  results?: ExaResult[];
}

/** Pick Exa's smallest faithful body field: highlights → summary → text. */
const exaSnippet = (r: ExaResult): string => {
  if (r.highlights && r.highlights.length > 0) {
    return r.highlights.join(' ');
  }
  return r.summary ?? r.text ?? '';
};

/**
 * Exa adapter. Requests highlights/summary (compressed fields) for search and
 * supports a native deep-read via the contents endpoint.
 */
export class ExaProvider implements SearchProvider {
  readonly id = 'exa' as const;

  constructor(private getKey: () => string) {}

  async search(query: string, opts: SearchOptions): Promise<SearchHit[]> {
    const key = requireKey(this.getKey(), 'Exa');
    const data = await fetchJson<ExaResponse>('https://api.exa.ai/search', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'x-api-key': key},
      body: JSON.stringify({
        query,
        numResults: opts.maxResults,
        contents: {highlights: true, summary: true},
      }),
    });
    return (data.results ?? []).map(r => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: exaSnippet(r),
      ...(r.publishedDate ? {publishedAt: r.publishedDate} : {}),
    }));
  }

  async read(url: string): Promise<PageContent> {
    const key = requireKey(this.getKey(), 'Exa');
    const data = await fetchJson<ExaResponse>('https://api.exa.ai/contents', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'x-api-key': key},
      body: JSON.stringify({urls: [url], text: true}),
    });
    const first = data.results?.[0];
    return {
      url,
      ...(first?.title ? {title: first.title} : {}),
      text: first?.text ?? '',
    };
  }
}
