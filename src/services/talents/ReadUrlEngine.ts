import {TalentEngine, TalentResult, ToolDefinition} from './types';
import type {SearchAccess} from './searchAccess';
import type {PageContent} from '../search/types';
import {budgetPage} from '../search/searchBudget';

/**
 * `read_url` talent. Deep-reads one page on demand via the active provider's
 * native `read()`, falling back to the default reader (r.jina.ai) for providers
 * that lack one. The page is bounded by this talent's recommendedContextTokens.
 * Returns bounded text on success or an error result on failure — never silent.
 */
export class ReadUrlEngine implements TalentEngine {
  readonly name = 'read_url';
  readonly recommendedContextTokens = 1200;

  constructor(private access: SearchAccess) {}

  async execute(args: Record<string, any>): Promise<TalentResult> {
    const url = typeof args.url === 'string' ? args.url.trim() : '';
    if (!url) {
      return {
        type: 'error',
        summary: 'read_url: missing or empty "url" argument',
        errorMessage: 'url argument is required and must be a non-empty string',
      };
    }

    if (!this.access.isConfigured()) {
      const provider = this.access.getActiveProvider();
      return {
        type: 'error',
        summary: `read_url: ${provider.id} key not set`,
        errorMessage: `No API key configured for ${provider.id}. Set one in Settings → Internet Search.`,
      };
    }

    const provider = this.access.getActiveProvider();

    let page: PageContent;
    try {
      page = provider.read
        ? await provider.read(url)
        : await this.access.readWithDefaultReader(url);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      return {
        type: 'error',
        summary: `read_url: ${errMsg}`,
        errorMessage: errMsg,
      };
    }

    const bounded = budgetPage(page, this.recommendedContextTokens);
    if (!bounded.text) {
      const summary = `read_url: no readable content at ${url}`;
      return {type: 'error', summary, errorMessage: summary};
    }

    const header = bounded.title ? `${bounded.title}\n${url}` : url;
    return {type: 'text', summary: `${header}\n\n${bounded.text}`};
  }

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: 'read_url',
        description:
          'Fetch and read the full content of one web page. Use after web_search to read a result in depth.',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The URL of the page to read.',
            },
          },
          required: ['url'],
        },
      },
    };
  }
}
