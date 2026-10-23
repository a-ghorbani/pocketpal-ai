export type DocumentKind = 'pdf' | 'text';

export interface PageRange {
  from: number;
  to: number;
}

export interface DocumentRef {
  id: string;
  name: string;
  kind: DocumentKind;
  byteSize: number;
  pageCount?: number;
  pageRange?: PageRange;
  charCount: number;
  tokenEstimate: number;
  tokenCount?: {modelId: string; n: number};
  /** Written once, by the send path's plan; absent reads as `full`. */
  mode?: DocumentMode;
  /** The user chose "Search instead"; written only by the composer. */
  searchPinned?: true;
}

export type DocumentMode = 'full' | 'searched';

export interface DocumentTextFile {
  version: 1;
  firstPage: number;
  pages: string[];
}

export type DocumentRefusalReason =
  | 'unsupported_type'
  | 'copy_failed'
  | 'too_large'
  | 'pdf_unreadable'
  | 'pdf_encrypted'
  | 'pdf_unavailable'
  | 'no_text'
  | 'binary'
  | 'text_too_long'
  | 'too_many_files';

export type RangeLimitReason = 'too_many_pages' | 'too_many_chars';

export type ComposerDocumentStatus = 'importing' | 'needs_range' | 'ready';

export interface ComposerDocument {
  key: string;
  status: ComposerDocumentStatus;
  name: string;
  ref?: DocumentRef;
  rangeLimit?: RangeLimitReason;
}

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
export const MAX_TEXT_DOCUMENT_BYTES = 3_000_000;
export const MAX_RANGE_PAGES = 500;
export const MAX_DOCUMENT_CHARS = 1_000_000;
export const MAX_DOCUMENTS_PER_MESSAGE = 5;
export const REPLY_RESERVE = 1024;

export const FULL_DOC_MAX_TOKENS = 2048;
export const FULL_TOTAL_MAX_TOKENS = 2048;
export const EXCERPT_MAX_TOKENS = 2048;
export const PASSAGE_MAX_TOKENS = 200;
export const EXCERPT_MAX_PASSAGES = 2;
export const EXCERPT_K = 5;
export const CHUNKER_VERSION = 1;
