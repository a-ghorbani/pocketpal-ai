import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import {
  ISyncService,
  SyncStatus,
  SyncResult,
  SyncDirection,
  createSuccessSyncResult,
  createErrorSyncResult,
} from './ISyncService';
import { getMockSyncService } from './MockSyncService';
import { isFirebaseConfigured } from '../../../firebase.config';
import { getEncryptionManager, EncryptionManager } from '../encryption/EncryptionManager';
import { EncryptedData } from '../encryption/IE2EEService';

const COLLECTIONS = ['chats', 'pals', 'settings'];
const ENCRYPTED_COLLECTIONS = ['chats', 'pals'];
const BATCH_SIZE = 500;

// Map sync collection names to WatermelonDB table names.
const COLLECTION_TO_TABLE: Record<string, string> = {
  chats: 'chat_sessions',
  pals: 'local_pals',
  settings: 'global_settings',
};

export class FirestoreSyncService implements ISyncService {
  private _syncStatus: SyncStatus = 'idle';
  private _lastSyncAt: number | null = null;
  private isSyncing: boolean = false;
  private offlineMode: boolean = false;
  private fallbackMockService: ReturnType<typeof getMockSyncService> | null = null;
  private encryptionManager: EncryptionManager;
  private unsubscribers: Map<string, () => void> = new Map();

  constructor() {
    this.encryptionManager = getEncryptionManager();
    this.initialize();
  }

  private async initialize(): Promise<void> {
    if (!isFirebaseConfigured()) {
      this.enableOfflineMode();
      return;
    }

    try {
      await this.encryptionManager.initialize();
    } catch (error) {
      console.warn('[FirestoreSync] Encryption init failed:', error);
    }
  }

  get syncStatus(): SyncStatus {
    if (this.offlineMode && this.fallbackMockService) {
      return this.fallbackMockService.syncStatus;
    }
    return this._syncStatus;
  }

  get lastSyncAt(): number | null {
    if (this.offlineMode && this.fallbackMockService) {
      return this.fallbackMockService.lastSyncAt;
    }
    return this._lastSyncAt;
  }

  private getCurrentUserId(): string | null {
    const user = auth().currentUser;
    return user?.uid || null;
  }

  private getCollectionPath(collection: string): string {
    const userId = this.getCurrentUserId();
    if (!userId) {
      throw new Error('User not authenticated');
    }
    return `users/${userId}/${collection}`;
  }

  private async encryptIfNeeded(collection: string, data: any): Promise<any> {
    if (!ENCRYPTED_COLLECTIONS.includes(collection)) {
      return data;
    }

    if (!this.encryptionManager.isReady()) {
      console.warn('[FirestoreSync] Encryption not ready, storing unencrypted');
      return data;
    }

    try {
      const encrypted = await this.encryptionManager.encryptObject(data);
      return {
        id: data.id,
        _encrypted: true,
        _encryptionData: encrypted,
        updatedAt: data.updatedAt || Date.now(),
      };
    } catch (error) {
      console.warn('[FirestoreSync] Encryption failed, storing unencrypted:', error);
      return data;
    }
  }

  private async decryptIfNeeded(collection: string, doc: any): Promise<any> {
    if (!ENCRYPTED_COLLECTIONS.includes(collection)) {
      return doc;
    }

    if (!doc._encrypted || !doc._encryptionData) {
      return doc;
    }

    if (!this.encryptionManager.isReady()) {
      try {
        return await this.encryptionManager.decryptObject(doc._encryptionData);
      } catch (error) {
        console.warn('[FirestoreSync] Decryption failed:', error);
        return doc;
      }
    }

    return doc;
  }

