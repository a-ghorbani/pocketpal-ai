/**
 * WebSummaryEngine — fetch a URL and extract its main text content.
 *
 * Architecture (ADR-2026-004 / roadmap 2.3): Client-direct fetch, no
 * intermediate server. Extracts readable text with improved heuristics,
 * including metadata extraction, language detection, and readability scoring.
 *
 * Improvements over basic extraction:
 * - Better content detection via semantic HTML tags (article, main, etc.)
 * - Metadata extraction (author, published date, site name)
 * - Readability-based scoring to find the main content block
 * - Cleaner text with whitespace normalization
 * - Supports requesting markdown-style formatting
 */

import {TalentEngine, TalentResult, ToolDefinition} from './types';
import {checkNetworkAccess, getNetworkDisabledError} from './networkUtils';

const MAX_CONTENT_LENGTH = 12000;
const REQUEST_TIMEOUT_MS = 15000;
const MIN_CONTENT_CHARS = 50;

interface ExtractedContent {
  title: string;
  author?: string;
  siteName?: string;
  publishedDate?: string;
  description?: string;
  text: string;
  wordCount: number;
  lang?: string;
}

export class WebSummaryEngine implements TalentEngine {
  readonly name = 'web_summary';
  readonly recommendedContextTokens = 1500;

  async execute(args: Record<string, any>): Promise<TalentResult> {
    if (!checkNetworkAccess()) {
      return getNetworkDisabledError('web_summary');
    }

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

    const format =
      typeof args.format === 'string' &&
      ['text', 'markdown'].includes(args.format)
        ? (args.format as 'text' | 'markdown')
        : 'text';

    const maxLength =
      typeof args.max_length === 'number' && args.max_length > 0
        ? Math.min(args.max_length, MAX_CONTENT_LENGTH)
        : MAX_CONTENT_LENGTH;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS,
      );

