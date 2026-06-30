import type {SearchProvider, SearchProviderId, PageContent} from './types';
import {fetchText} from './providers/http';
import {TavilyProvider} from './providers/tavily';
import {BraveProvider} from './providers/brave';
import {ExaProvider} from './providers/exa';
import {ParallelProvider} from './providers/parallel';

export type {
  SearchProvider,
  SearchProviderId,
  SearchHit,
  PageContent,
  SearchBudget,
  SearchOptions,
} from './types';
export {
  budgetHits,
  budgetPage,
  getCachedHits,
  setCachedHits,
  resetSearchCache,
} from './searchBudget';

/**
 * Build the provider adapter for `id`, wiring it to a key accessor so the
 * adapter reads its own BYOK key lazily without importing the store.
 */
export const createSearchProvider = (
  id: SearchProviderId,
  getKey: () => string,
): SearchProvider => {
  switch (id) {
    case 'tavily':
      return new TavilyProvider(getKey);
    case 'brave':
      return new BraveProvider(getKey);
    case 'exa':
      return new ExaProvider(getKey);
    case 'parallel':
      return new ParallelProvider(getKey);
  }
};

/**
 * Default deep-reader for providers without a native `read()`. Uses r.jina.ai,
 * which returns clean plain text for a URL with no API key required.
 */
export const readWithDefaultReader = async (
  url: string,
): Promise<PageContent> => {
  const text = await fetchText(`https://r.jina.ai/${encodeURI(url)}`, {
    method: 'GET',
  });
  return {url, text};
};
