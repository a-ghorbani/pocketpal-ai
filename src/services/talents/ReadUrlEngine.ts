import {TalentEngine, TalentResult, ToolDefinition} from './types';
import type {SearchAccess} from './searchAccess';
import type {PageContent} from '../search/types';
import {budgetPage} from '../search/searchBudget';
import {wrapUntrusted} from './untrustedContent';

/**
 * Reject non-http(s) schemes and embedded credentials so a malicious page
 * can't steer a later read at an exfiltration target or non-web resource.
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
          'Fetch the full text of one web page. Use this after web_search when a snippet mentions the answer but does not fully contain it. Pass the exact URL copied from a web_search result. Do not invent URLs.',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'Exact URL copied from a web_search result.',
            },
          },
          required: ['url'],
        },
      },
    };
  }
}
