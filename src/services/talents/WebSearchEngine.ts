/**
 * WebSearchEngine — client-side web search with multiple backends.
 *
 * Architecture (ADR-2026-004): Client-direct connection to search engines,
 * no intermediate server. Default backend is DuckDuckGo (no API key required).
 * Optional backends: SearXNG (self-hosted or public instances), Wikipedia.
 *
 * The engine auto-falls back across providers when the primary returns
 * empty results or fails, ensuring the user gets answers even if one
 * provider is down or rate-limited.
 */

import {TalentEngine, TalentResult, ToolDefinition} from './types';
import {checkNetworkAccess, getNetworkDisabledError} from './networkUtils';

type SearchBackend = 'duckduckgo' | 'searxng' | 'wikipedia';

interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
  source?: string;
}

interface SearchResponse {
  answer?: string;
  results: SearchResultItem[];
  source: SearchBackend;
}

const DDG_API = 'https://api.duckduckgo.com';
const DEFAULT_SEARXNG_INSTANCE = 'https://search.bus-hit.me';

export class WebSearchEngine implements TalentEngine {
  readonly name = 'web_search';
  readonly recommendedContextTokens = 1000;

  private searxngInstance: string | null = null;

  /**
   * Configure a custom SearXNG instance URL.
   * When set, SearXNG will be used as the primary backend with DDG as fallback.
   */
  setSearxngInstance(url: string | null): void {
    this.searxngInstance = url;
  }

  async execute(args: Record<string, any>): Promise<TalentResult> {
    if (!checkNetworkAccess()) {
      return getNetworkDisabledError('web_search');
    }

    const query =
      typeof args.query === 'string' ? args.query.trim() : '';

    if (!query) {
      return {
        type: 'error',
        summary: 'web_search: missing or empty "query" argument',
        errorMessage:
          'query argument is required and must be a non-empty string',
      };
    }

    const limit =
      typeof args.limit === 'number' && args.limit > 0
        ? Math.min(args.limit, 15)
        : 5;

    const backend =
      typeof args.backend === 'string' ? (args.backend as SearchBackend) : null;

    try {
      const response = await this.searchWithFallback(query, limit, backend);
      return this.formatResult(response, query);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      return {
        type: 'error',
        summary: `web_search: ${errMsg}`,
        errorMessage: errMsg,
      };
    }
  }

  /**
   * Try search backends in order until one returns results.
   * Order: custom backend → SearXNG (if configured) → DuckDuckGo → Wikipedia
   */
  private async searchWithFallback(
    query: string,
    limit: number,
    preferredBackend?: SearchBackend | null,
  ): Promise<SearchResponse> {
    const backends: SearchBackend[] = [];

    if (preferredBackend) {
      backends.push(preferredBackend);
    }
    if (this.searxngInstance && !backends.includes('searxng')) {
      backends.push('searxng');
    }
    if (!backends.includes('duckduckgo')) {
      backends.push('duckduckgo');
    }
    if (!backends.includes('wikipedia')) {
      backends.push('wikipedia');
    }

    let lastError: Error | null = null;

    for (const backend of backends) {
      try {
        const result = await this.searchWithBackend(query, limit, backend);
        if (result.answer || result.results.length > 0) {
          return result;
        }
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
      }
    }

    if (lastError) {
      throw lastError;
    }

    return {results: [], source: backends[0]};
  }

  private async searchWithBackend(
    query: string,
    limit: number,
    backend: SearchBackend,
  ): Promise<SearchResponse> {
    switch (backend) {
      case 'duckduckgo':
        return this.searchDuckDuckGo(query, limit);
      case 'searxng':
        return this.searchSearxng(query, limit);
      case 'wikipedia':
        return this.searchWikipedia(query, limit);
      default:
        return this.searchDuckDuckGo(query, limit);
    }
  }

  /**
   * DuckDuckGo Instant Answer API — no API key required.
   * Good for factual queries, definitions, and quick answers.
   */
  private async searchDuckDuckGo(
    query: string,
    limit: number,
  ): Promise<SearchResponse> {
    const url = `${DDG_API}/?q=${encodeURIComponent(
      query,
    )}&format=json&no_html=1&skip_disambig=1&t=pocketpal`;

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'PocketPalAI/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`DuckDuckGo HTTP ${response.status}`);
    }

    const data = await response.json();
    const results: SearchResultItem[] = [];
    let answer: string | undefined;

    if (data.Answer) {
      answer = data.Answer;
    }

    if (data.AbstractText) {
      answer = answer
        ? `${answer}\n${data.AbstractText}`
        : data.AbstractText;
      if (data.AbstractURL) {
        results.push({
          title: data.Heading || query,
          url: data.AbstractURL,
          snippet: data.AbstractText,
          source: data.AbstractSource || 'DuckDuckGo',
        });
      }
    }

    if (data.Definition) {
      results.unshift({
        title: `Definition: ${query}`,
        url: data.DefinitionURL || '',
        snippet: data.Definition,
        source: data.DefinitionSource || 'DuckDuckGo',
      });
    }

    const related = this.flattenDDGTopics(data.RelatedTopics || []).slice(
      0,
      limit,
    );
    for (const topic of related) {
      if (topic.text && topic.url) {
        results.push({
          title: topic.text.slice(0, 80),
          url: topic.url,
          snippet: topic.text,
          source: 'DuckDuckGo',
        });
      }
    }

