/** Provider-agnostic search types — no provider-specific field crosses this boundary. */

export type SearchProviderId = 'tavily' | 'brave' | 'exa' | 'parallel';

export interface SearchHit {
  title: string;
  /** Canonical result URL — always kept (citation + read_url target). */
  url: string;
  /** Smallest faithful body field the provider offers, as plain text. */
  snippet: string;
  /** ISO date, if provided. */
  publishedAt?: string;
}

export interface PageContent {
  url: string;
  title?: string;
  /** Plain-text page body, pre-budget. */
  text: string;
}

export interface SearchOptions {
  maxResults: number;
}

/**
 * Adapter contract: read the BYOK key lazily inside search()/read(), and throw
 * on transport/auth/no-key/timeout — never return a silent empty.
 */
export interface SearchProvider {
  readonly id: SearchProviderId;
  search(query: string, opts: SearchOptions): Promise<SearchHit[]>;
  /** Optional native deep-read; absent → read_url uses the default reader. */
  read?(url: string): Promise<PageContent>;
}

export interface SearchBudget {
  /** From settings (default 5). */
  maxResults: number;
  /** ~280 chars per snippet. */
  perSnippetChars: number;
  /** The talent's recommendedContextTokens — the result token ceiling. */
  tokenCeiling: number;
}