  async uploadData(collection: string, data: any): Promise<void> {
    if (this.offlineMode && this.fallbackMockService) {
      return this.fallbackMockService.uploadData(collection, data);
    }

    if (this.isSyncing) {
      throw new Error('Sync already in progress');
    }

    this.isSyncing = true;
    this._syncStatus = 'syncing';

    try {
      const collectionPath = this.getCollectionPath(collection);
      const dataArray = Array.isArray(data) ? data : [data];
      const batch = firestore().batch();

      for (const item of dataArray) {
        if (!item.id) {
          console.warn('[FirestoreSync] Item missing id, skipping');
          continue;
        }

        const docRef = firestore().doc(`${collectionPath}/${item.id}`);
        const encryptedItem = await this.encryptIfNeeded(collection, item);

        const docData = {
          ...encryptedItem,
          updatedAt: firestore.FieldValue.serverTimestamp(),
          _syncVersion: 1,
        };

        batch.set(docRef, docData, { merge: true });
      }

      await batch.commit();
      this._syncStatus = 'idle';
    } catch (error) {
      this._syncStatus = 'error';
      console.error('[FirestoreSync] Upload failed:', error);
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }

  async downloadData(collection: string): Promise<any[]> {
    if (this.offlineMode && this.fallbackMockService) {
      return this.fallbackMockService.downloadData(collection);
    }

    if (this.isSyncing) {
      throw new Error('Sync already in progress');
    }

    this.isSyncing = true;
    this._syncStatus = 'syncing';

    try {
      const collectionPath = this.getCollectionPath(collection);
      const snapshot = await firestore()
        .collection(collectionPath)
        .orderBy('updatedAt', 'desc')
        .limit(BATCH_SIZE)
        .get();

      const results: any[] = [];

      for (const doc of snapshot.docs) {
        const data = doc.data();
        const decrypted = await this.decryptIfNeeded(collection, data);
        results.push({
          ...decrypted,
          id: doc.id,
        });
      }

      this._syncStatus = 'idle';
      return results;
    } catch (error) {
      this._syncStatus = 'error';
      console.error('[FirestoreSync] Download failed:', error);
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }

  resolveConflict(local: any, remote: any): any {
    if (local.isDeleted) {
      return local;
    }
    if (remote.isDeleted) {
      return remote;
    }

    const localUpdatedAt = local.updatedAt || 0;
    const remoteUpdatedAt = remote.updatedAt instanceof Date
      ? remote.updatedAt.getTime()
      : (remote.updatedAt || 0);

    if (localUpdatedAt >= remoteUpdatedAt) {
      return local;
    }
    return remote;
  }

  async sync(direction: SyncDirection = 'both'): Promise<SyncResult> {
    if (this.offlineMode && this.fallbackMockService) {
      return this.fallbackMockService.sync(direction);
    }

    if (this.isSyncing) {
      return createErrorSyncResult({
        code: 'SYNC_IN_PROGRESS',
        message: 'Sync already in progress',
      });
    }

    const userId = this.getCurrentUserId();
    if (!userId) {
      return createErrorSyncResult({
        code: 'NOT_AUTHENTICATED',
        message: 'User not authenticated',
      });
    }

    this.isSyncing = true;
    this._syncStatus = 'syncing';

    try {
      let syncedCount = 0;

      for (const collection of COLLECTIONS) {
        try {
          if (direction === 'upload' || direction === 'both') {
            const localData = await this.getLocalDirtyData(collection);
            if (localData.length > 0) {
              await this.uploadData(collection, localData);
              syncedCount += localData.length;
            }
          }

          if (direction === 'download' || direction === 'both') {
            const remoteData = await this.downloadData(collection);
            await this.applyRemoteData(collection, remoteData);
            syncedCount += remoteData.length;
          }
        } catch (collectionError) {
          console.error(`[FirestoreSync] Failed to sync ${collection}:`, collectionError);
        }
      }

      this._lastSyncAt = Date.now();
      this._syncStatus = 'idle';

      return createSuccessSyncResult(syncedCount);
    } catch (error) {
      this._syncStatus = 'error';
      return createErrorSyncResult({
        code: 'SYNC_FAILED',
        message: error instanceof Error ? error.message : 'Unknown sync error',
      });
    } finally {
      this.isSyncing = false;
    }
  }

  private async getLocalDirtyData(collection: string): Promise<any[]> {
    const tableName = COLLECTION_TO_TABLE[collection];
    if (!tableName) {
      console.warn(`[FirestoreSync] Unknown collection: ${collection}`);
      return [];
    }

    try {
      const {database} = require('../../database');
      const records = await database.collections
        .get(tableName)
        .query()
        .fetch();

      // Filter to records that have been modified since the last sync.
      // WatermelonDB tracks `lastChanged` on every write; we compare it
      // against the last successful sync timestamp.
      const since = this._lastSyncAt || 0;
      const dirty = records
        .filter((r: any) => {
          const changedAt =
            r._raw?.last_changed_at ||
            r.updatedAt ||
            r.createdAt ||
            0;
          return changedAt > since;
        })
        .map((r: any) => {
          const raw = r._raw || {};
          return {
            id: r.id,
            ...this.serializeRecord(collection, r),
            updatedAt: raw.updated_at || r.updatedAt || Date.now(),
            isDeleted: false,
          };
        });

      // Also include soft-deleted records so the remote can tombstone them.
      // WatermelonDB records that are deleted are gone from the local DB,
      // so we rely on a separate tombstone table if one exists. For now
      // we skip this — a future enhancement can add tombstone tracking.
      return dirty;
    } catch (error) {
      console.error(
        `[FirestoreSync] Failed to get dirty data for ${collection}:`,
        error,
      );
      return [];
    }
  }

  private async applyRemoteData(
    collection: string,
    data: any[],
  ): Promise<void> {
    const tableName = COLLECTION_TO_TABLE[collection];
    if (!tableName) {
      console.warn(`[FirestoreSync] Unknown collection: ${collection}`);
      return;
    }

    if (data.length === 0) {
      return;
    }

    try {
      const {database} = require('../../database');

      await database.write(async () => {
        for (const item of data) {
          if (!item.id) {
            continue;
          }

          const existing = await database.collections
            .get(tableName)
            .find(item.id)
            .catch(() => null);

          if (existing) {
            // Conflict check: only update if remote is newer (LWW)
            const localUpdatedAt = (existing as any)._raw?.updated_at || 0;
            const remoteUpdatedAt =
              item.updatedAt instanceof Date
                ? item.updatedAt.getTime()
                : item.updatedAt || 0;

            if (remoteUpdatedAt > localUpdatedAt) {
              await (existing as any).update((record: any) => {
                this.deserializeRecord(collection, record, item);
                record.updated_at = remoteUpdatedAt;
              });
            }
          } else {
            // Insert new record from remote
            await database.collections.get(tableName).create((record: any) => {
              record._raw.id = item.id; // Preserve the remote ID
              this.deserializeRecord(collection, record, item);
              record.updated_at =
                item.updatedAt instanceof Date
                  ? item.updatedAt.getTime()
                  : item.updatedAt || Date.now();
            });
          }
        }
      });

      console.log(
        `[FirestoreSync] Applied ${data.length} remote items for ${collection}`,
      );
    } catch (error) {
      console.error(
        `[FirestoreSync] Failed to apply remote data for ${collection}:`,
        error,
      );
    }
  }

  /**
   * Convert a WatermelonDB record into a plain object suitable for upload.
   */
  private serializeRecord(collection: string, record: any): Record<string, any> {
    switch (collection) {
      case 'chats': {
        return {
          title: record.title || '',
          date: record.date || '',
          activePalId: record.activePalId || null,
          settingsSource: record.settingsSource || null,
        };
      }
      case 'pals': {
        // LocalPal stores most fields as JSON strings; forward as-is.
        return {
          name: record.name || '',
          description: record.description || '',
          systemPrompt: record.systemPrompt || '',
          source: record.source || 'local',
          defaultModel: record.defaultModel || null,
          capabilities: record.capabilities || null,
          parameters: record.parameters || null,
          pact: record.pact || null,
        };
      }
      case 'settings': {
        return {
          key: record.key || '',
          value: record.value || '',
        };
      }
      default:
        return {};
    }
  }

  /**
   * Write fields from a remote plain object into a WatermelonDB record.
   */
  private deserializeRecord(
    collection: string,
    record: any,
    item: any,
  ): void {
    switch (collection) {
      case 'chats': {
        record.title = item.title || '';
        record.date = item.date || '';
        record.activePalId = item.activePalId || null;
        record.settingsSource = item.settingsSource || null;
        break;
      }
      case 'pals': {
        record.name = item.name || '';
        record.description = item.description || '';
        record.systemPrompt = item.systemPrompt || '';
        record.source = item.source || 'local';
        record.defaultModel = item.defaultModel || null;
        record.capabilities = item.capabilities || null;
        record.parameters = item.parameters || null;
        record.pact = item.pact || null;
        break;
      }
      case 'settings': {
        record.key = item.key || '';
        record.value = item.value || '';
        break;
      }
      default:
        break;
    }
  }

  subscribeToCollection(
    collection: string,
    onData: (data: any[]) => void,
    onError?: (error: Error) => void
  ): () => void {
    const collectionPath = this.getCollectionPath(collection);

    const unsubscribe = firestore()
      .collection(collectionPath)
      .orderBy('updatedAt', 'desc')
      .onSnapshot(
        async (snapshot) => {
          try {
            const results: any[] = [];
            for (const doc of snapshot.docs) {
              const data = doc.data();
              const decrypted = await this.decryptIfNeeded(collection, data);
              results.push({ ...decrypted, id: doc.id });
            }
            onData(results);
          } catch (error) {
            console.error(`[FirestoreSync] Snapshot error for ${collection}:`, error);
          }
        },
        (error) => {
          console.error(`[FirestoreSync] Subscription error for ${collection}:`, error);
          onError?.(error as Error);
        }
      );

    this.unsubscribers.set(collection, unsubscribe);
    return unsubscribe;
  }

  cancelSync(): void {
    if (this.isSyncing) {
      this.isSyncing = false;
      this._syncStatus = 'idle';
      console.log('[FirestoreSync] Sync cancelled');
    }
  }

  enableOfflineMode(): void {
    this.offlineMode = true;
    if (!this.fallbackMockService) {
      this.fallbackMockService = getMockSyncService();
    }
    this.unsubscribeAll();
    console.log('[FirestoreSync] Offline mode enabled');
  }

  async disableOfflineMode(): Promise<void> {
    this.offlineMode = false;
    this.fallbackMockService = null;
    console.log('[FirestoreSync] Offline mode disabled');
  }

  private unsubscribeAll(): void {
    for (const unsubscribe of this.unsubscribers.values()) {
      unsubscribe();
    }
    this.unsubscribers.clear();
  }

  async deleteItem(collection: string, itemId: string): Promise<void> {
    if (this.offlineMode && this.fallbackMockService) {
      return;
    }

    try {
      const collectionPath = this.getCollectionPath(collection);
      await firestore().doc(`${collectionPath}/${itemId}`).delete();
    } catch (error) {
      console.error('[FirestoreSync] Delete failed:', error);
      throw error;
    }
  }

  destroy(): void {
    this.unsubscribeAll();
    this.isSyncing = false;
    this._syncStatus = 'idle';
  }
}

let firestoreSyncInstance: FirestoreSyncService | null = null;

export function getFirestoreSyncService(): FirestoreSyncService {
  if (!firestoreSyncInstance) {
    firestoreSyncInstance = new FirestoreSyncService();
  }
  return firestoreSyncInstance;
}
