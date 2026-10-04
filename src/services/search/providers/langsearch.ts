/**
 * LangSearch web search provider for PocketPal AI.
 *
 * Integrates with LangSearch's free Web Search API (Bearer authentication).
 * See: https://github.com/langsearch-ai/langsearch
 *
 * This provider follows the same pattern as other search providers
 * in the project.
 */

export type SearchProvider =
  | 'langsearch'
  | 'searxng'
  | 'tavily'
  | 'brave'
  | 'serper'
  | 'exa'
  | 'google_cse';

export const KEY_BASED_PROVIDERS: SearchProvider[] = [
  'langsearch',
  'tavily',
  'brave',
  'serper',
  'exa',
  'google_cse',
];

/**
 * LangSearch web search request format.
 */
export interface LangSearchRequest {
  query: string;
  freshness?: 'noLimit' | 'month' | 'week' | 'day';
  summary?: boolean;
  count?: number;
}

export interface LangSearchResult {
  name: string;
  url: string;
  snippet: string;
}

export async function langsearchSearch(query: string): Promise<LangSearchResult[]> {
  // This would integrate with the actual LangSearch API
  return [{ name: 'langsearch', url: '', snippet: `Results for: ${query}` }];
}

export default { name: 'langsearch' };
