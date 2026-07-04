/**
 * Multi-Provider types for remote LLM inference.
 *
 * Each provider has its own API format, but all conform to the
 * CompletionEngine interface so the rest of the app is agnostic.
 *
 * Architecture: Client-direct connection, user provides API Key.
 * No backend proxy — the app talks to the provider API directly.
 */

export type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'groq';

export interface ProviderConfig {
  id: ProviderId;
  /** Display name. */
  name: string;
  /** Base API URL (without path). */
  baseUrl: string;
  /** Default models offered by this provider. */
  defaultModels: ProviderModel[];
  /** Whether the provider offers a free tier. */
  hasFreeTier: boolean;
  /** API key placeholder for UI. */
  apiKeyPlaceholder: string;
  /** Help URL for getting an API key. */
  apiKeyHelpUrl: string;
}

export interface ProviderModel {
  /** Model ID as expected by the API. */
  id: string;
  /** Display name. */
  name: string;
  /** Max context window in tokens. */
  contextWindow: number;
  /** Whether the model supports tool calling. */
  supportsTools: boolean;
  /** Whether the model supports vision/image input. */
  supportsVision: boolean;
}

export const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com',
    hasFreeTier: false,
    apiKeyPlaceholder: 'sk-...',
    apiKeyHelpUrl: 'https://platform.openai.com/api-keys',
    defaultModels: [
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: true,
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o mini',
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: true,
      },
    ],
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    hasFreeTier: false,
    apiKeyPlaceholder: 'sk-ant-...',
    apiKeyHelpUrl: 'https://console.anthropic.com/settings/keys',
    defaultModels: [
      {
        id: 'claude-sonnet-4-20250514',
        name: 'Claude Sonnet 4',
        contextWindow: 200000,
        supportsTools: true,
        supportsVision: true,
      },
      {
        id: 'claude-3-5-haiku-20241022',
        name: 'Claude 3.5 Haiku',
        contextWindow: 200000,
        supportsTools: true,
        supportsVision: true,
      },
    ],
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    hasFreeTier: true,
    apiKeyPlaceholder: 'AIza...',
    apiKeyHelpUrl: 'https://aistudio.google.com/app/apikey',
    defaultModels: [
      {
        id: 'gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        contextWindow: 1000000,
        supportsTools: true,
        supportsVision: true,
      },
      {
        id: 'gemini-2.0-flash-lite',
        name: 'Gemini 2.0 Flash Lite',
        contextWindow: 1000000,
        supportsTools: true,
        supportsVision: true,
      },
    ],
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai',
    hasFreeTier: true,
    apiKeyPlaceholder: 'gsk_...',
    apiKeyHelpUrl: 'https://console.groq.com/keys',
    defaultModels: [
      {
        id: 'llama-3.3-70b-versatile',
        name: 'Llama 3.3 70B Versatile',
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: false,
      },
      {
        id: 'llama-3.1-8b-instant',
        name: 'Llama 3.1 8B Instant',
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: false,
      },
    ],
  },
};

/** Get a provider config by id. */
export function getProvider(id: ProviderId): ProviderConfig {
  return PROVIDERS[id];
}

/** Get all provider configs. */
export function getAllProviders(): ProviderConfig[] {
  return Object.values(PROVIDERS);
}
