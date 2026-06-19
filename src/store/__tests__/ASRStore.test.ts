import DeviceInfo from 'react-native-device-info';

// Mock persistence BEFORE importing the store.
jest.mock('mobx-persist-store', () => ({
  makePersistable: jest.fn().mockReturnValue(Promise.resolve()),
}));

import {ASR_MIN_RAM_BYTES, whisperAsrEngine} from '../../services/asr';
import {ASRStore} from '../ASRStore';

// Spy on the real engine singleton's methods (same identity the store holds)
// so the store can be exercised without touching whisper.rn or the disk.
const mockIsInstalled = jest.spyOn(whisperAsrEngine, 'isInstalled');
const mockDownloadModel = jest.spyOn(whisperAsrEngine, 'downloadModel');
const mockDeleteModel = jest.spyOn(whisperAsrEngine, 'deleteModel');
const mockReclaim = jest.spyOn(whisperAsrEngine, 'reclaimLegacySpace');

const GIB = 1024 * 1024 * 1024;

describe('ASRStore', () => {
  let store: ASRStore;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsInstalled.mockResolvedValue(false);
    mockDownloadModel.mockResolvedValue(undefined);
    mockDeleteModel.mockResolvedValue(undefined);
    mockReclaim.mockResolvedValue(undefined);
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

    it('blocks the download when disk is too low', async () => {
      await store.init();
      (DeviceInfo.getFreeDiskStorage as jest.Mock).mockResolvedValue(1024);
      await store.downloadModel('small');
      expect(mockDownloadModel).not.toHaveBeenCalled();
      expect(store.downloadStates.small).toBe('not_installed');
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
