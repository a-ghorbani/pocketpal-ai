import type {SearchProvider, PageContent} from '../search/types';

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
  getResultCount(): number;
  readWithDefaultReader(url: string): Promise<PageContent>;
}
