/**
 * RAG (Retrieval-Augmented Generation) types.
 *
 * Architecture (ADR-2026-005): Fully local RAG.
 * - Document parsing: text extraction from txt, md, pdf
 * - Embedding: local embedding model via llama.rn
 * - Vector store: on-device vector storage (AsyncStorage + similarity search)
 * - Retrieval: top-k similar chunks injected into context
 */

export type DocumentFormat = 'txt' | 'md' | 'pdf' | 'html' | 'json';

export interface KnowledgeDocument {
  /** Unique ID. */
  id: string;
  /** Document title. */
  title: string;
  /** File format. */
  format: DocumentFormat;
  /** Original file path (if imported from file). */
  filePath?: string;
  /** Total text content (for re-chunking if needed). */
  content: string;
  /** Number of characters. */
  charCount: number;
  /** Number of chunks. */
  chunkCount: number;
  /** When the document was added. */
  createdAt: string;
  /** Tags for categorization. */
  tags?: string[];
}

export interface DocumentChunk {
  /** Unique ID. */
  id: string;
  /** Parent document ID. */
  documentId: string;
  /** Chunk text content. */
  text: string;
  /** Chunk index within the document. */
  index: number;
  /** Embedding vector (if computed). */
  embedding?: number[];
  /** Token count (approximate). */
  tokenCount?: number;
}

export interface SearchResult {
  /** The matching chunk. */
  chunk: DocumentChunk;
  /** Similarity score 0..1. */
  score: number;
  /** The parent document. */
  document: KnowledgeDocument;
}

export interface RAGConfig {
  /** Chunk size in characters. */
  chunkSize: number;
  /** Overlap between chunks in characters. */
  chunkOverlap: number;
  /** Max chunks to retrieve per query. */
  topK: number;
  /** Min similarity score to include in results. */
  minScore: number;
  /** Embedding dimension. */
  embeddingDimension: number;
}

export const DEFAULT_RAG_CONFIG: RAGConfig = {
  chunkSize: 500,
  chunkOverlap: 50,
  topK: 5,
  minScore: 0.3,
  embeddingDimension: 384,
};
