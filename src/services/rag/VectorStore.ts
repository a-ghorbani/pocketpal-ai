/**
 * VectorStore — on-device vector storage with cosine similarity search.
 *
 * Architecture (ADR-2026-005): All vectors stored locally via AsyncStorage.
 * No external vector database needed.
 *
 * When embeddings are not available (no embedding model loaded),
 * falls back to keyword-based search (TF-IDF-like scoring).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type {DocumentChunk, SearchResult, KnowledgeDocument} from './types';

const STORAGE_KEY = 'pocketpal-rag-vectors';
const DOCS_STORAGE_KEY = 'pocketpal-rag-docs';

interface StoredVector {
  chunk: DocumentChunk;
  document: KnowledgeDocument;
}

export class VectorStore {
  private vectors: StoredVector[] = [];
  private loaded = false;

  /** Load vectors from storage. */
  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;

    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.vectors = JSON.parse(raw);
      }
    } catch {
      this.vectors = [];
    }
  }

  /** Persist vectors to storage. */
  async save(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.vectors));
    } catch {
      // Ignore errors
    }
  }

  /**
   * Add chunks and their parent document to the store.
   */
  async addChunks(
    chunks: DocumentChunk[],
    document: KnowledgeDocument,
  ): Promise<void> {
    await this.load();

    // Remove existing chunks for this document
    this.vectors = this.vectors.filter(
      v => v.chunk.documentId !== document.id,
    );

    // Add new chunks
    for (const chunk of chunks) {
      this.vectors.push({chunk, document});
    }

    await this.save();
  }

  /**
   * Remove all chunks for a document.
   */
  async removeDocument(documentId: string): Promise<void> {
    await this.load();
    this.vectors = this.vectors.filter(
      v => v.chunk.documentId !== documentId,
    );
    await this.save();
  }

  /**
   * Search for similar chunks using cosine similarity.
   * Falls back to keyword matching if embeddings are not available.
   *
   * @param queryEmbedding Embedding vector of the query (optional)
   * @param queryText Text of the query (for keyword fallback)
   * @param topK Max results
   * @param minScore Min similarity score
   */
  async search(
    queryEmbedding: number[] | null,
    queryText: string,
    topK: number = 5,
    minScore: number = 0.3,
  ): Promise<SearchResult[]> {
    await this.load();

    if (this.vectors.length === 0) {
      return [];
    }

    let scored: Array<{stored: StoredVector; score: number}>;

    if (queryEmbedding && this.hasEmbeddings()) {
      // Vector similarity search
      scored = this.vectors.map(v => ({
        stored: v,
        score: this.cosineSimilarity(queryEmbedding, v.chunk.embedding!),
      }));
    } else {
      // Keyword-based fallback (TF-IDF-like)
      scored = this.vectors.map(v => ({
        stored: v,
        score: this.keywordScore(queryText, v.chunk.text),
      }));
    }

    return scored
      .filter(s => s.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(s => ({
        chunk: s.stored.chunk,
        score: s.score,
        document: s.stored.document,
      }));
  }

  /**
   * Check if any chunks have embeddings.
   */
  private hasEmbeddings(): boolean {
    return this.vectors.some(v => v.chunk.embedding && v.chunk.embedding.length > 0);
  }

  /**
   * Cosine similarity between two vectors.
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
  }

  /**
   * Keyword-based similarity score (0..1).
   * Uses term frequency overlap with normalization.
   */
  private keywordScore(query: string, text: string): number {
    const queryWords = this.tokenize(query);
    const textWords = this.tokenize(text);

    if (queryWords.length === 0 || textWords.length === 0) return 0;

    const textWordSet = new Set(textWords);
    let matches = 0;

    for (const word of queryWords) {
      if (textWordSet.has(word)) {
        matches++;
      }
    }

    // Normalize by query length and apply IDF-like weighting
    const tf = matches / queryWords.length;
    const coverage = Math.min(matches / Math.min(textWords.length, 100), 1);

    return Math.max(tf * 0.7 + coverage * 0.3, 0);
  }

  /**
   * Tokenize text into lowercase words.
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(w => w.length > 2);
  }

  /**
   * Get all stored documents (unique).
   */
  async getDocuments(): Promise<KnowledgeDocument[]> {
    await this.load();
    const docs = new Map<string, KnowledgeDocument>();
    for (const v of this.vectors) {
      if (!docs.has(v.document.id)) {
        docs.set(v.document.id, v.document);
      }
    }
    return Array.from(docs.values());
  }

  /**
   * Get total chunk count.
   */
  async getChunkCount(): Promise<number> {
    await this.load();
    return this.vectors.length;
  }

  /**
   * Clear all vectors.
   */
  async clear(): Promise<void> {
    this.vectors = [];
    await this.save();
  }
}

export const vectorStore = new VectorStore();
