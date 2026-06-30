/**
 * Provider-agnostic internet-search types.
 *
 * Every provider adapter normalizes its wire JSON to these shapes; no
 * provider-specific field crosses this boundary. The talent engines and the
 * budgeting util operate only on `SearchHit` / `PageContent`.
 */

export type SearchProviderId = 'tavily' | 'brave' | 'exa' | 'parallel';

/** A single normalized search result. */
export interface SearchHit {
  title: string;
  /** Canonical result URL — always kept (citation + read_url target). */
  url: string;
  /** Smallest faithful body field the provider offers, as plain text. */
  snippet: string;
  /** ISO date if the provider supplies one. */
  publishedAt?: string;
}

/** A normalized, full-page read for `read_url`. */
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
 * Provider-agnostic adapter contract. An adapter reads its own BYOK key from
 * the secure store inside `search()`/`read()` (lazy), requests the provider's
 * smallest faithful body field, and throws on transport / auth / no-key /
 * timeout — never returns a silent empty on failure.
 */
export interface SearchProvider {
  readonly id: SearchProviderId;
  search(query: string, opts: SearchOptions): Promise<SearchHit[]>;
  /**
   * Optional native deep-read. Providers without one omit it; the `read_url`
   * talent falls back to a default reader.
   */
  read?(url: string): Promise<PageContent>;
}

/** Pure inputs to the budgeting util. */
export interface SearchBudget {
  /** From settings (default 3). */
  maxResults: number;
  /** ~280; snippets truncate on a word boundary, char boundary for CJK/Thai. */
  perSnippetChars: number;
  /** The talent's recommendedContextTokens — the result token ceiling. */
  tokenCeiling: number;
}
