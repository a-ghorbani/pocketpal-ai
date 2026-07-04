/**
 * RAGManager — unified entry point for knowledge base operations.
 *
 * Combines:
 * - DocumentParser: text extraction
 * - TextChunker: chunk splitting
 * - VectorStore: storage and similarity search
 *
 * Architecture (ADR-2026-005): Fully local RAG pipeline.
 * No external embedding API or vector database required.
 */

import {DocumentParser} from './DocumentParser';
import {TextChunker} from './TextChunker';
import {vectorStore} from './VectorStore';
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

    // Store chunks (embeddings will be computed when embedding model is available)
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
    return vectorStore.search(
      null, // No embedding yet (keyword fallback)
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
   * Generate a unique document ID.
   */
  private generateId(): string {
    return `doc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}

export const ragManager = new RAGManager();
