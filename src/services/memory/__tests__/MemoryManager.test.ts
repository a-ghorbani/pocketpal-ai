/**
 * MemoryManager tests.
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
import {MemoryManager} from '../MemoryManager';

const mockStorage: Record<string, string> = {};

describe('MemoryManager', () => {
  let manager: MemoryManager;

  beforeEach(() => {
    // Clear storage
    Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
    // Reset mock implementations
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
    // Fresh instance each test
    manager = new MemoryManager();
  });

  describe('addMemory', () => {
    it('creates a working memory item', async () => {
      const item = await manager.addMemory('User likes Python', 'preference');

      expect(item.id).toBeDefined();
      expect(item.content).toBe('User likes Python');
      expect(item.type).toBe('preference');
      expect(item.tier).toBe('working');
      expect(item.importance).toBe(0.5);
    });

    it('creates with custom importance and tier', async () => {
      const item = await manager.addMemory(
        'User is a software engineer',
        'fact',
        'long',
        'session-1',
        0.9,
        ['career'],
      );

      expect(item.tier).toBe('long');
      expect(item.importance).toBe(0.9);
      expect(item.sessionId).toBe('session-1');
      expect(item.tags).toEqual(['career']);
    });

    it('clamps importance to 0..1', async () => {
      const high = await manager.addMemory('test', 'fact', 'working', undefined, 5);
      const low = await manager.addMemory('test', 'fact', 'working', undefined, -1);

      expect(high.importance).toBe(1);
      expect(low.importance).toBe(0);
    });

    it('persists to storage and can be loaded', async () => {
      await manager.addMemory('persisted memory', 'fact');

      // New manager instance loads from storage
      const manager2 = new MemoryManager();
      const items = await manager2.getByTier('working');

      expect(items.length).toBe(1);
      expect(items[0].content).toBe('persisted memory');
    });
  });

  describe('retrieveRelevant', () => {
    it('returns memories matching keywords', async () => {
      await manager.addMemory('User loves Python programming', 'preference');
      await manager.addMemory('User has a dog named Rex', 'fact');
      await manager.addMemory('User prefers dark mode', 'preference');

      const results = await manager.retrieveRelevant('Python coding');

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some(r => r.content.includes('Python'))).toBe(true);
    });

    it('returns memories matching tags', async () => {
      await manager.addMemory(
        'Works at Acme Corp',
        'fact',
        'working',
        undefined,
        0.5,
        ['career', 'acme'],
      );

      const results = await manager.retrieveRelevant('Tell me about acme');
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('updates access stats on retrieval', async () => {
      const item = await manager.addMemory('Important fact', 'fact');
      await manager.retrieveRelevant('Important');

      // Reload to check persisted access count
      const manager2 = new MemoryManager();
      const items = await manager2.getByTier('working');
      const retrieved = items.find(i => i.id === item.id);
      expect(retrieved?.accessCount).toBe(1);
    });

    it('respects limit parameter', async () => {
      for (let i = 0; i < 10; i++) {
        await manager.addMemory(`Fact about Python number ${i}`, 'fact');
      }

      const results = await manager.retrieveRelevant('Python', 3);
      expect(results.length).toBe(3);
    });

    it('returns empty for no matches', async () => {
      await manager.addMemory('User likes cats', 'preference');
      const results = await manager.retrieveRelevant('quantum physics xyz123');
      expect(results.length).toBe(0);
    });
  });

  describe('getByTier', () => {
    it('filters by tier', async () => {
      await manager.addMemory('Working memory 1', 'fact', 'working');
      await manager.addMemory('Long term memory 1', 'fact', 'long');
      await manager.addMemory('Working memory 2', 'fact', 'working');

      const working = await manager.getByTier('working');
      const longTerm = await manager.getByTier('long');

      expect(working).toHaveLength(2);
      expect(longTerm).toHaveLength(1);
    });
  });

  describe('promoteToLongTerm', () => {
    it('promotes high-importance working memories', async () => {
      await manager.addMemory('Important fact', 'fact', 'working', undefined, 0.9);
      await manager.addMemory('Low importance fact', 'fact', 'working', undefined, 0.3);

      const promoted = await manager.promoteToLongTerm();

      expect(promoted).toBe(1);
      const working = await manager.getByTier('working');
      const longTerm = await manager.getByTier('long');
      expect(working).toHaveLength(1);
      expect(longTerm).toHaveLength(1);
    });

    it('does not promote below threshold', async () => {
      await manager.addMemory('Medium fact', 'fact', 'working', undefined, 0.5);
      const promoted = await manager.promoteToLongTerm();
      expect(promoted).toBe(0);
    });
  });

  describe('decay', () => {
    it('removes old low-importance working memories', async () => {
      // Set TTL to 0 days so memories immediately qualify for decay
      manager.setConfig({
        maxWorkingMemory: 50,
        maxLongTermMemory: 200,
        longTermThreshold: 0.7,
        workingMemoryTtlDays: 0,
      });

      // Add memory and wait a tiny bit so age > 0
      await manager.addMemory('Low importance', 'fact', 'working', undefined, 0.3);
      await new Promise(resolve => setTimeout(resolve, 10));

      const removed = await manager.decay();
      expect(removed).toBeGreaterThanOrEqual(0);

      const stats = await manager.getStats();
      // With TTL=0 and low importance, should be removed
      expect(stats.total).toBe(0);
    });

    it('keeps old high-importance working memories', async () => {
      manager.setConfig({
        maxWorkingMemory: 50,
        maxLongTermMemory: 200,
        longTermThreshold: 0.7,
        workingMemoryTtlDays: 0,
      });

      await manager.addMemory('High importance', 'fact', 'working', undefined, 0.9);
      await new Promise(resolve => setTimeout(resolve, 10));

      const removed = await manager.decay();
      expect(removed).toBe(0);

      const stats = await manager.getStats();
      expect(stats.total).toBe(1);
    });
  });

  describe('Memory Graph', () => {
    it('connects two memories', async () => {
      const m1 = await manager.addMemory('User works at Acme', 'fact');
      const m2 = await manager.addMemory('Acme makes widgets', 'fact');

      await manager.connectMemories(m1.id, m2.id, 'related_to');

      const related = await manager.getRelated(m1.id);
      expect(related).toHaveLength(1);
      expect(related[0].id).toBe(m2.id);
    });

    it('does not create duplicate edges', async () => {
      const m1 = await manager.addMemory('Fact 1', 'fact');
      const m2 = await manager.addMemory('Fact 2', 'fact');

      await manager.connectMemories(m1.id, m2.id, 'related_to');
      await manager.connectMemories(m1.id, m2.id, 'related_to');

      const stats = await manager.getStats();
      expect(stats.edges).toBe(1);
    });

    it('updates relatedMemoryIds bidirectionally', async () => {
      const m1 = await manager.addMemory('Fact A', 'fact');
      const m2 = await manager.addMemory('Fact B', 'fact');

      await manager.connectMemories(m1.id, m2.id, 'related_to');

      const related1 = await manager.getRelated(m1.id);
      const related2 = await manager.getRelated(m2.id);

      expect(related1.some(r => r.id === m2.id)).toBe(true);
      expect(related2.some(r => r.id === m1.id)).toBe(true);
    });
  });

  describe('deleteMemory', () => {
    it('removes memory and its edges', async () => {
      const m1 = await manager.addMemory('Fact 1', 'fact');
      const m2 = await manager.addMemory('Fact 2', 'fact');
      await manager.connectMemories(m1.id, m2.id, 'related_to');

      await manager.deleteMemory(m1.id);

      const stats = await manager.getStats();
      expect(stats.total).toBe(1);
      expect(stats.edges).toBe(0);
    });
  });

  describe('clearAll', () => {
    it('removes all memories and edges', async () => {
      await manager.addMemory('Fact 1', 'fact');
      await manager.addMemory('Fact 2', 'fact');
      await manager.clearAll();

      const stats = await manager.getStats();
      expect(stats.total).toBe(0);
      expect(stats.edges).toBe(0);
    });
  });

  describe('getStats', () => {
    it('returns accurate counts', async () => {
      await manager.addMemory('Working 1', 'fact', 'working');
      await manager.addMemory('Working 2', 'fact', 'working');
      await manager.addMemory('Long 1', 'fact', 'long');

      const m1 = await manager.addMemory('M1', 'fact');
      const m2 = await manager.addMemory('M2', 'fact');
      await manager.connectMemories(m1.id, m2.id, 'related_to');

      const stats = await manager.getStats();
      expect(stats.total).toBe(5);
      expect(stats.working).toBe(4);
      expect(stats.long).toBe(1);
      expect(stats.edges).toBe(1);
    });
  });

  describe('enforceLimits', () => {
    it('removes least important working memories when over limit', async () => {
      manager.setConfig({
        maxWorkingMemory: 3,
        maxLongTermMemory: 100,
        longTermThreshold: 0.7,
        workingMemoryTtlDays: 7,
      });

      await manager.addMemory('Fact 1', 'fact', 'working', undefined, 0.9);
      await manager.addMemory('Fact 2', 'fact', 'working', undefined, 0.5);
      await manager.addMemory('Fact 3', 'fact', 'working', undefined, 0.3);
      await manager.addMemory('Fact 4', 'fact', 'working', undefined, 0.8);

      const stats = await manager.getStats();
      expect(stats.working).toBe(3);
    });
  });
});
