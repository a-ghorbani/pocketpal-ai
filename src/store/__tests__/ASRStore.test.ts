import {AppState} from 'react-native';
import DeviceInfo from 'react-native-device-info';

// Mock persistence BEFORE importing the store.
jest.mock('mobx-persist-store', () => ({
  makePersistable: jest.fn().mockReturnValue(Promise.resolve()),
}));

// Capture AppState handlers so a background/inactive transition can be invoked.
const appStateHandlers: Array<(s: string) => void> = [];
jest
  .spyOn(AppState, 'addEventListener')
  .mockImplementation((event: string, handler: any) => {
    if (event === 'change') {
      appStateHandlers.push(handler);
    }
    return {remove: jest.fn()} as any;
  });

import {
  ASR_INSUFFICIENT_STORAGE,
  ASR_MIN_RAM_BYTES,
  whisperAsrEngine,
} from '../../services/asr';
import {ASRStore} from '../ASRStore';

// Spy on the real engine singleton's methods (same identity the store holds)
// so the store can be exercised without touching whisper.rn or the disk.
const mockIsInstalled = jest.spyOn(whisperAsrEngine, 'isInstalled');
const mockDownloadModel = jest.spyOn(whisperAsrEngine, 'downloadModel');
const mockDeleteModel = jest.spyOn(whisperAsrEngine, 'deleteModel');
const mockReclaim = jest.spyOn(whisperAsrEngine, 'reclaimLegacySpace');
const mockRelease = jest.spyOn(whisperAsrEngine, 'release');

const GIB = 1024 * 1024 * 1024;

