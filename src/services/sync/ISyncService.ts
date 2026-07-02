/**
 * Sync Service Interface
 *
 * Defines the contract for data synchronization services.
 * Implementations: MockSyncService (local only), FirestoreSyncService (Firebase)
 *
 * @phase Phase 1 - Sync Interface
 */

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'conflict';
export type SyncDirection = 'upload' | 'download' | 'both';

export interface SyncError {
  code: string;
  message: string;
  collection?: string;
  data?: any;
}

export interface SyncResult {
  success: boolean;
  syncedCount: number;
  error?: SyncError;
}

/**
 * ISyncService - Data synchronization service interface
 *
 * Handles uploading local data to remote and downloading remote data.
 * Supports conflict resolution for data that exists both locally and remotely.
 */
export interface ISyncService {
  /**
   * Current sync status
   */
  syncStatus: SyncStatus;

  /**
   * Last sync timestamp (Unix ms)
   */
  lastSyncAt: number | null;

  /**
   * Upload local data to remote
   * @param collection - Collection name ('chats', 'pals', 'settings')
   * @param data - Data to upload
   * @returns Promise<void>
   */
  uploadData(collection: string, data: any): Promise<void>;

  /**
   * Download remote data
   * @param collection - Collection name ('chats', 'pals', 'settings')
   * @returns Promise<any[]> - Downloaded data
   */
  downloadData(collection: string): Promise<any[]>;

  /**
   * Resolve conflict between local and remote data
   * @param local - Local version
   * @param remote - Remote version
   * @returns any - Resolved version
   */
  resolveConflict(local: any, remote: any): any;

  /**
   * Start full sync (upload + download)
   * @param direction - Sync direction
   * @returns Promise<SyncResult>
   */
  sync(direction?: SyncDirection): Promise<SyncResult>;

  /**
   * Cancel ongoing sync
   */
  cancelSync(): void;
}

/**
 * Create default sync result
 */
export function createDefaultSyncResult(): SyncResult {
  return {
    success: false,
    syncedCount: 0,
  };
}

/**
 * Create successful sync result
 * @param syncedCount - Number of items synced
 */
export function createSuccessSyncResult(syncedCount: number): SyncResult {
  return {
    success: true,
    syncedCount,
  };
}

/**
 * Create error sync result
 * @param error - Sync error
 */
export function createErrorSyncResult(error: SyncError): SyncResult {
  return {
    success: false,
    syncedCount: 0,
    error,
  };
}
