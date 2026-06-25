import {TalentEngine, TalentResult, ToolDefinition} from './types';
import type {SearchAccess} from './searchAccess';
import type {PageContent} from '../search/types';
import {budgetPage} from '../search/searchBudget';
import {wrapUntrusted} from './untrustedContent';

/**
 * Accept only plain `http(s)` URLs with no embedded credentials. Rejecting
 * `file:`/`data:`/other schemes and userinfo blocks a malicious page from
 * steering a later read at an exfiltration target or a non-web resource.
 */
const isAllowedReadUrl = (raw: string): boolean => {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }
  if (parsed.username || parsed.password) {
    return false;
  }
  return parsed.hostname.length > 0;
};

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

    if (!isAllowedReadUrl(url)) {
      const summary = 'read_url: only http(s) URLs are allowed';
      return {type: 'error', summary, errorMessage: summary};
    }

    if (!this.access.canSearch()) {
      const provider = this.access.getActiveProvider();
      return {
        type: 'error',
        summary: `read_url: ${provider.id} not enabled`,
        errorMessage: `Internet search is not enabled. Accept the disclosure and set an API key for ${provider.id} in Settings → Internet Search.`,
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
    console.log('[read_url]', {
      url,
      provider: provider.read ? provider.id : 'default-reader',
      textLength: bounded.text.length,
    });
    if (!bounded.text) {
      const summary = `read_url: no readable content at ${url}`;
      return {type: 'error', summary, errorMessage: summary};
    }

    const header = bounded.title ? `${bounded.title}\n${url}` : url;
    return {
      type: 'text',
      summary: wrapUntrusted(`${header}\n\n${bounded.text}`),
    };
  }

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: 'read_url',
        description:
          'Open one web page and read its full text. Use after web_search when a snippet is not enough — to read an article, page, or document in depth. Provide an exact URL (usually one from web_search results).',
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
