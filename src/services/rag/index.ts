/**
 * RAG (Retrieval-Augmented Generation) service barrel export.
 *
 * Architecture (ADR-2026-005): Fully local RAG pipeline.
 *
 * Usage:
 *   import {ragManager, DocumentParser, TextChunker} from '@/services/rag';
 *
 * Pipeline:
 *   DocumentParser → TextChunker → VectorStore → RAGManager
 */

export {DocumentParser} from './DocumentParser';
export {TextChunker} from './TextChunker';
export {vectorStore, VectorStore} from './VectorStore';
export {ragManager, RAGManager} from './RAGManager';

export type {
  DocumentFormat,
  KnowledgeDocument,
  DocumentChunk,
  SearchResult,
  RAGConfig,
} from './types';

export {DEFAULT_RAG_CONFIG} from './types';
