/**
 * RAGManager integration tests.
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
import {RAGManager} from '../RAGManager';
import {vectorStore} from '../VectorStore';
import {LexicalEmbeddingEngine} from '../embeddings/LexicalEmbeddingEngine';
import {NoopEmbeddingEngine} from '../embeddings/NoopEmbeddingEngine';

const mockStorage: Record<string, string> = {};

describe('RAGManager', () => {
  let manager: RAGManager;

  beforeEach(async () => {
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
    // Reset the vectorStore singleton's in-memory state so each test
    // starts fresh (the singleton persists across new RAGManager instances)
    await vectorStore.clear();
    manager = new RAGManager();
  });

  describe('importDocument', () => {
    it('imports a text document and creates chunks', async () => {
      const doc = await manager.importDocument(
        'Test Doc',
        'This is a test document about Python programming language.',
        'txt',
      );

      expect(doc.id).toMatch(/^doc_/);
      expect(doc.title).toBe('Test Doc');
      expect(doc.format).toBe('txt');
      expect(doc.charCount).toBeGreaterThan(0);
      expect(doc.chunkCount).toBeGreaterThanOrEqual(1);
      expect(doc.createdAt).toBeDefined();
    });

    it('parses markdown content', async () => {
      const md = '# Title\n\n**bold** text and [link](url)';
      const doc = await manager.importDocument('MD Doc', md, 'md');

      expect(doc.content).toContain('Title');
      expect(doc.content).toContain('bold');
      expect(doc.content).toContain('link');
      expect(doc.content).not.toContain('#');
      expect(doc.content).not.toContain('**');
      expect(doc.content).not.toContain('](url)');
    });

    it('parses HTML content', async () => {
      const html = '<p>Hello <strong>world</strong></p>';
      const doc = await manager.importDocument('HTML Doc', html, 'html');

      expect(doc.content).toBe('Hello world');
    });

    it('accepts tags', async () => {
      const doc = await manager.importDocument(
        'Tagged',
        'some content',
        'txt',
        ['python', 'tutorial'],
      );

      expect(doc.tags).toEqual(['python', 'tutorial']);
    });

    it('throws on empty content', async () => {
      await expect(manager.importDocument('Empty', '', 'txt')).rejects.toThrow();
      await expect(
        manager.importDocument('Empty', '   \n\n  ', 'txt'),
      ).rejects.toThrow();
    });

    it('creates multiple chunks for long documents', async () => {
      const longText = 'Python programming language. '.repeat(100);
      const doc = await manager.importDocument('Long Doc', longText, 'txt');

      expect(doc.chunkCount).toBeGreaterThan(1);
      expect(doc.charCount).toBe(longText.trim().length);
    });

    it('defaults to txt format', async () => {
      const doc = await manager.importDocument('Default', 'plain text');
      expect(doc.format).toBe('txt');
    });
  });

  describe('search', () => {
    it('returns relevant chunks', async () => {
      await manager.importDocument(
        'Python Guide',
        'Python is a versatile programming language used for web development, data science, and AI.',
        'txt',
      );

      const results = await manager.search('Python programming');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].chunk.text).toContain('Python');
    });

    it('includes document metadata in results', async () => {
      await manager.importDocument(
        'My Doc',
        'content about python here',
        'txt',
      );

      const results = await manager.search('python');
      expect(results[0].document.title).toBe('My Doc');
    });

    it('respects topK override', async () => {
      // Create multiple chunks
      const longText = Array.from({length: 50}, (_, i) => `python topic ${i}`).join('. ');
      await manager.importDocument('Multi', longText, 'txt');

      const results = await manager.search('python', 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('returns empty for no matches', async () => {
      await manager.importDocument(
        'Doc',
        'completely unrelated content about cats and dogs',
        'txt',
      );

      const results = await manager.search('quantum physics xyz123');
      expect(results).toEqual([]);
    });

    it('returns empty for empty knowledge base', async () => {
      const results = await manager.search('anything');
      expect(results).toEqual([]);
    });

    it('searches across multiple documents', async () => {
      await manager.importDocument(
        'Doc1',
        'python programming tutorial',
        'txt',
      );
      await manager.importDocument(
        'Doc2',
        'javascript web development',
        'txt',
      );

      const pyResults = await manager.search('python');
      const jsResults = await manager.search('javascript');

      expect(pyResults.some(r => r.document.title === 'Doc1')).toBe(true);
      expect(jsResults.some(r => r.document.title === 'Doc2')).toBe(true);
    });
  });

  describe('getContext', () => {
    it('returns formatted context string for LLM injection', async () => {
      await manager.importDocument(
        'Guide',
        'Python is great for data science and machine learning.',
        'txt',
      );

      const context = await manager.getContext('Python data');
      expect(context).toContain('Python');
      expect(context).toContain('Guide'); // Source citation
    });

    it('returns empty string when no results', async () => {
      const context = await manager.getContext('nonexistent query');
      expect(context).toBe('');
    });

    it('cites source document', async () => {
      await manager.importDocument(
        'Cited Source',
        'some python content here',
        'txt',
      );

      const context = await manager.getContext('python');
      expect(context).toContain('Cited Source');
    });
  });

  describe('listDocuments', () => {
    it('lists all imported documents', async () => {
      await manager.importDocument('Doc A', 'content a', 'txt');
      await manager.importDocument('Doc B', 'content b', 'txt');

      const docs = await manager.listDocuments();
      expect(docs).toHaveLength(2);
      const titles = docs.map(d => d.title);
      expect(titles).toContain('Doc A');
      expect(titles).toContain('Doc B');
    });

    it('returns empty for empty knowledge base', async () => {
      const docs = await manager.listDocuments();
      expect(docs).toEqual([]);
    });
  });

  describe('removeDocument', () => {
    it('removes a document and its chunks', async () => {
      const doc = await manager.importDocument(
        'To Remove',
        'python content here',
        'txt',
      );

      await manager.removeDocument(doc.id);

      const docs = await manager.listDocuments();
      expect(docs).toHaveLength(0);

      const results = await manager.search('python');
      expect(results).toEqual([]);
    });
  });

  describe('getStats', () => {
    it('returns document and chunk counts', async () => {
      await manager.importDocument('Doc1', 'short content', 'txt');
      await manager.importDocument(
        'Doc2',
        'another piece of content here',
        'txt',
      );

      const stats = await manager.getStats();
      expect(stats.documentCount).toBe(2);
      expect(stats.chunkCount).toBeGreaterThanOrEqual(2);
    });

    it('returns zeros for empty knowledge base', async () => {
      const stats = await manager.getStats();
      expect(stats.documentCount).toBe(0);
      expect(stats.chunkCount).toBe(0);
    });
  });

  describe('clearAll', () => {
    it('clears the entire knowledge base', async () => {
      await manager.importDocument('Doc1', 'content', 'txt');
      await manager.importDocument('Doc2', 'more content', 'txt');

      await manager.clearAll();

      const stats = await manager.getStats();
      expect(stats.documentCount).toBe(0);
      expect(stats.chunkCount).toBe(0);
    });
  });

  describe('setConfig', () => {
    it('updates chunk size', async () => {
      manager.setConfig({chunkSize: 50, chunkOverlap: 5});

      const longText = 'a'.repeat(200);
      const doc = await manager.importDocument('Small Chunks', longText, 'txt');

      // With chunkSize=50, 200 chars should produce multiple chunks
      expect(doc.chunkCount).toBeGreaterThan(1);
    });

    it('updates minScore for filtering', async () => {
      manager.setConfig({minScore: 0.99}); // Very strict

      await manager.importDocument(
        'Doc',
        'python programming content here',
        'txt',
      );

      // Very high minScore filters out most keyword matches
      const results = await manager.search('python');
      expect(results.length).toBe(0);
    });
  });

  describe('persistence', () => {
    it('persists imported documents across manager instances', async () => {
      await manager.importDocument('Persisted', 'python content', 'txt');

      // New manager instance shares the same underlying vectorStore singleton
      const manager2 = new RAGManager();
      const docs = await manager2.listDocuments();
      expect(docs).toHaveLength(1);
      expect(docs[0].title).toBe('Persisted');
    });
  });

  describe('local embeddings', () => {
    it('uses cosine retrieval via the default lexical engine', async () => {
      await manager.importDocument(
        'Python Guide',
        'Python is a versatile programming language used for web development',
        'txt',
      );
      await manager.importDocument(
        'Cooking',
        'a recipe for tomato pasta with basil',
        'txt',
      );

      const results = await manager.search('Python programming');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].document.title).toBe('Python Guide');
    });

    it('falls back to keyword search when engine is swapped to Noop', async () => {
      manager.setEmbeddingEngine(new NoopEmbeddingEngine());

      await manager.importDocument('Kw', 'python keyword here', 'txt');
      const results = await manager.search('python');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].document.title).toBe('Kw');
    });

    it('exposes the active embedding engine', () => {
      expect(manager.embeddingEngine).toBeInstanceOf(LexicalEmbeddingEngine);
    });
  });
});
