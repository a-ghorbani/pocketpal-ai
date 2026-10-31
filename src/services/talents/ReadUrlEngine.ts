import {
  TalentEngine,
  TalentExecuteContext,
  TalentResult,
  ToolDefinition,
} from './types';
import type {SearchAccess} from './searchAccess';
import {SEARCH_NOT_SET_UP_MESSAGE} from './searchAccess';
import type {PageContent} from '../search/types';
import {budgetPage} from '../search/searchBudget';
import {wrapUntrusted} from './untrustedContent';
import {allowReadUrls, extractUrls, matchReadUrl} from './readUrlAllowlist';

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

const MAX_PAGE_LINKS = 100;

export class ReadUrlEngine implements TalentEngine {
  readonly name = 'read_url';
  readonly recommendedContextTokens = 1200;

  constructor(private access: SearchAccess) {}

  async execute(
    args: Record<string, any>,
    ctx?: TalentExecuteContext,
  ): Promise<TalentResult> {
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
      return {
        type: 'error',
        summary: `read_url: ${SEARCH_NOT_SET_UP_MESSAGE}`,
        errorMessage: SEARCH_NOT_SET_UP_MESSAGE,
      };
    }

    // Exfiltration guard: fetch the stored entry, or the canonical request on a site the user named.
    const targetUrl = matchReadUrl(url);
    if (targetUrl === null) {
      const summary =
        'read_url: this URL is not allowed. Use a page on a site the user named, or copy a URL exactly from a web_search result or a page you read with read_url; or run web_search first.';
      return {type: 'error', summary, errorMessage: summary};
    }

    const provider = this.access.getActiveProvider();

    let page: PageContent;
    try {
      page = provider.read
        ? await provider.read(targetUrl, ctx?.signal)
        : await this.access.readWithDefaultReader(targetUrl, ctx?.signal);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      return {
        type: 'error',
        summary: `read_url: ${errMsg}`,
        errorMessage: errMsg,
      };
    }

    const bounded = budgetPage(page, this.recommendedContextTokens);
    if (__DEV__) {
      console.log('[read_url]', {
        url: targetUrl,
        provider: provider.read ? provider.id : 'default-reader',
        textLength: bounded.text.length,
      });
    }
    if (!bounded.text) {
      const summary = `read_url: no readable content at ${targetUrl}`;
      return {type: 'error', summary, errorMessage: summary};
    }

    const links = extractUrls(bounded.text).slice(0, MAX_PAGE_LINKS);
    allowReadUrls(links);

    const header = bounded.title ? `${bounded.title}\n${targetUrl}` : targetUrl;
    return {
      type: 'text',
      summary: wrapUntrusted(`${header}\n\n${bounded.text}`),
      links,
    };
  }

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: 'read_url',
        description:
          'Fetch the full text of one web page. Use it directly when the user names a site or gives a URL; any page on a site the user named can be read. Also use it after web_search when a snippet does not fully answer, or to follow a URL written in a page you read. On other sites, copy the URL exactly from a web_search result or a page you read; do not invent URLs.',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description:
                'A page on a site the user named, or a URL copied exactly from a web_search result or a page you read.',
            },
          },
          required: ['url'],
        },
      },
    };
  }
}
