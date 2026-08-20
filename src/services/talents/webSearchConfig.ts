import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';

export type WebSearchProvider =
  | 'langsearch'
  | 'searxng'
  | 'tavily'
  | 'brave'
  | 'serper'
  | 'exa'
  | 'google_cse';

// Providers that need a secret API key stored in the keychain.
export const KEY_BASED_PROVIDERS: WebSearchProvider[] = [
  'langsearch',
  'tavily',
  'brave',
  'serper',
  'exa',
  'google_cse',
];

const PROVIDER_KEY = 'webSearchProvider';
const SEARXNG_ENDPOINT_KEY = 'webSearchEndpoint';
const GOOGLE_CSE_ID_KEY = 'webSearchGoogleCseId';
const KEYCHAIN_SERVICE_PREFIX = 'pocketpalnet.websearch.';

export async function getSearchProvider(): Promise<WebSearchProvider> {
  const valid: WebSearchProvider[] = [
    'langsearch',
    'searxng',
    'tavily',
    'brave',
    'serper',
    'exa',
    'google_cse',
  ];
  try {
    const value = await AsyncStorage.getItem(PROVIDER_KEY);
    return valid.includes(value as WebSearchProvider)
      ? (value as WebSearchProvider)
      : 'searxng';
  } catch {
    return 'searxng';
  }
}

export async function setSearchProvider(
  provider: WebSearchProvider,
): Promise<void> {
  try {
    await AsyncStorage.setItem(PROVIDER_KEY, provider);
  } catch (e) {
    console.error('Failed to save web search provider:', e);
  }
}

/** SearXNG instance URL. Returns null if not yet set. */
export async function getSearchEndpoint(): Promise<string | null> {
  try {
    const value = await AsyncStorage.getItem(SEARXNG_ENDPOINT_KEY);
    return value && value.trim().length > 0 ? value.trim() : null;
  } catch {
    return null;
  }
}

export async function setSearchEndpoint(
  url: string | null,
): Promise<void> {
  try {
    if (!url || url.trim().length === 0) {
      await AsyncStorage.removeItem(SEARXNG_ENDPOINT_KEY);
    } else {
      await AsyncStorage.setItem(SEARXNG_ENDPOINT_KEY, url.trim());
    }
  } catch (e) {
    console.error('Failed to save web search endpoint:', e);
  }
}

/** Google Custom Search Engine ID (cx). Not secret, plain storage is fine. */
export async function getGoogleCseId(): Promise<string | null> {
  try {
    const value = await AsyncStorage.getItem(GOOGLE_CSE_ID_KEY);
    return value && value.trim().length > 0 ? value.trim() : null;
  } catch {
    return null;
  }
}

export async function setGoogleCseId(id: string | null): Promise<void> {
  try {
    if (!id || id.trim().length === 0) {
      await AsyncStorage.removeItem(GOOGLE_CSE_ID_KEY);
    } else {
      await AsyncStorage.setItem(GOOGLE_CSE_ID_KEY, id.trim());
    }
  } catch (e) {
    console.error('Failed to save Google CSE ID:', e);
  }
}

/**
 * Reads the user's API key for a given key-based provider from the
 * OS-encrypted keystore. Returns null if not yet set.
 */
export async function getApiKey(
  provider: WebSearchProvider,
): Promise<string | null> {
  try {
    const creds = await Keychain.getGenericPassword({
      service: KEYCHAIN_SERVICE_PREFIX + provider,
    });
    if (!creds) {
      return null;
    }
    const value = creds.password;
    return value && value.trim().length > 0 ? value.trim() : null;
  } catch (e) {
    console.error(`Failed to read ${provider} API key from keychain:`, e);
    return null;
  }
}

/**
 * Persists the user's API key for a given key-based provider to the
 * OS-encrypted keystore. Pass an empty string or null to clear it.
 */
export async function setApiKey(
  provider: WebSearchProvider,
  key: string | null,
): Promise<void> {
  const service = KEYCHAIN_SERVICE_PREFIX + provider;
  try {
    if (!key || key.trim().length === 0) {
      await Keychain.resetGenericPassword({service});
    } else {
      await Keychain.setGenericPassword(provider, key.trim(), {service});
    }
  } catch (e) {
    console.error(`Failed to save ${provider} API key to keychain:`, e);
  }
}
