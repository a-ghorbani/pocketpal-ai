/**
 * SyncStore - Synchronization State Management
 *
 * MobX store for managing data synchronization state.
 * Coordinates with ISyncService for upload/download operations.
 *
 * @phase Phase 1 - Sync Store
 */

import { makeAutoObservable, runInAction } from 'mobx';
import { makePersistable } from 'mobx-persist-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { SyncStatus, SyncResult, SyncDirection } from '../services/sync/ISyncService';
import { getMockSyncService } from '../services/sync/MockSyncService';
import { getFirestoreSyncService } from '../services/sync/FirestoreSyncService';
import { isFirebaseConfigured } from '../../firebase.config';

export type SyncMode = 'auto' | 'manual';

/**
 * SyncStore - Manages sync state and operations
 *
 * Features:
 * - Track sync status
 * - Mark data as dirty (needs sync)
 * - Auto-sync when network available
 * - Manual sync trigger
 * - Sync error handling
 */
export class SyncStore {
  // ========== Observable State ==========

  /**
   * Current sync status
   */
  syncStatus: SyncStatus = 'idle';

  /**
   * Last successful sync timestamp
   */
  lastSyncAt: number | null = null;

  /**
   * Whether auto-sync is enabled
   */
  autoSync: boolean = true;

  /**
   * Sync interval in minutes (for auto-sync)
   */
  syncInterval: number = 15;

  /**
   * Dirty flags for each collection
   * When true, that collection needs to be synced
   */
  dirtyCollections: {
    chats: boolean;
    pals: boolean;
    settings: boolean;
  } = {
    chats: false,
    pals: false,
    settings: false,
  };

  /**
   * Whether sync is in progress
   */
  get isSyncing(): boolean {
    return this.syncStatus === 'syncing';
  }

  /**
   * Whether there are unsynced changes
   */
  get hasUnsyncedChanges(): boolean {
    return (
      this.dirtyCollections.chats ||
      this.dirtyCollections.pals ||
      this.dirtyCollections.settings
    );
  }

  // ========== Constructor ==========

  constructor() {
    makeAutoObservable(this);

    makePersistable(this, {
      name: 'SyncStore',
      properties: ['lastSyncAt', 'autoSync', 'syncInterval'],
      storage: AsyncStorage,
    });
  }

  private getSyncService() {
    if (isFirebaseConfigured()) {
      return getFirestoreSyncService();
    }
    return getMockSyncService();
  }

  // ========== Actions ==========

  /**
   * Mark a collection as dirty (needs sync)
   * @param collection - Collection name
   */
  markAsDirty(collection: 'chats' | 'pals' | 'settings'): void {
    runInAction(() => {
      this.dirtyCollections[collection] = true;
    });
    console.log(`[SyncStore] Marked ${collection} as dirty`);
  }

  /**
   * Mark a collection as clean (sync complete)
   * @param collection - Collection name
   */
  markAsClean(collection: 'chats' | 'pals' | 'settings'): void {
    runInAction(() => {
      this.dirtyCollections[collection] = false;
    });
    console.log(`[SyncStore] Marked ${collection} as clean`);
  }

  /**
   * Mark all collections as clean
   */
  markAllClean(): void {
    runInAction(() => {
      this.dirtyCollections = {
        chats: false,
        pals: false,
        settings: false,
      };
    });
    console.log('[SyncStore] All collections marked clean');
  }

  /**
   * Mark all collections as dirty
   */
  markAllDirty(): void {
    runInAction(() => {
      this.dirtyCollections = {
        chats: true,
        pals: true,
        settings: true,
      };
    });
    console.log('[SyncStore] All collections marked dirty');
  }

  /**
   * Start sync operation
   * Uploads dirty data and downloads remote changes
   *
   * @param direction - Sync direction
   * @returns Promise<SyncResult>
   */
  async sync(direction: SyncDirection = 'both'): Promise<SyncResult> {
    if (this.isSyncing) {
      console.warn('[SyncStore] Sync already in progress');
      return {
        success: false,
        syncedCount: 0,
        error: {
          code: 'SYNC_IN_PROGRESS',
          message: 'Sync already in progress',
        },
      };
    }

    runInAction(() => {
      this.syncStatus = 'syncing';
    });

    try {
      const syncService = this.getSyncService();
      const result = await syncService.sync(direction);

      runInAction(() => {
        if (result.success) {
          this.syncStatus = 'idle';
          this.lastSyncAt = Date.now();
          this.markAllClean();
        } else {
          this.syncStatus = 'error';
        }
      });

      return result;
    } catch (error) {
      runInAction(() => {
        this.syncStatus = 'error';
      });

      return {
        success: false,
        syncedCount: 0,
        error: {
          code: 'SYNC_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  /**
   * Upload local data to remote
   * @param collection - Collection name
   * @param data - Data to upload
   */
  async upload(collection: string, data: any): Promise<void> {
    const syncService = this.getSyncService();
    await syncService.uploadData(collection, data);

    runInAction(() => {
      this.markAsClean(collection as 'chats' | 'pals' | 'settings');
    });
  }

  /**
   * Download remote data
   * @param collection - Collection name
   * @returns Promise<any[]> - Downloaded data
   */
  async download(collection: string): Promise<any[]> {
    const syncService = this.getSyncService();
    const data = await syncService.downloadData(collection);
    return data;
  }

  /**
   * Enable/disable auto-sync
   * @param enabled - Whether to enable auto-sync
   */
  setAutoSync(enabled: boolean): void {
    runInAction(() => {
      this.autoSync = enabled;
    });
  }

  /**
   * Set sync interval
   * @param minutes - Interval in minutes
   */
  setSyncInterval(minutes: number): void {
    runInAction(() => {
      this.syncInterval = Math.max(1, minutes); // Minimum 1 minute
    });
  }

  /**
   * Clear sync error
   */
  clearError(): void {
    runInAction(() => {
      if (this.syncStatus === 'error') {
        this.syncStatus = 'idle';
      }
    });
  }

  /**
   * Reset store to default state
   */
  reset(): void {
    runInAction(() => {
      this.syncStatus = 'idle';
      this.lastSyncAt = null;
      this.autoSync = true;
      this.syncInterval = 15;
      this.dirtyCollections = {
        chats: false,
        pals: false,
        settings: false,
      };
    });
  }
}

// Singleton instance
export const syncStore = new SyncStore();
