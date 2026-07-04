/**
 * Memory system types.
 *
 * Three-tier memory architecture:
 * - Short-term: Recent messages in the current session (already managed by ChatSessionStore)
 * - Working: Key facts extracted from conversation, persisted across sessions
 * - Long-term: User-confirmed memories, organized as a memory graph
 *
 * Architecture: All memory is stored locally on-device.
 */

export type MemoryTier = 'short' | 'working' | 'long';

export type MemoryType =
  | 'fact' // A factual statement about the user
  | 'preference' // User preference
  | 'instruction' // Standing instruction
  | 'context' // Background context
  | 'relationship'; // Relationship between entities

export interface MemoryItem {
  /** Unique ID. */
  id: string;
  /** Memory tier. */
  tier: MemoryTier;
  /** Type of memory. */
  type: MemoryType;
  /** The memory content (natural language). */
  content: string;
  /** When this memory was created (ISO timestamp). */
  createdAt: string;
  /** When this memory was last accessed (ISO timestamp). */
  lastAccessedAt: string;
  /** Number of times this memory has been accessed. */
  accessCount: number;
  /** Importance score 0..1 (higher = more important). */
  importance: number;
  /** Source session ID (where this memory originated). */
  sessionId?: string;
  /** Tags for categorization. */
  tags?: string[];
  /** Related memory IDs (for Memory Graph). */
  relatedMemoryIds?: string[];
}

export interface MemoryGraph {
  /** All memory nodes. */
  nodes: MemoryItem[];
  /** Edges connecting memories. */
  edges: MemoryEdge[];
}

export interface MemoryEdge {
  /** Source memory ID. */
  from: string;
  /** Target memory ID. */
  to: string;
  /** Relationship type. */
  relation: string;
  /** Edge weight 0..1. */
  weight: number;
}

/**
 * Configuration for memory management.
 */
export interface MemoryConfig {
  /** Max working memory items to keep. */
  maxWorkingMemory: number;
  /** Max long-term memory items to keep. */
  maxLongTermMemory: number;
  /** Min importance score for promotion to long-term. */
  longTermThreshold: number;
  /** Days after which working memory is forgotten if not accessed. */
  workingMemoryTtlDays: number;
}

export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  maxWorkingMemory: 50,
  maxLongTermMemory: 200,
  longTermThreshold: 0.7,
  workingMemoryTtlDays: 7,
};
