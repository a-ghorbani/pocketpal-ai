/**
 * Memory display types
 *
 * Note: The actual memory fit calculation logic is in useMemoryCheck.ts
 * (getMemoryFitDetails function) to avoid circular dependencies.
 */

export type MemoryFitStatus = 'fits' | 'tight' | 'wont_fit';