      const response = await fetch(validUrl.toString(), {
        headers: {
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'User-Agent':
            'Mozilla/5.0 (compatible; PocketPalAI/1.0; +https://github.com/pocketpal-ai)',
          'Accept-Language': 'en-US,en;q=0.9',
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

      if (contentType.includes('application/json')) {
        const jsonText = await response.text();
        const truncated = this.truncate(jsonText, maxLength);
        return {
          type: 'text',
          summary: `URL: ${url}\nContent-Type: JSON\n\n${truncated}`,
        };
      }

      if (
        !contentType.includes('text/html') &&
        !contentType.includes('text/plain') &&
        !contentType.includes('application/xml')
      ) {
        return {
          type: 'text',
          summary: `The URL ${url} returned non-text content (type: ${contentType}). Cannot extract text.`,
        };
      }

      const html = await response.text();
      const extracted = this.extractContent(html, validUrl);

      if (!extracted.text || extracted.text.length < MIN_CONTENT_CHARS) {
        return {
          type: 'text',
          summary: `No readable text content found at ${url}. The page may be empty, require JavaScript, or be blocked by the server.`,
        };
      }

      const truncatedText = this.truncate(extracted.text, maxLength);
      const summary = this.buildSummary(
        extracted,
        url,
        truncatedText,
        format,
        extracted.text.length > maxLength,
      );

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

  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.slice(0, maxLength) + '\n\n... (content truncated due to length limits)';
  }

  private buildSummary(
    extracted: ExtractedContent,
    url: string,
    text: string,
    format: 'text' | 'markdown',
    truncated: boolean,
  ): string {
    const lines: string[] = [];

    lines.push(`Title: ${extracted.title || 'Untitled'}`);
    lines.push(`URL: ${url}`);

    if (extracted.siteName) {
      lines.push(`Site: ${extracted.siteName}`);
    }
    if (extracted.author) {
      lines.push(`Author: ${extracted.author}`);
    }
    if (extracted.publishedDate) {
      lines.push(`Published: ${extracted.publishedDate}`);
    }
    lines.push(`Word count: ~${extracted.wordCount}`);
    if (extracted.lang) {
      lines.push(`Language: ${extracted.lang}`);
    }

    lines.push('');
    lines.push('---');
    lines.push('');

    if (format === 'markdown') {
      lines.push(this.textToMarkdown(text, extracted.title));
    } else {
      lines.push(text);
    }

    if (truncated) {
      lines.push('');
      lines.push('---');
      lines.push(`Note: Content was truncated. Full content may be longer.`);
    }

    return lines.join('\n');
  }

  private textToMarkdown(text: string, title?: string): string {
    let md = '';
    if (title) {
      md += `# ${title}\n\n`;
    }
    const paragraphs = text.split(/\n\s*\n/);
    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (trimmed) {
        md += `${trimmed}\n\n`;
      }
    }
    return md.trim();
  }

  /**
   * Extract readable content from HTML using multiple strategies:
   * 1. Try semantic HTML (article, main tags)
   * 2. Try meta tags for metadata
   * 3. Fall back to content-based scoring
   */
  private extractContent(html: string, url: URL): ExtractedContent {
    const metadata = this.extractMetadata(html);
    const title = metadata.title || this.extractTitle(html) || url.hostname;

    let text = '';
    let wordCount = 0;

    const semanticContent = this.extractSemanticContent(html);
    if (semanticContent && semanticContent.length > 200) {
      text = semanticContent;
    } else {
      text = this.extractBestContent(html);
    }

    text = this.normalizeWhitespace(text);
    wordCount = this.countWords(text);

    const lang = this.detectLanguage(text);

    return {
      title,
      author: metadata.author,
      siteName: metadata.siteName,
      publishedDate: metadata.publishedDate,
      description: metadata.description,
      text,
      wordCount,
      lang,
    };
  }

  private extractMetadata(html: string): {
    title?: string;
    description?: string;
    author?: string;
    siteName?: string;
    publishedDate?: string;
  } {
    const meta: Record<string, string> = {};

    const ogTitle = html.match(
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([\s\S]*?)["']/i,
    );
    if (ogTitle) meta.title = this.decodeEntities(ogTitle[1]);

    const ogDesc = html.match(
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([\s\S]*?)["']/i,
    );
    if (ogDesc) meta.description = this.decodeEntities(ogDesc[1]);

    const ogSite = html.match(
      /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([\s\S]*?)["']/i,
    );
    if (ogSite) meta.siteName = this.decodeEntities(ogSite[1]);

    const ogAuthor = html.match(
      /<meta[^>]+property=["']article:author["'][^>]+content=["']([\s\S]*?)["']/i,
    );
    if (ogAuthor) meta.author = this.decodeEntities(ogAuthor[1]);

    const metaAuthor = html.match(
      /<meta[^>]+name=["']author["'][^>]+content=["']([\s\S]*?)["']/i,
    );
    if (metaAuthor && !meta.author) {
      meta.author = this.decodeEntities(metaAuthor[1]);
    }

    const metaDesc = html.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["']/i,
    );
    if (metaDesc && !meta.description) {
      meta.description = this.decodeEntities(metaDesc[1]);
    }

    const pubDate = html.match(
      /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([\s\S]*?)["']/i,
    );
    if (pubDate) meta.publishedDate = this.decodeEntities(pubDate[1]);

    const metaPubDate = html.match(
      /<meta[^>]+name=["']pubdate["'][^>]+content=["']([\s\S]*?)["']/i,
    );
    if (metaPubDate && !meta.publishedDate) {
      meta.publishedDate = this.decodeEntities(metaPubDate[1]);
    }

    return meta;
  }

  private extractTitle(html: string): string {
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (match) {
      return this.decodeEntities(match[1]).trim();
    }
    return '';
  }

  /**
   * Extract content from semantic HTML tags.
   * Priority: article > main > section[role="main"] > .content / #content
   */
  private extractSemanticContent(html: string): string {
    const patterns = [
      /<article[^>]*>([\s\S]*?)<\/article>/gi,
      /<main[^>]*>([\s\S]*?)<\/main>/gi,
      /<section[^>]+role=["']main["'][^>]*>([\s\S]*?)<\/section>/gi,
      /<div[^>]+id=["']content["'][^>]*>([\s\S]*?)<\/div>/gi,
      /<div[^>]+class=["'][^"']*content[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi,
    ];

    for (const pattern of patterns) {
      const matches = Array.from(html.matchAll(pattern));
      let bestMatch = '';
      for (const match of matches) {
        const content = this.stripTags(match[1]);
        if (content.length > bestMatch.length) {
          bestMatch = content;
        }
      }
      if (bestMatch.length > 200) {
        return this.cleanText(bestMatch);
      }
    }

    return '';
  }

  /**
   * Extract the best content block by scoring paragraphs.
   * Uses link density and text length heuristics (simplified readability).
   */
  private extractBestContent(html: string): string {
    let cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<aside[\s\S]*?<\/aside>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');

    const paraPattern = /<(p|div|section|article)[^>]*>([\s\S]*?)<\/\1>/gi;
    const candidates: {text: string; score: number}[] = [];

    let match;
    while ((match = paraPattern.exec(cleaned)) !== null) {
      const text = this.stripTags(match[2]).trim();
      if (text.length < 25) continue;

      const linkCount = (match[2].match(/<a\s/gi) || []).length;
      const textLen = text.length;
      const linkDensity = linkCount / Math.max(textLen, 1);

      const score =
        textLen * (1 - linkDensity * 2) +
        (text.split(/[.!?。！？]/).length - 1) * 10;

      if (score > 50) {
        candidates.push({text, score});
      }
    }

    if (candidates.length === 0) {
      const allText = this.stripTags(cleaned);
      return this.cleanText(allText);
    }

    candidates.sort((a, b) => b.score - a.score);

    const topCandidates = candidates.slice(0, 20);
    const paragraphs: string[] = [];
    for (const candidate of topCandidates) {
      if (candidate.text.length > 20) {
        paragraphs.push(candidate.text);
      }
    }

    return paragraphs.join('\n\n');
  }

  private stripTags(html: string): string {
    return html.replace(/<[^>]+>/g, '');
  }

  private decodeEntities(text: string): string {
    return text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, '/')
      .replace(/&hellip;/g, '…')
      .replace(/&mdash;/g, '—')
      .replace(/&ndash;/g, '–')
      .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16)),
      );
  }

  private normalizeWhitespace(text: string): string {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private cleanText(text: string): string {
    let cleaned = this.decodeEntities(text);
    cleaned = this.normalizeWhitespace(cleaned);

    const lines = cleaned.split('\n');
    const filteredLines = lines.filter(
      line => line.trim().length > 0 && line.trim().length < 500,
    );

    return filteredLines.join('\n');
  }

  private countWords(text: string): number {
    const englishWords = text.match(/[a-zA-Z]+/g) || [];
    const cjkChars = text.match(/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g) || [];
    return englishWords.length + cjkChars.length;
  }

  /**
   * Simple language detection based on character sets.
   * Returns ISO 639-1 code or undefined.
   */
  private detectLanguage(text: string): string | undefined {
    const cjkCount = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const japaneseCount =
      (text.match(/[\u3040-\u30ff]/g) || []).length;
    const koreanCount = (text.match(/[\uac00-\ud7af]/g) || []).length;
    const cyrillicCount = (text.match(/[\u0400-\u04ff]/g) || []).length;
    const latinCount = (text.match(/[a-zA-Z]/g) || []).length;

    const total = cjkCount + japaneseCount + koreanCount + cyrillicCount + latinCount;
    if (total < 20) return undefined;

    if (cjkCount / total > 0.5) return 'zh';
    if (japaneseCount / total > 0.3) return 'ja';
    if (koreanCount / total > 0.5) return 'ko';
    if (cyrillicCount / total > 0.4) return 'ru';
    if (latinCount / total > 0.5) {
      return 'en';
    }

    return undefined;
  }

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: 'web_summary',
        description:
          'Fetch a web page URL and extract its main text content, title, author, and metadata. ' +
          'Useful for reading articles, documentation, blog posts, or any web page. ' +
          'Works best with text-heavy pages; may fail on JavaScript-heavy sites.',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description:
                'The full URL of the web page to fetch (e.g., "https://example.com/article").',
            },
            format: {
              type: 'string',
              description:
                'Output format: "text" (default) for plain text, or "markdown" for Markdown-style formatting.',
              enum: ['text', 'markdown'],
            },
            max_length: {
              type: 'number',
              description:
                'Maximum character length of extracted content (default: 12000, max: 12000).',
            },
          },
          required: ['url'],
        },
      },
    };
  }
}
