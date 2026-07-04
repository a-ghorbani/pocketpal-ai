/**
 * TextChunker — splits text into overlapping chunks for RAG.
 *
 * Strategy: character-based chunking with overlap.
 * Future: sentence-aware chunking with token counting.
 */

import type {DocumentChunk} from './types';

export class TextChunker {
  /**
   * Split text into overlapping chunks.
   *
   * @param text The text to chunk
   * @param chunkSize Max characters per chunk
   * @param overlap Characters of overlap between chunks
   * @param documentId Parent document ID
   */
  static chunk(
    text: string,
    chunkSize: number = 500,
    overlap: number = 50,
    documentId: string,
  ): DocumentChunk[] {
    if (!text || text.length === 0) {
      return [];
    }

    if (text.length <= chunkSize) {
      const trimmed = text.trim();
      if (trimmed.length === 0) {
        return [];
      }
      return [
        {
          id: this.generateChunkId(documentId, 0),
          documentId,
          text: trimmed,
          index: 0,
          tokenCount: this.estimateTokens(trimmed),
        },
      ];
    }

    const chunks: DocumentChunk[] = [];
    let start = 0;
    let index = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      let chunkText = text.slice(start, end);

      // Try to break at a word boundary
      if (end < text.length) {
        const lastSpace = chunkText.lastIndexOf(' ');
        if (lastSpace > chunkSize * 0.5) {
          chunkText = chunkText.slice(0, lastSpace);
        }
      }

      chunkText = chunkText.trim();
      if (chunkText.length > 0) {
        chunks.push({
          id: this.generateChunkId(documentId, index),
          documentId,
          text: chunkText,
          index,
          tokenCount: this.estimateTokens(chunkText),
        });
      }

      // Reached end of text — done (prevents infinite loop when
      // text.length - overlap <= start would otherwise not advance start)
      if (end >= text.length) break;

      start = end - overlap;
      if (start >= text.length) break;
      index++;
    }

    return chunks;
  }

  /**
   * Estimate token count (rough: 1 token ≈ 4 chars for English).
   */
  static estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Generate a unique chunk ID.
   */
  private static generateChunkId(documentId: string, index: number): string {
    return `${documentId}_chunk_${index}`;
  }
}
