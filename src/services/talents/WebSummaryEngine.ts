/**
 * WebSummaryEngine — fetch a URL and extract its main text content.
 *
 * Architecture (ADR-2026-004 / roadmap 2.3): Client-direct fetch, no
 * intermediate server. Strips HTML tags, scripts, styles, and extracts
 * readable text for the model to summarize.
 */

import {TalentEngine, TalentResult, ToolDefinition} from './types';

const MAX_CONTENT_LENGTH = 8000;
const REQUEST_TIMEOUT_MS = 15000;

export class WebSummaryEngine implements TalentEngine {
  readonly name = 'web_summary';
  readonly recommendedContextTokens = 1200;

  async execute(args: Record<string, any>): Promise<TalentResult> {
    const url =
      typeof args.url === 'string' ? args.url.trim() : '';

    if (!url) {
      return {
        type: 'error',
        summary: 'web_summary: missing or empty "url" argument',
        errorMessage:
          'url argument is required and must be a non-empty string',
      };
    }

    // Basic URL validation
    let validUrl: URL;
    try {
      validUrl = new URL(url);
    } catch {
      return {
        type: 'error',
        summary: `web_summary: invalid URL "${url}"`,
        errorMessage: 'The provided URL is not valid',
      };
    }

    if (!['http:', 'https:'].includes(validUrl.protocol)) {
      return {
        type: 'error',
        summary: `web_summary: unsupported protocol "${validUrl.protocol}"`,
        errorMessage: 'Only http and https protocols are supported',
      };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS,
      );

      const response = await fetch(validUrl.toString(), {
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent':
            'Mozilla/5.0 (compatible; PocketPalAI/1.0; +https://github.com/pocketpal-ai)',
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return {
          type: 'error',
          summary: `web_summary: HTTP ${response.status} from ${validUrl.hostname}`,
          errorMessage: `Fetch failed with status ${response.status}`,
        };
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
        return {
          type: 'text',
          summary: `The URL ${url} returned non-HTML content (type: ${contentType}). Cannot extract text.`,
        };
      }

      const html = await response.text();
      const extracted = this.extractText(html);

      if (!extracted.text) {
        return {
          type: 'text',
          summary: `No readable text content found at ${url}.`,
        };
      }

      // Truncate to stay within context limits
      const truncated =
        extracted.text.length > MAX_CONTENT_LENGTH
          ? extracted.text.slice(0, MAX_CONTENT_LENGTH) +
            '\n...(content truncated)'
          : extracted.text;

      const summary = `Title: ${extracted.title || 'Unknown'}\nURL: ${url}\n\n${truncated}`;

      return {
        type: 'text',
        summary,
      };
    } catch (e) {
      const isAbort = e instanceof Error && e.name === 'AbortError';
      const errMsg = isAbort
        ? `Request timed out after ${REQUEST_TIMEOUT_MS}ms`
        : e instanceof Error
          ? e.message
          : String(e);
      return {
        type: 'error',
        summary: `web_summary: ${errMsg}`,
        errorMessage: errMsg,
      };
    }
  }

  /**
   * Extract readable text from HTML. Strips scripts, styles, and
   * extracts text from paragraph, heading, list, and div elements.
   */
  private extractText(html: string): {
    title: string;
    text: string;
  } {
    let title = '';

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch) {
      title = this.stripTags(titleMatch[1]).trim();
    }

    // Remove script and style blocks
    let cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');

    // Extract meta description as fallback
    const metaDesc = cleaned.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["']/i,
    );
    const description = metaDesc
      ? this.stripTags(metaDesc[1]).trim()
      : '';

    // Extract text from common content tags
    const contentTags =
      /<(?:p|h[1-6]|li|td|th|blockquote|article|section|main|div)[^>]*>([\s\S]*?)<\/(?:p|h[1-6]|li|td|th|blockquote|article|section|main|div)>/gi;
    const blocks: string[] = [];
    let match;
    while ((match = contentTags.exec(cleaned)) !== null) {
      const text = this.stripTags(match[1]).trim();
      // Skip empty or very short blocks (likely navigation/spacer)
      if (text.length > 20) {
        blocks.push(text);
      }
    }

    // If no blocks found, fall back to stripping all tags
    let text: string;
    if (blocks.length > 0) {
      text = blocks.join('\n\n');
    } else {
      text = this.stripTags(cleaned).replace(/\s{3,}/g, '\n').trim();
    }

    // Prepend description if available and text is short
    if (description && text.length < 200) {
      text = `${description}\n\n${text}`;
    }

    return {title, text};
  }

  /**
   * Strip HTML tags and decode common entities.
   */
  private stripTags(html: string): string {
    return html
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/\s+/g, ' ');
  }

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: 'web_summary',
        description:
          'Fetch a web page URL and extract its main text content. Useful for reading articles, documentation, or any web page.',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description:
                'The full URL of the web page to fetch (e.g., "https://example.com/article").',
            },
          },
          required: ['url'],
        },
      },
    };
  }
}
