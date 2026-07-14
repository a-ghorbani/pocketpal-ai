/**
 * TranslationEngine — translate text between languages using LibreTranslate.
 *
 * Architecture (ADR-2026-004): Client-direct connection to LibreTranslate,
 * no intermediate server. LibreTranslate is open-source and has free public
 * instances available, so no API key is required.
 *
 * Supports:
 * - Automatic language detection
 * - Translation between 50+ languages
 * - Multiple target languages in one request
 * - Custom instance URL for self-hosted deployments
 */

import {TalentEngine, TalentResult, ToolDefinition} from './types';
import {checkNetworkAccess, getNetworkDisabledError} from './networkUtils';

const DEFAULT_INSTANCE = 'https://libretranslate.de';
const REQUEST_TIMEOUT_MS = 15000;

interface TranslationResponse {
  translatedText: string;
  detectedLanguage?: {
    language: string;
    confidence: number;
  };
}

interface LanguagesResponse {
  code: string;
  name: string;
  targets: string[];
}

export class TranslationEngine implements TalentEngine {
  readonly name = 'translate';
  readonly recommendedContextTokens = 800;

  private customInstance: string | null = null;
  private cachedLanguages: LanguagesResponse[] | null = null;

  setInstance(url: string | null): void {
    this.customInstance = url;
    this.cachedLanguages = null;
  }

  async execute(args: Record<string, any>): Promise<TalentResult> {
    if (!checkNetworkAccess()) {
      return getNetworkDisabledError('translate');
    }

    const text = typeof args.text === 'string' ? args.text.trim() : '';

    if (!text) {
      return {
        type: 'error',
        summary: 'translate: missing or empty "text" argument',
        errorMessage: 'text argument is required and must be a non-empty string',
      };
    }

    if (text.length > 5000) {
      return {
        type: 'error',
        summary: 'translate: text exceeds 5000 character limit',
        errorMessage: 'Text must be 5000 characters or less.',
      };
    }

    const target =
      typeof args.target === 'string' ? args.target.trim().toLowerCase() : '';

    if (!target) {
      return {
        type: 'error',
        summary: 'translate: missing "target" language argument',
        errorMessage: 'target argument is required (e.g., "en", "zh", "es").',
      };
    }

    const source =
      typeof args.source === 'string'
        ? args.source.trim().toLowerCase()
        : 'auto';

    try {
      const url = `${this.getInstance()}/translate`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'PocketPalAI/1.0',
        },
        body: JSON.stringify({
          q: text,
          source,
          target,
          format: 'text',
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        if (response.status === 429) {
          return {
            type: 'error',
            summary: 'translate: rate limited',
            errorMessage:
              'Too many requests. Please try again later or use a custom instance.',
          };
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const data: TranslationResponse = await response.json();

      const detectedLang =
        source === 'auto' && data.detectedLanguage
          ? ` (detected: ${data.detectedLanguage.language}, confidence: ${(data.detectedLanguage.confidence * 100).toFixed(0)}%)`
          : '';

      const summary = `**Translation${detectedLang}:**\n\n${data.translatedText}\n\n**Original:**\n${text}`;

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
        summary: `translate: ${errMsg}`,
        errorMessage: errMsg,
      };
    }
  }

  private getInstance(): string {
    return this.customInstance || DEFAULT_INSTANCE;
  }

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: 'translate',
        description:
          'Translate text between languages using LibreTranslate. No API key required. ' +
          'Supports automatic source language detection and 50+ target languages. ' +
          'Useful for: understanding foreign text, writing in other languages, ' +
          'translating documents or messages.',
        parameters: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description:
                'The text to translate (max 5000 characters). Can be a single word, sentence, or paragraph.',
            },
            target: {
              type: 'string',
              description:
                'Target language code (e.g., "en" for English, "zh" for Chinese, "es" for Spanish, "fr" for French, "de" for German).',
              enum: [
                'af', 'ar', 'az', 'be', 'bg', 'bn', 'bs', 'ca', 'cs', 'da',
                'de', 'el', 'en', 'eo', 'es', 'et', 'fa', 'fi', 'fr', 'ga',
                'gl', 'he', 'hi', 'hr', 'hu', 'id', 'is', 'it', 'ja', 'ka',
                'ko', 'lt', 'lv', 'mk', 'ml', 'ms', 'mt', 'nb', 'nl', 'pl',
                'pt', 'ro', 'ru', 'sk', 'sl', 'sq', 'sr', 'sv', 'ta', 'te',
                'th', 'tr', 'uk', 'vi', 'zh',
              ],
            },
            source: {
              type: 'string',
              description:
                'Source language code. Use "auto" (default) for automatic detection.',
            },
          },
          required: ['text', 'target'],
        },
      },
    };
  }
}