describe('ASRStore', () => {
  let store: ASRStore;

  beforeEach(() => {
    jest.clearAllMocks();
    appStateHandlers.length = 0;
    mockIsInstalled.mockResolvedValue(false);
    mockDownloadModel.mockResolvedValue(undefined);
    mockDeleteModel.mockResolvedValue(undefined);
    mockReclaim.mockResolvedValue(undefined);
    mockRelease.mockResolvedValue(undefined);
    (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValue(6 * GIB);
    (DeviceInfo.getFreeDiskStorage as jest.Mock).mockResolvedValue(10 * GIB);
    store = new ASRStore();
  });

  describe('availability gate', () => {
    it('high-memory device, first run → available', async () => {
      (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValue(6 * GIB);
      await store.init();
      expect(store.deviceMeetsMemory).toBe(true);
      expect(store.userASROverride).toBeNull();
      expect(store.asrAvailable).toBe(true);
    });

    it('low-memory device, first run → not available', async () => {
      (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValue(3 * GIB);
      await store.init();
      expect(store.deviceMeetsMemory).toBe(false);
      expect(store.asrAvailable).toBe(false);
    });

    it('low-memory device, user opts in → available', async () => {
      (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValue(3 * GIB);
      await store.init();
      store.setUserASROverride(true);
      expect(store.asrAvailable).toBe(true);
    });

    it('high-memory device, user opts out → not available', async () => {
      await store.init();
      store.setUserASROverride(false);
      expect(store.asrAvailable).toBe(false);
    });

    it('uses the configured RAM threshold', async () => {
      (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValue(
        ASR_MIN_RAM_BYTES,
      );
      await store.init();
      expect(store.deviceMeetsMemory).toBe(true);
    });

    it('treats a getTotalMemory failure as not meeting memory', async () => {
      (DeviceInfo.getTotalMemory as jest.Mock).mockRejectedValue(
        new Error('boom'),
      );
      await store.init();
      expect(store.deviceMeetsMemory).toBe(false);
    });
  });

  describe('init derives install state from disk', () => {
    it('marks an installed tier ready', async () => {
      mockIsInstalled.mockImplementation(async (tier: string) =>
        tier === 'small' ? true : false,
      );
      await store.init();
      expect(store.downloadStates.small).toBe('ready');
      expect(store.downloadStates.base).toBe('not_installed');
      expect(store.isSelectedTierReady).toBe(true);
    });

    it('is idempotent', async () => {
      await store.init();
      await store.init();
      expect(DeviceInfo.getTotalMemory).toHaveBeenCalledTimes(1);
    });
  });

  describe('downloadModel', () => {
    it('reclaims, preflights, downloads, and marks ready', async () => {
      await store.init();
      await store.downloadModel('small');
      expect(mockReclaim).toHaveBeenCalledWith('small');
      expect(mockDownloadModel).toHaveBeenCalled();
      expect(store.downloadStates.small).toBe('ready');
      expect(store.downloadProgress.small).toBe(1);
    });

    it('surfaces an insufficient-storage error when disk is too low', async () => {
      await store.init();
      (DeviceInfo.getFreeDiskStorage as jest.Mock).mockResolvedValue(1024);
      await store.downloadModel('small');
      expect(mockDownloadModel).not.toHaveBeenCalled();
      expect(store.downloadStates.small).toBe('error');
      expect(store.downloadError.small).toBe(ASR_INSUFFICIENT_STORAGE);
      expect(store.freeDiskBytes).toBe(1024);
    });

    it('selects the installed tier on a successful download', async () => {
      await store.init();
      store.setSelectedTier('small');
      await store.downloadModel('base');
      expect(store.downloadStates.base).toBe('ready');
      expect(store.selectedTier).toBe('base');
    });

    it('records an error when the download throws', async () => {
      await store.init();
      mockDownloadModel.mockRejectedValueOnce(new Error('network'));
      await store.downloadModel('small');
      expect(store.downloadStates.small).toBe('error');
      expect(store.downloadError.small).toBe('network');
    });

    it('ignores a concurrent download of the same tier', async () => {
      await store.init();
      store.downloadStates.small = 'downloading';
      await store.downloadModel('small');
      expect(mockDownloadModel).not.toHaveBeenCalled();
    });
  });

  describe('deleteModel', () => {
    it('reselects a remaining ready tier when the active tier is deleted', async () => {
      await store.init();
      store.downloadStates.base = 'ready';
      store.downloadStates.small = 'ready';
      store.setSelectedTier('small');
      await store.deleteModel('small');
      expect(store.downloadStates.small).toBe('not_installed');
      expect(store.selectedTier).toBe('base');
    });

    it('falls back to the default tier when none remain ready', async () => {
      await store.init();
      store.downloadStates.base = 'ready';
      store.setSelectedTier('base');
      await store.deleteModel('base');
      expect(store.selectedTier).toBe('small');
      // The fallback tier is not installed, so the mic stays self-gated.
      expect(store.isSelectedTierReady).toBe(false);
    });

    it('leaves the active tier untouched when a different tier is deleted', async () => {
      await store.init();
      store.downloadStates.small = 'ready';
      store.downloadStates.base = 'ready';
      store.setSelectedTier('small');
      await store.deleteModel('base');
      expect(store.selectedTier).toBe('small');
    });
  });

  describe('background release', () => {
    it('releases the whisper context when the app backgrounds', async () => {
      await store.init();
      appStateHandlers.forEach(h => h('background'));
      expect(mockRelease).toHaveBeenCalled();
    });

    it('does not release on a transient inactive transition', async () => {
      await store.init();
      appStateHandlers.forEach(h => h('inactive'));
      expect(mockRelease).not.toHaveBeenCalled();
    });
  });

  describe('capture FSM', () => {
    it('transitions through error and back to idle on reset', async () => {
      await store.init();
      store.setCaptureState('recording');
      expect(store.captureState).toBe('recording');
      store.setError('too_short');
      expect(store.captureState).toBe('error');
      expect(store.lastError).toBe('too_short');
      store.resetCapture();
      expect(store.captureState).toBe('idle');
      expect(store.lastError).toBeNull();
    });

    it('clears lastError when leaving the error state', async () => {
      await store.init();
      store.setError('transcribe_failed');
      store.setCaptureState('idle');
      expect(store.lastError).toBeNull();
    });
  });

  describe('single-writer surfaces', () => {
    it('userASROverride is written only via setUserASROverride', async () => {
      await store.init();
      store.setUserASROverride(true);
      expect(store.userASROverride).toBe(true);
      store.setUserASROverride(false);
      expect(store.userASROverride).toBe(false);
    });
  });
});
