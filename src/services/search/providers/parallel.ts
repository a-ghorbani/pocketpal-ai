import type {SearchProvider, SearchHit, SearchOptions} from '../types';
import {fetchJson, requireKey} from './http';

interface ParallelExcerpt {
  title?: string;
  url?: string;
  excerpts?: string[];
  published_date?: string;
}

interface ParallelResponse {
  results?: ParallelExcerpt[];
}

/**
 * Parallel.ai adapter. Maps compressed `excerpts` to `SearchHit.snippet`.
 *
 * Ships gated: present in the registry/UI list but not selectable as the active
 * provider until its free-tier/PAYG terms are confirmed (see SearchProviderStore
 * `selectable: false`).
 */
export class ParallelProvider implements SearchProvider {
  readonly id = 'parallel' as const;

  constructor(private getKey: () => string) {}

  async search(query: string, opts: SearchOptions): Promise<SearchHit[]> {
    const key = requireKey(this.getKey(), 'Parallel');
    const data = await fetchJson<ParallelResponse>(
      'https://api.parallel.ai/v1/search',
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'x-api-key': key},
        body: JSON.stringify({
          objective: query,
          max_results: opts.maxResults,
        }),
      },
    );
    return (data.results ?? []).map(r => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: (r.excerpts ?? []).join(' '),
      ...(r.published_date ? {publishedAt: r.published_date} : {}),
    }));
  }

  // No native deep-read: read_url falls through to the default reader.
}
