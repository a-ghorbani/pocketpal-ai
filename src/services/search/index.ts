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

/** Wires each adapter to a key accessor so it reads its BYOK key lazily, without importing the store. */
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

/** Fallback reader for providers without native read(): r.jina.ai returns clean plain text, no key. */
export const readWithDefaultReader = async (
  url: string,
): Promise<PageContent> => {
  const text = await fetchText(`https://r.jina.ai/${encodeURI(url)}`, {
    method: 'GET',
  });
  return {url, text};
};
