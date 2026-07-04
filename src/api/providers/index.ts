/**
 * Provider barrel export.
 *
 * Usage:
 *   import {createProviderEngine, PROVIDERS} from '../../api/providers';
 */

export * from './types';
export {AnthropicCompletionEngine} from './AnthropicCompletionEngine';
export {GeminiCompletionEngine} from './GeminiCompletionEngine';
export {GroqCompletionEngine} from './GroqCompletionEngine';

import type {CompletionEngine} from '../../utils/completionTypes';
import {OpenAICompletionEngine} from '../completionEngines';
import {AnthropicCompletionEngine} from './AnthropicCompletionEngine';
import {GeminiCompletionEngine} from './GeminiCompletionEngine';
import {GroqCompletionEngine} from './GroqCompletionEngine';
import type {ProviderId} from './types';

/**
 * Factory: create a CompletionEngine for the given provider.
 *
 * @param providerId - The provider ID
 * @param apiKey - User's API key for the provider
 * @param modelId - The model ID to use
 * @param baseUrl - Optional override base URL
 */
export function createProviderEngine(
  providerId: ProviderId,
  apiKey: string,
  modelId: string,
  baseUrl?: string,
): CompletionEngine {
  switch (providerId) {
    case 'openai':
      return new OpenAICompletionEngine(
        baseUrl || 'https://api.openai.com',
        modelId,
        apiKey,
      );

    case 'anthropic':
      return new AnthropicCompletionEngine(
        apiKey,
        modelId,
        baseUrl || 'https://api.anthropic.com',
      );

    case 'gemini':
      return new GeminiCompletionEngine(
        apiKey,
        modelId,
        baseUrl || 'https://generativelanguage.googleapis.com',
      );

    case 'groq':
      return new GroqCompletionEngine(
        apiKey,
        modelId,
        baseUrl || 'https://api.groq.com/openai',
      );

    default:
      throw new Error(`Unknown provider: ${providerId}`);
  }
}
