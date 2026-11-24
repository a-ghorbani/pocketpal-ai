import type {
  SearchProvider,
  SearchHit,
  SearchOptions,
  PageContent,
} from '../types';
import {fetchJson, requireKey} from './http';

interface SpecStreamSearchSource {
  title?: string;
  url?: string;
  snippet?: string;
  published?: string;
}

interface SpecStreamSearchResponse {
  data?: {sources?: SpecStreamSearchSource[]} | null;
}

interface SpecStreamExtractResult {
  url?: string;
  status?: string;
  title?: string;
  text?: string;
}

interface SpecStreamExtractResponse {
  data?: {results?: SpecStreamExtractResult[]} | null;
}

export class SpecStreamProvider implements SearchProvider {
  readonly id = 'specstream' as const;

  constructor(private getKey: () => string) {}

  async search(
    query: string,
    opts: SearchOptions,
    signal?: AbortSignal,
  ): Promise<SearchHit[]> {
    const res = await this.post<SpecStreamSearchResponse | null>(
      '/web-search',
      {q: query, num: opts.maxResults},
      {retryOn429: true, signal},
    );
    if (!res?.data || typeof res.data !== 'object') {
      throw new Error('unexpected response');
    }
    const sources = res.data.sources;
    if (sources !== undefined && !Array.isArray(sources)) {
      throw new Error('unexpected response');
    }
    return (sources ?? []).map(r => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: r.snippet ?? '',
      ...(r.published ? {publishedAt: r.published} : {}),
    }));
  }

  async read(url: string, signal?: AbortSignal): Promise<PageContent> {
    const res = await this.post<SpecStreamExtractResponse | null>(
      '/extract',
      {urls: [url], format: 'markdown'},
      {signal},
    );
    if (!res?.data || typeof res.data !== 'object') {
      throw new Error('extract failed');
    }
    const results = res.data.results;
    if (results === undefined) {
      return {url, text: ''};
    }
    if (!Array.isArray(results) || results.length === 0) {
      throw new Error('extract failed');
    }
    const entry = results[0];
    if (entry.status !== undefined && entry.status !== 'ok') {
      throw new Error('extract failed');
    }
    return {
      url,
      ...(entry.title ? {title: entry.title} : {}),
      text: entry.text ?? '',
    };
  }

  private post<T>(
    path: string,
    body: Record<string, unknown>,
    {retryOn429, signal}: {retryOn429?: boolean; signal?: AbortSignal} = {},
  ): Promise<T> {
    const key = requireKey(this.getKey(), 'SpecStream');
    return fetchJson<T>(
      `https://api.specstream.ai/v1${path}`,
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
