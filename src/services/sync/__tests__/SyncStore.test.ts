/**
 * SyncStore Test Suite
 *
 * Tests the synchronization state management store.
 */

import { SyncStore } from '../SyncStore';
import { getMockSyncService } from '../MockSyncService';
import { SyncStatus, SyncDirection, SyncResult } from '../ISyncService';

// Mock makePersistable
jest.mock('mobx-persist-store', () => ({
  makePersistable: jest.fn(() => Promise.resolve()),
}));

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

describe('SyncStore', () => {
  let syncStore: SyncStore;

  beforeEach(() => {
    syncStore = new SyncStore();
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with default state', () => {
      expect(syncStore.syncStatus).toBe('idle');
      expect(syncStore.lastSyncAt).toBeNull();
      expect(syncStore.autoSync).toBe(true);
      expect(syncStore.syncInterval).toBe(15);
      expect(syncStore.isSyncing).toBe(false);
      expect(syncStore.hasUnsyncedChanges).toBe(false);
    });

    it('should initialize dirty collections as clean', () => {
      expect(syncStore.dirtyCollections.chats).toBe(false);
      expect(syncStore.dirtyCollections.pals).toBe(false);
      expect(syncStore.dirtyCollections.settings).toBe(false);
    });
  });

  describe('Getters', () => {
    it('should return correct isSyncing value', () => {
      expect(syncStore.isSyncing).toBe(false);
    });

    it('should return correct hasUnsyncedChanges value', () => {
      expect(syncStore.hasUnsyncedChanges).toBe(false);
    });
  });

  describe('markAsDirty / markAsClean', () => {
    it('should mark a collection as dirty', () => {
      syncStore.markAsDirty('chats');

      expect(syncStore.dirtyCollections.chats).toBe(true);
      expect(syncStore.hasUnsyncedChanges).toBe(true);
    });

    it('should mark a collection as clean', () => {
      syncStore.markAsDirty('chats');
      expect(syncStore.dirtyCollections.chats).toBe(true);

      syncStore.markAsClean('chats');

      expect(syncStore.dirtyCollections.chats).toBe(false);
      expect(syncStore.hasUnsyncedChanges).toBe(false);
    });

    it('should mark all collections as clean', () => {
      syncStore.markAllDirty();
      expect(syncStore.hasUnsyncedChanges).toBe(true);

      syncStore.markAllClean();

      expect(syncStore.dirtyCollections.chats).toBe(false);
      expect(syncStore.dirtyCollections.pals).toBe(false);
      expect(syncStore.dirtyCollections.settings).toBe(false);
      expect(syncStore.hasUnsyncedChanges).toBe(false);
    });

    it('should mark all collections as dirty', () => {
      syncStore.markAllDirty();

      expect(syncStore.dirtyCollections.chats).toBe(true);
      expect(syncStore.dirtyCollections.pals).toBe(true);
      expect(syncStore.dirtyCollections.settings).toBe(true);
      expect(syncStore.hasUnsyncedChanges).toBe(true);
    });

    it('should track multiple dirty collections', () => {
      syncStore.markAsDirty('chats');
      syncStore.markAsDirty('pals');

      expect(syncStore.hasUnsyncedChanges).toBe(true);
      expect(syncStore.dirtyCollections.chats).toBe(true);
      expect(syncStore.dirtyCollections.pals).toBe(true);
      expect(syncStore.dirtyCollections.settings).toBe(false);
    });
  });

  describe('sync', () => {
    it('should successfully perform sync', async () => {
      const mockSyncService = getMockSyncService();
      jest.spyOn(mockSyncService, 'sync').mockResolvedValue({
        success: true,
        syncedCount: 5,
      });

      const result = await syncStore.sync();

      expect(result.success).toBe(true);
      expect(result.syncedCount).toBe(5);
      expect(syncStore.syncStatus).toBe('idle');
    });

    it('should mark all clean after successful sync', async () => {
      syncStore.markAllDirty();
      expect(syncStore.hasUnsyncedChanges).toBe(true);

      const mockSyncService = getMockSyncService();
      jest.spyOn(mockSyncService, 'sync').mockResolvedValue({
        success: true,
        syncedCount: 3,
      });

      await syncStore.sync();

      expect(syncStore.hasUnsyncedChanges).toBe(false);
    });

    it('should update lastSyncAt after successful sync', async () => {
      const mockSyncService = getMockSyncService();
      jest.spyOn(mockSyncService, 'sync').mockResolvedValue({
        success: true,
        syncedCount: 1,
      });

      await syncStore.sync();

      expect(syncStore.lastSyncAt).not.toBeNull();
    });

    it('should set status to error if sync fails', async () => {
      const mockSyncService = getMockSyncService();
      jest.spyOn(mockSyncService, 'sync').mockResolvedValue({
        success: false,
        syncedCount: 0,
        error: {
          code: 'SYNC_FAILED',
          message: 'Sync failed',
        },
      });

      const result = await syncStore.sync();

      expect(result.success).toBe(false);
      expect(syncStore.syncStatus).toBe('error');
    });

    it('should not start new sync if already syncing', async () => {
      const mockSyncService = getMockSyncService();
      jest.spyOn(mockSyncService, 'sync').mockImplementation(() => {
        expect(syncStore.isSyncing).toBe(true);
        return Promise.resolve({ success: true, syncedCount: 1 });
      });

      const result = await syncStore.sync();

      expect(result.success).toBe(true);
    });

    it('should handle exceptions during sync', async () => {
      const mockSyncService = getMockSyncService();
      jest.spyOn(mockSyncService, 'sync').mockRejectedValue(new Error('Network error'));

      const result = await syncStore.sync();

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Network error');
      expect(syncStore.syncStatus).toBe('error');
    });
  });

  describe('upload / download', () => {
    it('should upload data and mark collection as clean', async () => {
      syncStore.markAsDirty('chats');

      const mockSyncService = getMockSyncService();
      jest.spyOn(mockSyncService, 'uploadData').mockResolvedValue();

      await syncStore.upload('chats', { id: '1', name: 'Test' });

      expect(syncStore.dirtyCollections.chats).toBe(false);
      expect(mockSyncService.uploadData).toHaveBeenCalledWith('chats', { id: '1', name: 'Test' });
    });

    it('should download data from sync service', async () => {
      const mockData = [{ id: '1', name: 'Test' }];
      const mockSyncService = getMockSyncService();
      jest.spyOn(mockSyncService, 'downloadData').mockResolvedValue(mockData);

      const result = await syncStore.download('chats');

      expect(result).toEqual(mockData);
      expect(mockSyncService.downloadData).toHaveBeenCalledWith('chats');
    });
  });

  describe('Auto Sync Settings', () => {
    it('should enable/disable auto sync', () => {
      expect(syncStore.autoSync).toBe(true);

      syncStore.setAutoSync(false);
      expect(syncStore.autoSync).toBe(false);

      syncStore.setAutoSync(true);
      expect(syncStore.autoSync).toBe(true);
    });

    it('should set sync interval', () => {
      syncStore.setSyncInterval(30);
      expect(syncStore.syncInterval).toBe(30);

      syncStore.setSyncInterval(5);
      expect(syncStore.syncInterval).toBe(5);
    });

    it('should enforce minimum sync interval of 1 minute', () => {
      syncStore.setSyncInterval(0);
      expect(syncStore.syncInterval).toBe(1);

      syncStore.setSyncInterval(-5);
      expect(syncStore.syncInterval).toBe(1);
    });
  });

  describe('clearError', () => {
    it('should clear error status', async () => {
      const mockSyncService = getMockSyncService();
      jest.spyOn(mockSyncService, 'sync').mockRejectedValue(new Error('Test error'));

      await syncStore.sync();
      expect(syncStore.syncStatus).toBe('error');

      syncStore.clearError();
      expect(syncStore.syncStatus).toBe('idle');
    });
  });

  describe('reset', () => {
    it('should reset store to default state', () => {
      // Modify state
      syncStore.markAsDirty('chats');
      syncStore.setAutoSync(false);
      syncStore.setSyncInterval(30);

      // Reset
      syncStore.reset();

      expect(syncStore.syncStatus).toBe('idle');
      expect(syncStore.lastSyncAt).toBeNull();
      expect(syncStore.autoSync).toBe(true);
      expect(syncStore.syncInterval).toBe(15);
      expect(syncStore.hasUnsyncedChanges).toBe(false);
    });
  });
});
