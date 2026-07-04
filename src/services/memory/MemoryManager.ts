/**
 * MemoryManager — manages the three-tier memory system.
 *
 * Responsibilities:
 * - Add new memories (extracted from conversations)
 * - Retrieve relevant memories for a given context
 * - Promote high-importance working memories to long-term
 * - Decay and forget low-importance memories over time
 * - Build and query the Memory Graph
 *
 * Architecture: All memory is stored locally via AsyncStorage.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  MemoryItem,
  MemoryTier,
  MemoryType,
  MemoryEdge,
  MemoryConfig,
  DEFAULT_MEMORY_CONFIG,
} from './types';

const STORAGE_KEY = 'pocketpal-memory';

interface StoredMemory {
  items: MemoryItem[];
  edges: MemoryEdge[];
}

export class MemoryManager {
  private items: Map<string, MemoryItem> = new Map();
  private edges: MemoryEdge[] = [];
  private config: MemoryConfig = DEFAULT_MEMORY_CONFIG;
  private loaded = false;

  /** Load memories from storage. */
  async load(): Promise<void> {
    if (this.loaded) {
      return;
    }
    this.loaded = true;

    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const stored: StoredMemory = JSON.parse(raw);
        for (const item of stored.items || []) {
          this.items.set(item.id, item);
        }
        this.edges = stored.edges || [];
      }
    } catch {
      // Start with empty memory on error
    }
  }

  /** Persist memories to storage. */
  async save(): Promise<void> {
    try {
      const stored: StoredMemory = {
        items: Array.from(this.items.values()),
        edges: this.edges,
      };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // Ignore save errors
    }
  }

  /**
   * Add a new memory.
   * Returns the created memory item.
   */
  async addMemory(
    content: string,
    type: MemoryType,
    tier: MemoryTier = 'working',
    sessionId?: string,
    importance: number = 0.5,
    tags?: string[],
  ): Promise<MemoryItem> {
    await this.load();

    const now = new Date().toISOString();
    const item: MemoryItem = {
      id: this.generateId(),
      tier,
      type,
      content,
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 0,
      importance: Math.max(0, Math.min(1, importance)),
      sessionId,
      tags,
      relatedMemoryIds: [],
    };

    this.items.set(item.id, item);
    await this.enforceLimits();
    await this.save();
    return item;
  }

  /**
   * Retrieve relevant memories for a given context.
   * Uses keyword matching and importance scoring.
   */
  async retrieveRelevant(
    context: string,
    limit: number = 5,
  ): Promise<MemoryItem[]> {
    await this.load();

    const contextLower = context.toLowerCase();
    const words = contextLower.split(/\s+/).filter(w => w.length > 2);

    const scored = Array.from(this.items.values())
      .map(item => {
        const contentLower = item.content.toLowerCase();
        let score = item.importance;

        // Keyword matching
        for (const word of words) {
          if (contentLower.includes(word)) {
            score += 0.3;
          }
        }

        // Tag matching
        if (item.tags) {
          for (const tag of item.tags) {
            if (contextLower.includes(tag.toLowerCase())) {
              score += 0.2;
            }
          }
        }

        return {item, score};
      })
      .filter(({score}) => score > 0.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // Update access stats
    for (const {item} of scored) {
      item.accessCount++;
      item.lastAccessedAt = new Date().toISOString();
    }

    await this.save();
    return scored.map(s => s.item);
  }

  /**
   * Get all memories of a specific tier.
   */
  async getByTier(tier: MemoryTier): Promise<MemoryItem[]> {
    await this.load();
    return Array.from(this.items.values()).filter(i => i.tier === tier);
  }

  /**
   * Promote high-importance working memories to long-term.
   */
  async promoteToLongTerm(): Promise<number> {
    await this.load();

    let promoted = 0;
    for (const item of this.items.values()) {
      if (
        item.tier === 'working' &&
        item.importance >= this.config.longTermThreshold
      ) {
        item.tier = 'long';
        promoted++;
      }
    }

    if (promoted > 0) {
      await this.save();
    }
    return promoted;
  }

  /**
   * Decay: remove low-importance working memories that haven't been accessed recently.
   */
  async decay(): Promise<number> {
    await this.load();

    const now = Date.now();
    const ttlMs = this.config.workingMemoryTtlDays * 24 * 60 * 60 * 1000;
    let removed = 0;

    for (const [id, item] of this.items) {
      if (item.tier === 'working') {
        const lastAccessed = new Date(item.lastAccessedAt).getTime();
        const age = now - lastAccessed;

        // Remove if older than TTL and low importance
        if (age > ttlMs && item.importance < this.config.longTermThreshold) {
          this.items.delete(id);
          // Remove related edges
          this.edges = this.edges.filter(
            e => e.from !== id && e.to !== id,
          );
          removed++;
        }
      }
    }

    if (removed > 0) {
      await this.save();
    }
    return removed;
  }

  /**
   * Connect two memories with a relationship edge.
   */
  async connectMemories(
    fromId: string,
    toId: string,
    relation: string,
    weight: number = 0.5,
  ): Promise<void> {
    await this.load();

    // Check both exist
    if (!this.items.has(fromId) || !this.items.has(toId)) {
      return;
    }

    // Avoid duplicate edges
    const exists = this.edges.some(
      e => e.from === fromId && e.to === toId && e.relation === relation,
    );
    if (exists) {
      return;
    }

    this.edges.push({from: fromId, to: toId, relation, weight});

    // Update relatedMemoryIds
    const from = this.items.get(fromId);
    const to = this.items.get(toId);
    if (from && !from.relatedMemoryIds?.includes(toId)) {
      from.relatedMemoryIds = [...(from.relatedMemoryIds || []), toId];
    }
    if (to && !to.relatedMemoryIds?.includes(fromId)) {
      to.relatedMemoryIds = [...(to.relatedMemoryIds || []), fromId];
    }

    await this.save();
  }

  /**
   * Get memories related to a given memory ID (via graph edges).
   */
  async getRelated(memoryId: string): Promise<MemoryItem[]> {
    await this.load();

    const relatedIds = this.edges
      .filter(e => e.from === memoryId || e.to === memoryId)
      .map(e => (e.from === memoryId ? e.to : e.from));

    return relatedIds
      .map(id => this.items.get(id))
      .filter((item): item is MemoryItem => item !== undefined);
  }

  /**
   * Delete a memory by ID.
   */
  async deleteMemory(id: string): Promise<void> {
    await this.load();
    this.items.delete(id);
    this.edges = this.edges.filter(e => e.from !== id && e.to !== id);
    await this.save();
  }

  /**
   * Clear all memories.
   */
  async clearAll(): Promise<void> {
    this.items.clear();
    this.edges = [];
    await this.save();
  }

  /**
   * Get memory count by tier.
   */
  async getStats(): Promise<{
    total: number;
    working: number;
    long: number;
    edges: number;
  }> {
    await this.load();
    const items = Array.from(this.items.values());
    return {
      total: items.length,
      working: items.filter(i => i.tier === 'working').length,
      long: items.filter(i => i.tier === 'long').length,
      edges: this.edges.length,
    };
  }

  /**
   * Update configuration.
   */
  setConfig(config: Partial<MemoryConfig>): void {
    this.config = {...this.config, ...config};
  }

  /**
   * Enforce memory limits by removing least important items.
   */
  private async enforceLimits(): Promise<void> {
    const items = Array.from(this.items.values());

    // Check working memory limit
    const working = items.filter(i => i.tier === 'working');
    if (working.length > this.config.maxWorkingMemory) {
      working
        .sort((a, b) => a.importance - b.importance)
        .slice(0, working.length - this.config.maxWorkingMemory)
        .forEach(item => {
          this.items.delete(item.id);
        });
    }

    // Check long-term memory limit
    const longTerm = items.filter(i => i.tier === 'long');
    if (longTerm.length > this.config.maxLongTermMemory) {
      longTerm
        .sort((a, b) => a.importance - b.importance)
        .slice(0, longTerm.length - this.config.maxLongTermMemory)
        .forEach(item => {
          this.items.delete(item.id);
          this.edges = this.edges.filter(
            e => e.from !== item.id && e.to !== item.id,
          );
        });
    }
  }

  private generateId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}

export const memoryManager = new MemoryManager();
