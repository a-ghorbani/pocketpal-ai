/**
 * Search services index for PocketPal AI.
 *
 * Exports the search provider factory and wiring for integrating
 * various web-search providers (langsearch, tavily, brave, etc.)
 * into the app's search/talent system.
 */

import {
  getSearchProvider,
  setSearchProvider,
  getSearchEndpoint,
  setSearchEndpoint,
  getGoogleCseId,
  setGoogleCseId,
  getApiKey,
  setApiKey,
  KEY_BASED_PROVIDERS,
  SearchProvider,
} from './providers/langsearch';

export {
  getSearchProvider,
  setSearchProvider,
  getSearchEndpoint,
  setSearchEndpoint,
  getGoogleCseId,
  setGoogleCseId,
  getApiKey,
  setApiKey,
  KEY_BASED_PROVIDERS,

  SearchProvider,
};
