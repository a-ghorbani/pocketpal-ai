import type {SearchProvider, PageContent} from '../search/types';

/**
 * Shared "not enabled" copy for the search talents. Keyless providers (e.g.
 * Bing) must not be told to go set an API key — consent is the only blocker.
 */
export const notEnabledMessage = (
  providerId: string,
  requiresKey: boolean,
): string =>
  requiresKey
    ? `Internet search is not enabled. Accept the disclosure and set an API key for ${providerId} in Settings → Internet Search.`
    : `Internet search is not enabled. Accept the disclosure in Settings → Internet Search to enable searching with ${providerId} — no API key required.`;

/**
 * Injected at `registerDefaultTalents()` so the search engines never import
 * `SearchProviderStore` — keeps `execute()` free of MobX/store coupling.
 */
export interface SearchAccess {
  getActiveProvider(): SearchProvider;
  /**
   * True only when the user has consented AND the active provider has a key.
   * Consent is enforced here, not just in the Settings UI.
   */
  canSearch(): boolean;
  /**
   * False for keyless providers. Drives the "not enabled" copy so a keyless
   * provider isn't told to go set an API key it doesn't need.
   */
  requiresKey(): boolean;
  getResultCount(): number;
  readWithDefaultReader(
    url: string,
    signal?: AbortSignal,
  ): Promise<PageContent>;
}
