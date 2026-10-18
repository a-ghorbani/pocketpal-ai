import type {SearchProvider, PageContent} from '../search/types';

export const SEARCH_NOT_SET_UP_MESSAGE =
  "Internet search isn't set up yet. Finish setup in Settings → Internet Search.";

/**
 * Injected at `registerDefaultTalents()` so the search engines never import
 * `SearchProviderStore` — keeps `execute()` free of MobX/store coupling.
 */
export interface SearchAccess {
  getActiveProvider(): SearchProvider;
  /**
   * True only when the user has consented and the active provider is configured
   * (has a key, unless it needs none).
   * Consent is enforced here, not just in the Settings UI.
   */
  canSearch(): boolean;
  getResultCount(): number;
  readWithDefaultReader(
    url: string,
    signal?: AbortSignal,
  ): Promise<PageContent>;
}
