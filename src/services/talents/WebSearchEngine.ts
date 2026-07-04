/**
 * WebSearchEngine — client-side web search via DuckDuckGo Instant Answer API.
 *
 * Architecture (ADR-2026-004): Client-direct connection to search engine,
 * no intermediate server. DuckDuckGo requires no API key, so it works
 * out-of-the-box. Falls back gracefully when no instant answer is available.
 */

import {TalentEngine, TalentResult, ToolDefinition} from './types';

const DDG_API = 'https://api.duckduckgo.com';

interface DDGRelatedTopic {
  text?: string;
  url?: string;
  icon?: {URL?: string};
  topics?: DDGRelatedTopic[];
}

interface DDGResponse {
  AbstractText?: string;
  AbstractSource?: string;
  AbstractURL?: string;
  Heading?: string;
  Image?: string;
  Answer?: string;
  AnswerType?: string;
  Definition?: string;
  DefinitionSource?: string;
  DefinitionURL?: string;
  RelatedTopics?: DDGRelatedTopic[];
  Type?: string;
  Redirect?: string;
  Results?: DDGRelatedTopic[];
}

export class WebSearchEngine implements TalentEngine {
  readonly name = 'web_search';
  readonly recommendedContextTokens = 800;

  async execute(args: Record<string, any>): Promise<TalentResult> {
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
        ? Math.min(args.limit, 10)
        : 5;

    try {
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
        return {
          type: 'error',
          summary: `web_search: HTTP ${response.status} from DuckDuckGo`,
          errorMessage: `Search request failed with status ${response.status}`,
        };
      }

      const data: DDGResponse = await response.json();

      // Build the summary from available fields
      const parts: string[] = [];

      // Priority 1: Direct answer
      if (data.Answer) {
        parts.push(`Answer: ${data.Answer}`);
      }

      // Priority 2: Definition
      if (data.Definition) {
        parts.push(
          `${data.Definition} (Source: ${data.DefinitionSource || 'DuckDuckGo'})`,
        );
        if (data.DefinitionURL) {
          parts.push(`URL: ${data.DefinitionURL}`);
        }
      }

      // Priority 3: Abstract
      if (data.AbstractText) {
        parts.push(
          `${data.AbstractText} (Source: ${data.AbstractSource || 'DuckDuckGo'})`,
        );
        if (data.AbstractURL) {
          parts.push(`URL: ${data.AbstractURL}`);
        }
      }

      // Priority 4: Related topics
      const relatedTopics = this.flattenTopics(
        data.RelatedTopics || [],
      ).slice(0, limit);

      if (relatedTopics.length > 0) {
        parts.push('\nRelated results:');
        relatedTopics.forEach((topic, idx) => {
          const text = topic.text || '';
          const topicUrl = topic.url || '';
          if (text) {
            parts.push(`${idx + 1}. ${text}`);
            if (topicUrl) {
              parts.push(`   ${topicUrl}`);
            }
          }
        });
      }

      // If nothing found
      if (parts.length === 0) {
        return {
          type: 'text',
          summary: `No instant answer found for "${query}". Try rephrasing or use a more specific query.`,
        };
      }

      const summary = parts.join('\n');
      return {
        type: 'text',
        summary,
      };
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
   * Flatten nested related topics (DuckDuckGo groups topics under
   * nested `topics` arrays for disambiguation).
   */
  private flattenTopics(
    topics: DDGRelatedTopic[],
  ): DDGRelatedTopic[] {
    const result: DDGRelatedTopic[] = [];
    for (const topic of topics) {
      if (topic.topics && topic.topics.length > 0) {
        result.push(...this.flattenTopics(topic.topics));
      } else if (topic.text) {
        result.push(topic);
      }
    }
    return result;
  }

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: 'web_search',
        description:
          'Search the web using DuckDuckGo. Returns instant answers, definitions, and related results. No API key required.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description:
                'The search query string. Be specific for better results.',
            },
            limit: {
              type: 'number',
              description:
                'Maximum number of related results to return (default: 5, max: 10).',
            },
          },
          required: ['query'],
        },
      },
    };
  }
}
