import type {SearchProvider, SearchHit, SearchOptions} from '../types';
import {hfUserAgent} from '../../../utils/hfUserAgent';
import {fetchJson} from './http';

/** No key: You.com's free search (100 searches a day). */
const YOU_FREE_URL = 'https://api.you.com/v1/agents/search';
/** With a key: the keyed Search API, for higher limits. */
const YOU_KEYED_URL = 'https://ydc-index.io/v1/search';

/** Attribution token appended to the app User-Agent, only on You.com requests. */
const YOU_UA_TOKEN = 'youdotcom-integration/a-ghorbani-pocketpal-ai';

export const YOU_FREE_LIMIT_MESSAGE =
  'You.com free search limit reached (100 searches a day). Add a You.com API key in Settings → Internet Search for higher limits.';
export const YOU_KEYED_LIMIT_MESSAGE =
  'You.com rate limit reached. Try again shortly.';

interface YouWebResult {
  title?: string;
  url?: string;
  description?: string;
  snippets?: string[];
  page_age?: string;
}

interface YouResponse {
  results?: {web?: YouWebResult[]};
}

export class YouProvider implements SearchProvider {
  readonly id = 'you' as const;

  constructor(private getKey: () => string) {}

  async search(
    query: string,
    opts: SearchOptions,
    signal?: AbortSignal,
  ): Promise<SearchHit[]> {
    const key = (this.getKey() ?? '').trim();
    const params = `query=${encodeURIComponent(query)}&count=${opts.maxResults}`;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': `${hfUserAgent()} ${YOU_UA_TOKEN}`,
    };
    if (key) {
      headers['X-API-Key'] = key;
    }

    let data: YouResponse | null;
    try {
      data = await fetchJson<YouResponse | null>(
        `${key ? YOU_KEYED_URL : YOU_FREE_URL}?${params}`,
        {method: 'GET', headers, signal},
        {retryOn429: true},
      );
    } catch (e) {
      if (e instanceof Error && e.message === 'request failed (429)') {
        throw new Error(key ? YOU_KEYED_LIMIT_MESSAGE : YOU_FREE_LIMIT_MESSAGE);
      }
      throw e;
    }

    const results = data?.results;
    if (!results || typeof results !== 'object') {
      throw new Error('unexpected response');
    }
    const web = results.web ?? [];
    if (!Array.isArray(web)) {
      throw new Error('unexpected response');
    }
    return web.map(r => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: r.description || r.snippets?.[0] || '',
      ...(r.page_age ? {publishedAt: r.page_age} : {}),
    }));
  }
}
