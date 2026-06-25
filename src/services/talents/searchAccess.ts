import type {SearchProvider, PageContent} from '../search/types';

/**
 * Read-only accessor the search engines use to reach the active provider and
 * result-count setting. Injected at `registerDefaultTalents()` so the engines
 * never import `SearchProviderStore` directly (preserves engine purity: no
 * MobX/store coupling inside `execute()`).
 */
export interface SearchAccess {
  /** Build the adapter for the currently-active provider, wired to its key. */
  getActiveProvider(): SearchProvider;
  /** True when the active provider has a non-empty BYOK key. */
  isConfigured(): boolean;
  /** Result count from settings (the budget `maxResults`). */
  getResultCount(): number;
  /** Deep-read fallback for providers without a native `read()`. */
  readWithDefaultReader(url: string): Promise<PageContent>;
}