    if (data.Results) {
      for (const result of data.Results.slice(0, 3)) {
        if (result.text && result.url) {
          results.push({
            title: result.text.slice(0, 80),
            url: result.url,
            snippet: result.text,
            source: 'DuckDuckGo',
          });
        }
      }
    }

    return {answer, results: results.slice(0, limit), source: 'duckduckgo'};
  }

  private flattenDDGTopics(topics: any[]): any[] {
    const result: any[] = [];
    for (const topic of topics) {
      if (topic.topics && topic.topics.length > 0) {
        result.push(...this.flattenDDGTopics(topic.topics));
      } else if (topic.text) {
        result.push(topic);
      }
    }
    return result;
  }

  /**
   * SearXNG — privacy-respecting metasearch engine.
   * Supports both self-hosted and public instances.
   * Returns full web search results (not just instant answers).
   */
  private async searchSearxng(
    query: string,
    limit: number,
  ): Promise<SearchResponse> {
    const instance = this.searxngInstance || DEFAULT_SEARXNG_INSTANCE;
    const url = `${instance}/search?q=${encodeURIComponent(
      query,
    )}&format=json&safesearch=1&categories=general`;

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'PocketPalAI/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`SearXNG HTTP ${response.status}`);
    }

    const data = await response.json();
    const results: SearchResultItem[] = [];

    if (data.answer && data.answer.length > 0) {
      const answerResult = data.answer[0];
      results.push({
        title: 'Answer',
        url: answerResult.url || '',
        snippet: answerResult.content || '',
        source: 'SearXNG',
      });
    }

    if (data.results && Array.isArray(data.results)) {
      for (const result of data.results.slice(0, limit)) {
        results.push({
          title: result.title || '',
          url: result.url || '',
          snippet: result.content || result.description || '',
          source: result.engine || 'SearXNG',
        });
      }
    }

    return {results, source: 'searxng'};
  }

  /**
   * Wikipedia direct search — good for factual knowledge.
   * Uses Wikipedia's open search API, no key required.
   */
  private async searchWikipedia(
    query: string,
    limit: number,
  ): Promise<SearchResponse> {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      query,
    )}&srlimit=${Math.min(limit, 10)}&format=json&origin=*`;

    const response = await fetch(searchUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'PocketPalAI/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Wikipedia HTTP ${response.status}`);
    }

    const data = await response.json();
    const results: SearchResultItem[] = [];
    let answer: string | undefined;

    const searchResults = data?.query?.search || [];

    for (const item of searchResults.slice(0, limit)) {
      const pageTitle = item.title;
      const snippet = item.snippet?.replace(/<\/?[^>]+(>|$)/g, '') || '';
      const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(pageTitle)}`;

      results.push({
        title: pageTitle,
        url,
        snippet,
        source: 'Wikipedia',
      });
    }

    if (searchResults.length > 0) {
      const firstTitle = searchResults[0].title;
      const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(firstTitle)}`;

      try {
        const summaryResponse = await fetch(summaryUrl, {
          headers: {'User-Agent': 'PocketPalAI/1.0'},
        });
        if (summaryResponse.ok) {
          const summaryData = await summaryResponse.json();
          if (summaryData.extract) {
            answer = summaryData.extract;
          }
        }
      } catch {
        // Best-effort summary fetch — don't fail the whole search
      }
    }

    return {answer, results, source: 'wikipedia'};
  }

  private formatResult(
    response: SearchResponse,
    query: string,
  ): TalentResult {
    const parts: string[] = [];

    parts.push(`Search results for "${query}" (source: ${response.source})`);
    parts.push('');

    if (response.answer) {
      parts.push(`**Answer:** ${response.answer}`);
      parts.push('');
    }

    if (response.results.length > 0) {
      parts.push('**Results:**');
      response.results.forEach((result, idx) => {
        parts.push(`${idx + 1}. **${result.title}**`);
        if (result.snippet) {
          parts.push(`   ${result.snippet}`);
        }
        if (result.url) {
          parts.push(`   URL: ${result.url}`);
        }
        if (result.source) {
          parts.push(`   [${result.source}]`);
        }
        parts.push('');
      });
    }

    if (!response.answer && response.results.length === 0) {
      return {
        type: 'text',
        summary: `No results found for "${query}". Try rephrasing or using different keywords.`,
      };
    }

    return {
      type: 'text',
      summary: parts.join('\n').trim(),
    };
  }

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: 'web_search',
        description:
          'Search the web for up-to-date information, facts, and current events. ' +
          'Uses DuckDuckGo by default (no API key needed), with Wikipedia and SearXNG fallbacks. ' +
          'Best for: current events, factual questions, definitions, product info, and finding specific web pages.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description:
                'The search query. Be specific and use keywords. Example: "quantum computing explained" or "best smartphones 2026".',
            },
            limit: {
              type: 'number',
              description:
                'Maximum number of results to return (default: 5, max: 15).',
            },
            backend: {
              type: 'string',
              description:
                'Optional: preferred search backend. Options: "duckduckgo" (default, no key), "wikipedia" (encyclopedia), "searxng" (if configured).',
              enum: ['duckduckgo', 'wikipedia', 'searxng'],
            },
          },
          required: ['query'],
        },
      },
    };
  }
}
