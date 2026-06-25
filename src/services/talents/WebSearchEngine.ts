import {TalentEngine, TalentResult, ToolDefinition} from './types';
import type {SearchAccess} from './searchAccess';
import type {SearchHit} from '../search/types';
import {budgetHits, getCachedHits, setCachedHits} from '../search/searchBudget';
import {wrapUntrusted} from './untrustedContent';

const PER_SNIPPET_CHARS = 280;

/** Render budgeted hits into the compact menu the model reads on the next turn. */
const formatMenu = (query: string, hits: SearchHit[]): string => {
  const items = hits
    .map((hit, i) => {
      const parts = [`${i + 1}. ${hit.title || hit.url}`, hit.url];
      if (hit.snippet) {
        parts.push(hit.snippet);
      }
      if (hit.publishedAt) {
        parts.push(`(${hit.publishedAt})`);
      }
      return parts.join('\n');
    })
    .join('\n\n');
  return `web_search results for "${query}":\n\n${items}`;
};

/**
 * `web_search` talent. The model writes the query; result count comes from
 * settings (not a tool parameter, so the model cannot inflate it). Returns a
 * compact menu on success or an error result on no-key / no-results / failure —
 * never a silent no-op.
 *
 * The engine reads the active provider, its key presence, and the result count
 * through an injected `SearchAccess` — it never imports the store.
 */
export class WebSearchEngine implements TalentEngine {
  readonly name = 'web_search';
  readonly recommendedContextTokens = 1000;

  constructor(private access: SearchAccess) {}

  async execute(args: Record<string, any>): Promise<TalentResult> {
    const query = typeof args.query === 'string' ? args.query.trim() : '';
    if (!query) {
      return {
        type: 'error',
        summary: 'web_search: missing or empty "query" argument',
        errorMessage:
          'query argument is required and must be a non-empty string',
      };
    }

    if (!this.access.canSearch()) {
      const provider = this.access.getActiveProvider();
      return {
        type: 'error',
        summary: `web_search: ${provider.id} not enabled`,
        errorMessage: `Internet search is not enabled. Accept the disclosure and set an API key for ${provider.id} in Settings → Internet Search.`,
      };
    }

    const provider = this.access.getActiveProvider();
    const maxResults = this.access.getResultCount();

    let hits: SearchHit[];
    try {
      const cached = getCachedHits(provider.id, query, maxResults);
      if (cached) {
        hits = cached;
      } else {
        hits = await provider.search(query, {maxResults});
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      return {
        type: 'error',
        summary: `web_search: ${errMsg}`,
        errorMessage: errMsg,
      };
    }

    if (hits.length === 0) {
      // Don't cache an empty result — a transient empty must not lock out retries.
      const summary = `web_search: no results for "${query}"`;
      return {type: 'error', summary, errorMessage: summary};
    }

    setCachedHits(provider.id, query, maxResults, hits);

    const budgeted = budgetHits(hits, {
      maxResults,
      perSnippetChars: PER_SNIPPET_CHARS,
      tokenCeiling: this.recommendedContextTokens,
    });

    return {type: 'text', summary: wrapUntrusted(formatMenu(query, budgeted))};
  }

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: 'web_search',
        description:
          'Search the internet for current information. Returns a short list of result titles, URLs, and snippets. Use read_url to read a result in full.',
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
