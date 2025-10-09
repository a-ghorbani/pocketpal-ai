// Mock for src/services/palshub/SyncService.ts
// This mock avoids dependencies and provides a complete mock implementation

const mockSyncService = {
  // Observable properties (mutable for tests)
  isSyncing: false,
  lastSyncTime: 0,
  syncProgress: null,
  syncError: null,

  // Computed properties
  get syncState() {
    if (this.isSyncing) {
      return {status: 'syncing'};
    }
    if (this.syncError) {
      return {status: 'error', error: this.syncError};
    }
    if (this.lastSyncTime > 0) {
      return {status: 'success', lastSync: this.lastSyncTime};
    }
    return {status: 'idle'};
  },

  // Methods
  syncAll: jest.fn().mockResolvedValue(undefined),
  needsSync: jest.fn().mockResolvedValue(false),
  syncPals: jest.fn().mockResolvedValue(undefined),
  syncUserLibrary: jest.fn().mockResolvedValue(undefined),
  syncUserCreatedPals: jest.fn().mockResolvedValue(undefined),
  clearSyncError: jest.fn(),
  forceSyncAll: jest.fn().mockResolvedValue(undefined),

  // Private methods (mocked for completeness)
  updateSyncStatus: jest.fn().mockResolvedValue(undefined),
  getSyncStatus: jest.fn().mockResolvedValue(null),
  createSyncStatus: jest.fn().mockResolvedValue(undefined),
  syncPalsFromHub: jest.fn().mockResolvedValue(undefined),
  syncLibraryFromHub: jest.fn().mockResolvedValue(undefined),
  syncCreatedPalsFromHub: jest.fn().mockResolvedValue(undefined),
  updateProgress: jest.fn(),
  resetProgress: jest.fn(),
};

// Create a singleton instance
const syncService = mockSyncService;

// Export the mock service
export default syncService;

// Named export for compatibility
export {syncService};

// CommonJS compatibility
module.exports = syncService;
module.exports.default = syncService;
module.exports.syncService = syncService;
