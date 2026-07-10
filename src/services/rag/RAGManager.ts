/**
 * RAGManager — unified entry point for knowledge base operations.
 *
 * Combines:
 * - DocumentParser: text extraction
 * - TextChunker: chunk splitting
 * - VectorStore: storage and cosine similarity search
 * - EmbeddingEngine: local vectorization (LexicalEmbeddingEngine by default)
 *
 * Architecture (ADR-2026-005): Fully local RAG pipeline.
 * No external embedding API or vector database required. Retrieval now uses
 * real on-device vectors (graded cosine similarity) instead of the old binary
 * keyword match, and stays 100% offline.
 */

import {DocumentParser} from './DocumentParser';
import {TextChunker} from './TextChunker';
import {vectorStore} from './VectorStore';
import {LexicalEmbeddingEngine} from './embeddings/LexicalEmbeddingEngine';
import type {IEmbeddingEngine} from './embeddings/IEmbeddingEngine';
import type {
  KnowledgeDocument,
  DocumentChunk,
  SearchResult,
  DocumentFormat,
  RAGConfig,
} from './types';
import {DEFAULT_RAG_CONFIG} from './types';

export class RAGManager {
  private config: RAGConfig = DEFAULT_RAG_CONFIG;
  private engine: IEmbeddingEngine;

  /**
   * @param engine Optional embedding engine. Defaults to the on-device
   *   LexicalEmbeddingEngine (no model download, no network). Swap in a dense
   *   local model engine later via `setEmbeddingEngine`.
   */
  constructor(engine?: IEmbeddingEngine) {
    this.engine =
      engine ?? new LexicalEmbeddingEngine(this.config.embeddingDimension);
  }

  /**
   * Import a document into the knowledge base.
   * Parses, chunks, and stores the document.
   *
   * @param title Document title
   * @param content Raw content (text or file content)
   * @param format Document format
   * @param tags Optional tags
   * @returns The created document
   */
  async importDocument(
    title: string,
    content: string,
    format: DocumentFormat = 'txt',
    tags?: string[],
  ): Promise<KnowledgeDocument> {
    // Parse content
    const text = DocumentParser.parse(content, format);

    if (!text || text.trim().length === 0) {
      throw new Error('Document has no extractable text content');
    }

    // Create document record
    const document: KnowledgeDocument = {
      id: this.generateId(),
      title,
      format,
      content: text,
      charCount: text.length,
      chunkCount: 0,
      createdAt: new Date().toISOString(),
      tags,
    };

    // Chunk the text
    const chunks = TextChunker.chunk(
      text,
      this.config.chunkSize,
      this.config.chunkOverlap,
      document.id,
    );

    document.chunkCount = chunks.length;

    // Compute local embeddings for each chunk. Lexical by default; a dense
    // local model engine can be swapped in via setEmbeddingEngine without
    // touching this pipeline. When the engine returns null (e.g. Noop), the
    // chunk simply falls back to keyword matching at search time.
    for (const chunk of chunks) {
      chunk.embedding = await this.engine.embed(chunk.text);
    }

    await vectorStore.addChunks(chunks, document);

    return document;
  }

  /**
   * Search the knowledge base for relevant context.
   *
   * @param query The search query
   * @param topK Max results (defaults to config)
   * @returns Search results sorted by relevance
   */
  async search(query: string, topK?: number): Promise<SearchResult[]> {
    const queryEmbedding = await this.engine.embed(query);
    return vectorStore.search(
      queryEmbedding,
      query,
      topK || this.config.topK,
      this.config.minScore,
    );
  }

  /**
   * Get context for a query as formatted text (for LLM injection).
   *
   * @param query The search query
   * @returns Formatted context string, or empty if no results
   */
  async getContext(query: string): Promise<string> {
    const results = await this.search(query);

    if (results.length === 0) {
      return '';
    }

    const parts = results.map((result, idx) => {
      const source = result.document.title;
      return `[${idx + 1}] From "${source}":\n${result.chunk.text}`;
    });

    return parts.join('\n\n---\n\n');
  }

  /**
   * Remove a document from the knowledge base.
   */
  async removeDocument(documentId: string): Promise<void> {
    await vectorStore.removeDocument(documentId);
  }

  /**
   * List all documents in the knowledge base.
   */
  async listDocuments(): Promise<KnowledgeDocument[]> {
    return vectorStore.getDocuments();
  }

  /**
   * Get stats about the knowledge base.
   */
  async getStats(): Promise<{
    documentCount: number;
    chunkCount: number;
  }> {
    const docs = await vectorStore.getDocuments();
    const chunkCount = await vectorStore.getChunkCount();
    return {
      documentCount: docs.length,
      chunkCount,
    };
  }

  /**
   * Clear the entire knowledge base.
   */
  async clearAll(): Promise<void> {
    await vectorStore.clear();
  }

  /**
   * Update RAG configuration.
   */
  setConfig(config: Partial<RAGConfig>): void {
    this.config = {...this.config, ...config};
  }

  /**
   * Swap the embedding engine (e.g. to a local dense model engine such as a
   * GGUF embedding model via llama.rn). The rest of the pipeline is unchanged.
   */
  setEmbeddingEngine(engine: IEmbeddingEngine): void {
    this.engine = engine;
  }

  /**
   * Current embedding engine (for diagnostics / UI status).
   */
  get embeddingEngine(): IEmbeddingEngine {
    return this.engine;
  }

  /**
   * Generate a unique document ID.
   */
  private generateId(): string {
    return `doc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}

export const ragManager = new RAGManager();
