/**
 * Mock Sync Service
 *
 * In-memory sync service for offline mode and development.
 * Simulates sync behavior without network calls.
 *
 * @phase Phase 1 - Mock Implementation
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ISyncService,
  SyncStatus,
  SyncResult,
  SyncDirection,
  createSuccessSyncResult,
  createErrorSyncResult,
} from './ISyncService';

const STORAGE_KEY_PREFIX = '@mock_sync_';

/**
 * MockSyncService - Local-only sync simulation
 *
 * Features:
 * - In-memory storage
 * - AsyncStorage persistence
 * - Simulated network delay
 * - Last-write-wins conflict resolution
 */
export class MockSyncService implements ISyncService {
  private _syncStatus: SyncStatus = 'idle';
  private _lastSyncAt: number | null = null;
  private mockRemoteData: Map<string, any[]> = new Map();
  private isSyncing: boolean = false;

  constructor() {
    this.loadPersistedData();
  }

  /**
   * Current sync status (observable)
   */
  get syncStatus(): SyncStatus {
    return this._syncStatus;
  }

  /**
   * Last sync timestamp
   */
  get lastSyncAt(): number | null {
    return this._lastSyncAt;
  }

  /**
   * Simulate network delay
   */
  private async simulateDelay(ms: number = 1000): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Load persisted remote data from AsyncStorage
   */
  private async loadPersistedData(): Promise<void> {
    try {
      const collections = ['chats', 'pals', 'settings'];
      for (const collection of collections) {
        const key = `${STORAGE_KEY_PREFIX}${collection}`;
        const stored = await AsyncStorage.getItem(key);
        if (stored) {
          this.mockRemoteData.set(collection, JSON.parse(stored));
        } else {
          this.mockRemoteData.set(collection, []);
        }
      }
    } catch (error) {
      console.error('[MockSync] Failed to load persisted data:', error);
    }
  }

  /**
   * Persist remote data to AsyncStorage
   */
  private async persistData(collection: string, data: any[]): Promise<void> {
    try {
      const key = `${STORAGE_KEY_PREFIX}${collection}`;
      await AsyncStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
      console.error('[MockSync] Failed to persist data:', error);
    }
  }

  /**
   * Upload local data to mock remote
   */
  async uploadData(collection: string, data: any): Promise<void> {
    if (this.isSyncing) {
      throw new Error('Sync already in progress');
    }

    // Set syncing flag to prevent concurrent operations
    this.isSyncing = true;
    this._syncStatus = 'syncing';

    try {
      await this.simulateDelay(500);

      const existingData = this.mockRemoteData.get(collection) || [];
      const dataArray = Array.isArray(data) ? data : [data];

      // Merge data (last-write-wins)
      for (const item of dataArray) {
        const index = existingData.findIndex((existing) => existing.id === item.id);

        if (index >= 0) {
          // Update existing
          existingData[index] = this.resolveConflict(existingData[index], item);
        } else {
          // Add new
          existingData.push(item);
        }
      }

      this.mockRemoteData.set(collection, existingData);
      await this.persistData(collection, existingData);

      this._syncStatus = 'idle';
    } catch (error) {
      this._syncStatus = 'error';
      throw error;
    } finally {
      // Always reset isSyncing flag
      this.isSyncing = false;
    }
  }

  /**
   * Download data from mock remote
   * @param collection - Collection name
   * @returns Promise<any[]> - Downloaded data
   */
  async downloadData(collection: string): Promise<any[]> {
    if (this.isSyncing) {
      throw new Error('Sync already in progress');
    }

    // Set syncing flag to prevent concurrent operations
    this.isSyncing = true;
    this._syncStatus = 'syncing';

    try {
      await this.simulateDelay(800);

      const data = this.mockRemoteData.get(collection) || [];

      this._syncStatus = 'idle';
      return data;
    } catch (error) {
      this._syncStatus = 'error';
      throw error;
    } finally {
      // Always reset isSyncing flag
      this.isSyncing = false;
    }
  }

  /**
   * Resolve conflict between local and remote data
   * Strategy: Last-write-wins (compare updatedAt)
   *
   * @param local - Local version
   * @param remote - Remote version
   * @returns any - Resolved version
   */
  resolveConflict(local: any, remote: any): any {
    // If local is deleted, keep deletion
    if (local.isDeleted) {
      return local;
    }

    // If remote is deleted, keep deletion
    if (remote.isDeleted) {
      return remote;
    }

    // Compare updatedAt (last-write-wins)
    const localUpdatedAt = local.updatedAt || 0;
    const remoteUpdatedAt = remote.updatedAt || 0;

    if (localUpdatedAt >= remoteUpdatedAt) {
      return local;
    } else {
      return remote;
    }
  }

  /**
   * Start full sync (upload + download)
   * @param direction - Sync direction
   * @returns Promise<SyncResult>
   */
  async sync(direction: SyncDirection = 'both'): Promise<SyncResult> {
    if (this.isSyncing) {
      return createErrorSyncResult({
        code: 'SYNC_IN_PROGRESS',
        message: 'Sync already in progress',
      });
    }

    this.isSyncing = true;
    this._syncStatus = 'syncing';

    try {
      let syncedCount = 0;

      // Simulate full sync
      await this.simulateDelay(1500);

      // In mock mode, just mark as successful
      syncedCount = 3; // Simulated count

      this._lastSyncAt = Date.now();
      this._syncStatus = 'idle';
      this.isSyncing = false;

      return createSuccessSyncResult(syncedCount);
    } catch (error) {
      this._syncStatus = 'error';
      this.isSyncing = false;

      return createErrorSyncResult({
        code: 'SYNC_FAILED',
        message: error instanceof Error ? error.message : 'Unknown sync error',
      });
    }
  }

  /**
   * Cancel ongoing sync
   */
  cancelSync(): void {
    if (this.isSyncing) {
      this.isSyncing = false;
      this._syncStatus = 'idle';
      console.log('[MockSync] Sync cancelled');
    }
  }

  /**
   * Clear all mock remote data (for testing)
   */
  async clearAllData(): Promise<void> {
    this.mockRemoteData.clear();
    const collections = ['chats', 'pals', 'settings'];
    for (const collection of collections) {
      await AsyncStorage.removeItem(`${STORAGE_KEY_PREFIX}${collection}`);
    }
    console.log('[MockSync] All data cleared');
  }

  /**
   * Get mock remote data (for testing/debugging)
   */
  getMockRemoteData(collection: string): any[] {
    return this.mockRemoteData.get(collection) || [];
  }
}

// Singleton instance
let mockSyncInstance: MockSyncService | null = null;

/**
 * Get the singleton MockSyncService instance
 */
export function getMockSyncService(): MockSyncService {
  if (!mockSyncInstance) {
    mockSyncInstance = new MockSyncService();
  }
  return mockSyncInstance;
}
