/**
 * VectorStore tests.
 */

// Mock AsyncStorage with lazy mock implementation
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {VectorStore} from '../VectorStore';
import type {DocumentChunk, KnowledgeDocument} from '../types';

const mockStorage: Record<string, string> = {};

const makeChunk = (
  text: string,
  documentId: string,
  index: number,
  embedding?: number[],
): DocumentChunk => ({
  id: `${documentId}_chunk_${index}`,
  documentId,
  text,
  index,
  embedding,
});

const makeDoc = (id: string, title: string): KnowledgeDocument => ({
  id,
  title,
  format: 'txt',
  content: 'sample',
  charCount: 6,
  chunkCount: 1,
  createdAt: new Date().toISOString(),
});

describe('VectorStore', () => {
  let store: VectorStore;

  beforeEach(() => {
    Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(mockStorage[key] || null),
    );
    (AsyncStorage.setItem as jest.Mock).mockImplementation(
      (key: string, val: string) => {
        mockStorage[key] = val;
        return Promise.resolve();
      },
    );
    (AsyncStorage.removeItem as jest.Mock).mockImplementation((key: string) => {
      delete mockStorage[key];
      return Promise.resolve();
    });
    store = new VectorStore();
  });

  describe('addChunks', () => {
    it('stores chunks with their parent document', async () => {
      const doc = makeDoc('doc1', 'Doc One');
      const chunks = [
        makeChunk('hello world', 'doc1', 0),
        makeChunk('foo bar', 'doc1', 1),
      ];

      await store.addChunks(chunks, doc);

      const chunkCount = await store.getChunkCount();
      expect(chunkCount).toBe(2);
    });

    it('replaces existing chunks for the same document', async () => {
      const doc = makeDoc('doc1', 'Doc One');
      await store.addChunks([makeChunk('old', 'doc1', 0)], doc);
      await store.addChunks(
        [makeChunk('new1', 'doc1', 0), makeChunk('new2', 'doc1', 1)],
        doc,
      );

      const chunkCount = await store.getChunkCount();
      expect(chunkCount).toBe(2);
    });

    it('keeps chunks from different documents separate', async () => {
      const doc1 = makeDoc('doc1', 'Doc One');
      const doc2 = makeDoc('doc2', 'Doc Two');

      await store.addChunks([makeChunk('a', 'doc1', 0)], doc1);
      await store.addChunks([makeChunk('b', 'doc2', 0)], doc2);

      const chunkCount = await store.getChunkCount();
      expect(chunkCount).toBe(2);
    });
  });

  describe('search with keyword fallback', () => {
    it('returns matching chunks by keyword', async () => {
      const doc = makeDoc('doc1', 'Python Guide');
      await store.addChunks(
        [
          makeChunk('Python is a programming language', 'doc1', 0),
          makeChunk('JavaScript is also popular', 'doc1', 1),
        ],
        doc,
      );

      const results = await store.search(null, 'Python programming', 5, 0.1);

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].chunk.text).toContain('Python');
    });

    it('respects topK limit', async () => {
      const doc = makeDoc('doc1', 'Doc');
      const chunks = Array.from({length: 10}, (_, i) =>
        makeChunk(`python word ${i}`, 'doc1', i),
      );
      await store.addChunks(chunks, doc);

      const results = await store.search(null, 'python', 3, 0.1);
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('filters by minScore', async () => {
      const doc = makeDoc('doc1', 'Doc');
      await store.addChunks(
        [makeChunk('python programming', 'doc1', 0)],
        doc,
      );

      // Very high minScore should return nothing for partial match
      const results = await store.search(null, 'python', 5, 0.99);
      expect(results.length).toBe(0);
    });

    it('returns empty for empty store', async () => {
      const results = await store.search(null, 'anything', 5, 0.1);
      expect(results).toEqual([]);
    });

    it('returns empty for no matches', async () => {
      const doc = makeDoc('doc1', 'Doc');
      await store.addChunks(
        [makeChunk('completely unrelated text here', 'doc1', 0)],
        doc,
      );

      const results = await store.search(null, 'python programming', 5, 0.1);
      expect(results.length).toBe(0);
    });

    it('includes parent document in results', async () => {
      const doc = makeDoc('doc1', 'My Document');
      await store.addChunks([makeChunk('python', 'doc1', 0)], doc);

      const results = await store.search(null, 'python', 5, 0.1);
      expect(results[0].document.title).toBe('My Document');
      expect(results[0].document.id).toBe('doc1');
    });

    it('sorts results by score descending', async () => {
      const doc = makeDoc('doc1', 'Doc');
      await store.addChunks(
        [
          makeChunk('python python python', 'doc1', 0),
          makeChunk('python once', 'doc1', 1),
        ],
        doc,
      );

      const results = await store.search(null, 'python', 5, 0.05);
      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
    });
  });

  describe('search with embeddings', () => {
    it('uses cosine similarity when embeddings are available', async () => {
      const doc = makeDoc('doc1', 'Doc');
      // Identical vectors should have similarity 1.0
      await store.addChunks(
        [
          makeChunk('text one', 'doc1', 0, [1, 0, 0]),
          makeChunk('text two', 'doc1', 1, [0, 1, 0]),
        ],
        doc,
      );

      const results = await store.search([1, 0, 0], 'query', 5, 0.5);
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].chunk.text).toBe('text one');
      expect(results[0].score).toBeCloseTo(1.0, 5);
    });

    it('returns 0 similarity for orthogonal vectors', async () => {
      const doc = makeDoc('doc1', 'Doc');
      await store.addChunks(
        [makeChunk('orthogonal', 'doc1', 0, [1, 0, 0])],
        doc,
      );

      const results = await store.search([0, 1, 0], 'query', 5, 0.1);
      expect(results.length).toBe(0); // 0 similarity filtered out
    });

    it('falls back to keywords when query has no embedding', async () => {
      const doc = makeDoc('doc1', 'Doc');
      await store.addChunks(
        [makeChunk('python keyword here', 'doc1', 0, [1, 0, 0])],
        doc,
      );

      // queryEmbedding is null → keyword fallback
      const results = await store.search(null, 'python', 5, 0.1);
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('removeDocument', () => {
    it('removes all chunks for a document', async () => {
      const doc = makeDoc('doc1', 'Doc');
      await store.addChunks(
        [
          makeChunk('chunk1', 'doc1', 0),
          makeChunk('chunk2', 'doc1', 1),
        ],
        doc,
      );

      await store.removeDocument('doc1');

      const chunkCount = await store.getChunkCount();
      expect(chunkCount).toBe(0);
    });

    it('does not affect other documents', async () => {
      const doc1 = makeDoc('doc1', 'Doc One');
      const doc2 = makeDoc('doc2', 'Doc Two');
      await store.addChunks([makeChunk('a', 'doc1', 0)], doc1);
      await store.addChunks([makeChunk('b', 'doc2', 0)], doc2);

      await store.removeDocument('doc1');

      const chunkCount = await store.getChunkCount();
      expect(chunkCount).toBe(1);
    });
  });

  describe('getDocuments', () => {
    it('returns unique documents', async () => {
      const doc1 = makeDoc('doc1', 'Doc One');
      const doc2 = makeDoc('doc2', 'Doc Two');
      await store.addChunks(
        [makeChunk('a1', 'doc1', 0), makeChunk('a2', 'doc1', 1)],
        doc1,
      );
      await store.addChunks([makeChunk('b', 'doc2', 0)], doc2);

      const docs = await store.getDocuments();
      expect(docs).toHaveLength(2);
      const titles = docs.map(d => d.title);
      expect(titles).toContain('Doc One');
      expect(titles).toContain('Doc Two');
    });

    it('returns empty for empty store', async () => {
      const docs = await store.getDocuments();
      expect(docs).toEqual([]);
    });
  });

  describe('persistence', () => {
    it('persists across instances', async () => {
      const doc = makeDoc('doc1', 'Persisted');
      const store1 = new VectorStore();
      await store1.addChunks([makeChunk('persisted text', 'doc1', 0)], doc);

      // New instance loads from storage
      const store2 = new VectorStore();
      const docs = await store2.getDocuments();
      expect(docs).toHaveLength(1);
      expect(docs[0].title).toBe('Persisted');

      const results = await store2.search(null, 'persisted', 5, 0.1);
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('clear', () => {
    it('removes all vectors', async () => {
      const doc = makeDoc('doc1', 'Doc');
      await store.addChunks([makeChunk('text', 'doc1', 0)], doc);

      await store.clear();

      const chunkCount = await store.getChunkCount();
      expect(chunkCount).toBe(0);
    });
  });
});
