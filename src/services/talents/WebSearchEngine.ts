import {TalentEngine, TalentResult, ToolDefinition} from './types';
import {
  getSearchProvider,
  getSearchEndpoint,
  getGoogleCseId,
  getApiKey,
} from './webSearchConfig';

interface AdapterItem {
  title?: string;
  url?: string;
  snippet?: string;
}

export class WebSearchEngine implements TalentEngine {
  readonly name = 'web_search';
  readonly recommendedContextTokens = 1024;

  async execute(args: Record<string, any>): Promise<TalentResult> {
    const query = typeof args.query === 'string' ? args.query.trim() : '';
    if (!query) {
      const msg = 'web_search: missing required "query" argument';
      return {type: 'error', summary: msg, errorMessage: msg};
    }

    const provider = await getSearchProvider();
    switch (provider) {
      case 'langsearch':
        return this.executeLangSearch(query);
      case 'tavily':
        return this.executeTavily(query);
      case 'brave':
        return this.executeBrave(query);
      case 'serper':
        return this.executeSerper(query);
      case 'exa':
        return this.executeExa(query);
      case 'google_cse':
        return this.executeGoogleCse(query);
      case 'searxng':
      default:
        return this.executeSearxng(query);
    }
  }

  private async executeSearxng(query: string): Promise<TalentResult> {
    const endpoint = await getSearchEndpoint();
    if (!endpoint) {
      const msg =
        'web_search is not configured. The user must set a SearXNG instance URL in Settings before this tool can be used.';
      return {type: 'error', summary: msg, errorMessage: msg};
    }
    return this.doFetch(
      `${endpoint.replace(/\/$/, '')}/search?q=${encodeURIComponent(
        query,
      )}&format=json`,
      {},
      'SearXNG',
      data =>
        (Array.isArray(data?.results) ? data.results : []).map(
          (r: any): AdapterItem => ({
            title: r.title,
            url: r.url,
            snippet: r.content,
          }),
        ),
    );
  }

  private async executeLangSearch(query: string): Promise<TalentResult> {
    const apiKey = await getApiKey('langsearch');

    if (!apiKey) {
      return this.missingKey('langsearch');
    }

    return this.doFetch(
      'https://api.langsearch.com/v1/web-search',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          freshness: 'noLimit',
          summary: true,
          count: 5,
        }),
      },
      'LangSearch',
      data =>
        (Array.isArray(data?.data?.webPages?.value)
          ? data.data.webPages.value
          : []
        ).map(
          (r: any): AdapterItem => ({
            title: r.name,
            url: r.url,
            snippet: r.summary ?? r.snippet,
          }),
        ),
    );
  }

  private async executeTavily(query: string): Promise<TalentResult> {
    const apiKey = await getApiKey('tavily');
    if (!apiKey) {
      return this.missingKey('tavily');
    }
    return this.doFetch(
      'https://api.tavily.com/search',
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({api_key: apiKey, query, max_results: 5}),
      },
      'Tavily',
      data =>
        (Array.isArray(data?.results) ? data.results : []).map(
          (r: any): AdapterItem => ({
            title: r.title,
            url: r.url,
            snippet: r.content,
          }),
        ),
    );
  }

  private async executeBrave(query: string): Promise<TalentResult> {
    const apiKey = await getApiKey('brave');
    if (!apiKey) {
      return this.missingKey('brave');
    }
    return this.doFetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(
        query,
      )}&count=5`,
      {
        headers: {
          Accept: 'application/json',
          'X-Subscription-Token': apiKey,
        },
      },
      'Brave',
      data =>
        (Array.isArray(data?.web?.results) ? data.web.results : []).map(
          (r: any): AdapterItem => ({
            title: r.title,
            url: r.url,
            snippet: r.description,
          }),
        ),
    );
  }

  private async executeSerper(query: string): Promise<TalentResult> {
    const apiKey = await getApiKey('serper');
    if (!apiKey) {
      return this.missingKey('serper');
    }
    return this.doFetch(
      'https://google.serper.dev/search',
      {
        method: 'POST',
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({q: query, num: 5}),
      },
      'Serper',
      data =>
        (Array.isArray(data?.organic) ? data.organic : []).map(
          (r: any): AdapterItem => ({
            title: r.title,
            url: r.link,
            snippet: r.snippet,
          }),
        ),
    );
  }

  private async executeExa(query: string): Promise<TalentResult> {
    const apiKey = await getApiKey('exa');
    if (!apiKey) {
      return this.missingKey('exa');
    }
    return this.doFetch(
      'https://api.exa.ai/search',
      {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({query, numResults: 5, type: 'auto'}),
      },
      'Exa',
      data =>
        (Array.isArray(data?.results) ? data.results : []).map(
          (r: any): AdapterItem => ({
            title: r.title,
            url: r.url,
            snippet: (r.text ?? '').slice(0, 300),
          }),
        ),
    );
  }

  private async executeGoogleCse(query: string): Promise<TalentResult> {
    const apiKey = await getApiKey('google_cse');
    const cx = await getGoogleCseId();
    if (!apiKey || !cx) {
      const msg =
        'web_search is not configured. The user must set both a Google API key and a Search Engine ID (cx) in Settings before this tool can be used.';
      return {type: 'error', summary: msg, errorMessage: msg};
    }
    return this.doFetch(
      `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(
        apiKey,
      )}&cx=${encodeURIComponent(cx)}&q=${encodeURIComponent(query)}&num=5`,
      {},
      'Google CSE',
      data =>
        (Array.isArray(data?.items) ? data.items : []).map(
          (r: any): AdapterItem => ({
            title: r.title,
            url: r.link,
            snippet: r.snippet,
          }),
        ),
    );
  }

  /** Shared fetch + timeout + JSON parse + formatting logic for all providers. */
  private async doFetch(
    url: string,
    init: RequestInit,
    providerLabel: string,
    extract: (data: any) => AdapterItem[],
  ): Promise<TalentResult> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, {...init, signal: controller.signal});
      clearTimeout(timeout);

      if (!res.ok) {
        const msg =
          res.status === 401 || res.status === 403
            ? `web_search: ${providerLabel} rejected the API key (check it in Settings)`
            : `web_search: ${providerLabel} returned HTTP ${res.status}`;
        return {type: 'error', summary: msg, errorMessage: msg};
      }

      const data = await res.json();
      const items = extract(data).slice(0, 5);

      if (items.length === 0) {
        return {type: 'text', summary: `No results found.`};
      }

      const summary = items
        .map((r, i) => {
          const title = r.title ?? '(untitled)';
          const snippet = (r.snippet ?? '').slice(0, 300);
          return `${i + 1}. ${title}\n${r.url ?? ''}\n${snippet}`;
        })
        .join('\n\n');

      return {type: 'text', summary};
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      const isAbort = errMsg.toLowerCase().includes('abort');
      const msg = isAbort
        ? `web_search: request timed out. ${providerLabel} may be unreachable.`
        : `web_search: ${errMsg}`;
      return {type: 'error', summary: msg, errorMessage: errMsg};
    }
  }

  private missingKey(provider: string): TalentResult {
    const msg = `web_search is not configured. The user must set a ${provider} API key in Settings before this tool can be used.`;
    return {type: 'error', summary: msg, errorMessage: msg};
  }

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: 'web_search',
        description:
          'Search the internet for current information. Use this when the user asks about recent events, current facts, or anything that may have changed since training.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query.',
            },
          },
          required: ['query'],
        },
      },
    };
  }
}
