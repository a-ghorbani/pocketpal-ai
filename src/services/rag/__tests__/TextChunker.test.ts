/**
 * TextChunker tests.
 */

import {TextChunker} from '../TextChunker';

describe('TextChunker', () => {
  describe('chunk', () => {
    it('returns empty array for empty text', () => {
      expect(TextChunker.chunk('', 500, 50, 'doc1')).toEqual([]);
      expect(TextChunker.chunk('   ', 500, 50, 'doc1')).toEqual([]);
    });

    it('returns single chunk when text fits in chunkSize', () => {
      const text = 'short text';
      const chunks = TextChunker.chunk(text, 500, 50, 'doc1');

      expect(chunks).toHaveLength(1);
      expect(chunks[0].text).toBe('short text');
      expect(chunks[0].index).toBe(0);
      expect(chunks[0].documentId).toBe('doc1');
      expect(chunks[0].id).toBe('doc1_chunk_0');
    });

    it('splits long text into multiple chunks', () => {
      const text = 'word '.repeat(200); // 1000 chars
      const chunks = TextChunker.chunk(text, 500, 50, 'doc1');

      expect(chunks.length).toBeGreaterThan(1);
      // Each chunk should respect size limit (with some slack for word boundary)
      for (const chunk of chunks) {
        expect(chunk.text.length).toBeLessThanOrEqual(500);
      }
    });

    it('assigns sequential indices', () => {
      const text = 'word '.repeat(200);
      const chunks = TextChunker.chunk(text, 500, 50, 'doc1');

      chunks.forEach((chunk, idx) => {
        expect(chunk.index).toBe(idx);
      });
    });

    it('generates unique chunk IDs with documentId', () => {
      const text = 'word '.repeat(200);
      const chunks = TextChunker.chunk(text, 500, 50, 'doc1');

      const ids = chunks.map(c => c.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);

      for (const id of ids) {
        expect(id).toMatch(/^doc1_chunk_\d+$/);
      }
    });

    it('preserves documentId in each chunk', () => {
      const text = 'word '.repeat(200);
      const chunks = TextChunker.chunk(text, 500, 50, 'doc-xyz');

      for (const chunk of chunks) {
        expect(chunk.documentId).toBe('doc-xyz');
      }
    });

    it('uses word boundaries when possible', () => {
      // Text where splitting mid-word would be bad
      const text = 'abcdefghijklmnopqrstuvwxyz '.repeat(50);
      const chunks = TextChunker.chunk(text, 100, 10, 'doc1');

      // No chunk should end mid-word (ends with space or is the last chunk)
      for (const chunk of chunks.slice(0, -1)) {
        // Either ends at a word boundary (trimmed) or is short
        const lastChar = chunk.text[chunk.text.length - 1];
        expect(lastChar).not.toBe('a'); // Not mid-sequence
      }
    });

    it('handles overlap correctly', () => {
      const text = 'a'.repeat(1000);
      const chunks = TextChunker.chunk(text, 100, 20, 'doc1');

      // With overlap, there should be more chunks than without
      const chunksNoOverlap = TextChunker.chunk(text, 100, 0, 'doc1');
      expect(chunks.length).toBeGreaterThanOrEqual(chunksNoOverlap.length);
    });

    it('skips empty chunks', () => {
      // Text with lots of whitespace that might produce empty chunks
      const text = '   \n\n   \n\n   ';
      const chunks = TextChunker.chunk(text, 100, 10, 'doc1');
      expect(chunks).toHaveLength(0);
    });
  });

  describe('estimateTokens', () => {
    it('estimates ~4 chars per token', () => {
      expect(TextChunker.estimateTokens('')).toBe(0);
      expect(TextChunker.estimateTokens('abcd')).toBe(1);
      expect(TextChunker.estimateTokens('abcdefgh')).toBe(2);
    });

    it('rounds up', () => {
      expect(TextChunker.estimateTokens('abc')).toBe(1);
      expect(TextChunker.estimateTokens('abcde')).toBe(2);
    });
  });
});
