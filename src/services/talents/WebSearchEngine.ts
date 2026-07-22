import {
  TalentEngine,
  TalentResult,
  ToolDefinition,
  SystemPromptContext,
} from './types';
import type {SearchAccess} from './searchAccess';
import type {SearchHit} from '../search/types';
import {budgetHits, getCachedHits, setCachedHits} from '../search/searchBudget';
import {wrapUntrusted} from './untrustedContent';
import {allowReadUrls} from './readUrlAllowlist';

const PER_SNIPPET_CHARS = 280;

const formatHit = (hit: SearchHit): string => {
  const date = hit.publishedAt ? ` *(${hit.publishedAt})*` : '';
  const lines = [`- **${hit.title || hit.url}**${date}`];
  if (hit.snippet) {
    lines.push(`  ${hit.snippet}`);
  }
  lines.push(`  <${hit.url}>`);
  return lines.join('\n');
};

const formatMenu = (query: string, hits: SearchHit[]): string => {
  const retrievedAt = new Date().toISOString().slice(0, 10);
  return [
    `## Web search results for "${query}" (retrieved ${retrievedAt})`,
    ...hits.map(formatHit),
  ].join('\n');
};

/**
 * `web_search` talent. Result count comes from settings, not a tool parameter,
 * so the model can't inflate it.
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

    const budgeted = budgetHits(
      hits,
      {
        maxResults,
        perSnippetChars: PER_SNIPPET_CHARS,
        tokenCeiling: this.recommendedContextTokens,
      },
      formatHit,
    );

    if (budgeted.length === 0) {
      if (__DEV__) {
        console.log('[web_search]', {query, provider: provider.id, count: 0});
      }
      // No usable hits — provider returned none, or budgeting rejected them all.
      // Don't cache: a transient/all-rejected empty must not lock out retries or
      // flip the same input between success and error on replay.
      const summary = `web_search: no results for "${query}". Try a shorter or less restrictive query.`;
      return {type: 'error', summary, errorMessage: summary};
    }

    // Cache the budgeted hits, not the raw payload — same model-visible result
    // on replay, without retaining oversized provider snippets.
    setCachedHits(provider.id, query, maxResults, budgeted);
    allowReadUrls(budgeted.map(h => h.url));

    if (__DEV__) {
      console.log('[web_search]', {
        query,
        provider: provider.id,
        count: budgeted.length,
        results: budgeted.map(h => ({title: h.title, url: h.url})),
      });
    }

    return {
      type: 'search',
      query,
      results: budgeted.map(h => ({
        title: h.title,
        url: h.url,
        snippet: h.snippet,
      })),
      summary: wrapUntrusted(formatMenu(query, budgeted)),
    };
  }

  systemPromptFragment(ctx: SystemPromptContext): string {
    const today = ctx.now.toISOString().slice(0, 10);
    const budget = ctx.maxToolTurns - 1;
    // Mention read_url only when that talent is also enabled for this Pal.
    const readUrl = ctx.activeTalents.has('read_url')
      ? ' and open pages with read_url'
      : '';
    return (
      `Today's date is ${today}. You can search the web with web_search${readUrl}. ` +
      `For time-sensitive or factual questions, search first; usually one or two searches suffice — ` +
      `you have a budget of ${budget} tool calls. Answer using the facts in the results and cite ` +
      'source URLs. If the results do not contain the answer, say so rather than guessing.'
    );
  }

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: 'web_search',
        description:
          'Search the web for current information. Use this for any question about news, current events, prices, releases, sports, weather, or any fact that may have changed since your training data or that you are unsure about. Write short keyword queries (2-6 words), like a search engine user, not full sentences. Returns result titles, source URLs, and text snippets.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description:
                "Short keyword search query, e.g. 'nobel prize physics 2026 winner'.",
            },
          },
          required: ['query'],
        },
      },
    };
  }
}
