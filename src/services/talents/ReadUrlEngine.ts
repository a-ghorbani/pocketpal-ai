import {TalentEngine, TalentResult, ToolDefinition} from './types';
import type {SearchAccess} from './searchAccess';
import type {PageContent} from '../search/types';
import {budgetPage} from '../search/searchBudget';
import {wrapUntrusted} from './untrustedContent';
import {isReadUrlAllowed} from './readUrlAllowlist';

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

    // Exfiltration guard: only URLs from this conversation's web_search
    // results or the user's own messages may be fetched.
    if (!isReadUrlAllowed(url)) {
      const summary =
        'read_url: this URL is not from a web_search result or a user message in this conversation. Copy the URL exactly as the user wrote it or as shown in web_search results, or run web_search first.';
      return {type: 'error', summary, errorMessage: summary};
    }

    // Fetch the canonical URL, not the raw argument: allowlist matching
    // ignores fragments, so a smuggled `#data` must never reach a provider
    // that transmits the URL verbatim (Exa sends it in a JSON body).
    const canonical = new URL(url);
    canonical.hash = '';
    const targetUrl = canonical.toString();

    const provider = this.access.getActiveProvider();

    let page: PageContent;
    try {
      page = provider.read
        ? await provider.read(targetUrl)
        : await this.access.readWithDefaultReader(targetUrl);
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

    const header = bounded.title ? `${bounded.title}\n${targetUrl}` : targetUrl;
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
          'Fetch the full text of one web page. Use this directly when the user gives you a URL to read — no search needed first. Also use it after web_search when a snippet mentions the answer but does not fully contain it. Pass the exact URL as the user wrote it or as shown in a web_search result. Do not invent URLs.',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description:
                "Exact URL from the user's message or a web_search result.",
            },
          },
          required: ['url'],
        },
      },
    };
  }
}
