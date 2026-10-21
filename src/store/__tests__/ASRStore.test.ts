import {AppState, Platform} from 'react-native';
import DeviceInfo from 'react-native-device-info';

// Mock persistence BEFORE importing the store.
jest.mock('mobx-persist-store', () => ({
  makePersistable: jest.fn().mockReturnValue(Promise.resolve()),
}));
jest.mock('../ModelStore', () => ({
  modelStore: require('../../../__mocks__/stores/modelStore').mockModelStore,
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
  ASR_LEVEL_HISTORY,
  ASR_TIER_ORDER,
  ASR_TIERS,
  whisperAsrEngine,
} from '../../services/asr';
import {ASRStore} from '../ASRStore';
import {modelStore} from '../ModelStore';

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
    modelStore.deviceTier = 'high';
    modelStore.inferencing = false;
    modelStore.context = undefined;
    modelStore.loadedModelBytes = undefined;
    (DeviceInfo.getFreeDiskStorage as jest.Mock).mockResolvedValue(10 * GIB);
    store = new ASRStore();
  });

  describe('availability gate', () => {
    it.each([
      ['flagship', true],
      ['high', true],
      ['mid', false],
      ['low', false],
      [null, false],
    ] as const)('device tier %s, first run → available %s', (tier, avail) => {
      modelStore.deviceTier = tier;
      expect(store.deviceSupported).toBe(avail);
      expect(store.userASROverride).toBeNull();
      expect(store.asrAvailable).toBe(avail);
    });

    it('unsupported device, user opts in → available', () => {
      modelStore.deviceTier = 'low';
      store.setUserASROverride(true);
      expect(store.asrAvailable).toBe(true);
    });

    it('supported device, user opts out → not available', () => {
      modelStore.deviceTier = 'high';
      store.setUserASROverride(false);
      expect(store.asrAvailable).toBe(false);
    });
  });

  describe('memory check before recording', () => {
    const platform = Platform.OS;
    const {availableMemoryCeiling, largestSuccessfulLoad} = modelStore;

    afterEach(() => {
      Platform.OS = platform;
      modelStore.availableMemoryCeiling = availableMemoryCeiling;
      modelStore.largestSuccessfulLoad = largestSuccessfulLoad;
    });

    it.each([
      [undefined, true],
      [2.5e9, true],
      [3.5e9, false],
    ])(
      'Android, 8 GB, chat model %s bytes → fits %s',
      async (chatBytes, fits) => {
        Platform.OS = 'android';
        (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValue(8e9);
        modelStore.loadedModelBytes = chatBytes;
        await expect(store.hasMemoryForCapture()).resolves.toBe(fits);
      },
    );

    it('Android budgets the selected whisper model', async () => {
      Platform.OS = 'android';
      (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValue(8e9);
      modelStore.loadedModelBytes = 3e9;
      store.setSelectedTier('base');
      await expect(store.hasMemoryForCapture()).resolves.toBe(true);
      store.setSelectedTier('large-turbo');
      await expect(store.hasMemoryForCapture()).resolves.toBe(false);
    });

    it.each([
      ['1.7B', 1.9e9, 'small', true],
      ['4B Q4', 3.2e9, 'base', false],
      ['4B Q4', 3.2e9, 'small', false],
      ['4B Q8', 4.3e9, 'base', false],
    ] as const)(
      'iOS, 4.2 GB free before any load, chat model %s + %s → fits %s',
      async (_name, chatBytes, tier, fits) => {
        Platform.OS = 'ios';
        modelStore.availableMemoryCeiling = 4.2e9;
        // A past oversized load must not raise the budget.
        modelStore.largestSuccessfulLoad = 5.3e9;
        modelStore.loadedModelBytes = chatBytes;
        store.setSelectedTier(tier);
        await expect(store.hasMemoryForCapture()).resolves.toBe(fits);
      },
    );

    it('iOS keeps a fifth of the free memory in reserve', async () => {
      Platform.OS = 'ios';
      modelStore.availableMemoryCeiling = 4e9;
      store.setSelectedTier('base');
      modelStore.loadedModelBytes = 3.2e9 - ASR_TIERS.base.runtimeBytes;
      await expect(store.hasMemoryForCapture()).resolves.toBe(true);
      modelStore.loadedModelBytes += 1;
      await expect(store.hasMemoryForCapture()).resolves.toBe(false);
    });

    it('iOS budgets the selected whisper model', async () => {
      Platform.OS = 'ios';
      modelStore.availableMemoryCeiling = 4.2e9;
      modelStore.loadedModelBytes = 2.5e9;
      store.setSelectedTier('small');
      await expect(store.hasMemoryForCapture()).resolves.toBe(true);
      store.setSelectedTier('large-turbo');
      await expect(store.hasMemoryForCapture()).resolves.toBe(false);
    });

    it('iOS does not block recording before any ceiling is known', async () => {
      Platform.OS = 'ios';
      modelStore.availableMemoryCeiling = undefined;
      modelStore.largestSuccessfulLoad = undefined;
      modelStore.loadedModelBytes = 4.3e9;
      await expect(store.hasMemoryForCapture()).resolves.toBe(true);
    });

    it('does not block recording when memory cannot be read', async () => {
      Platform.OS = 'android';
      (DeviceInfo.getTotalMemory as jest.Mock).mockRejectedValue(
        new Error('unavailable'),
      );
      await expect(store.hasMemoryForCapture()).resolves.toBe(true);
    });
  });

  describe('chatBusyOnCpu', () => {
    it.each([
      [true, false, true],
      [true, true, false],
      [false, false, false],
    ])('inferencing %s on gpu %s → %s', (inferencing, gpu, busy) => {
      modelStore.inferencing = inferencing;
      modelStore.context = {gpu} as any;
      expect(store.chatBusyOnCpu).toBe(busy);
    });

    it('is false without a local model', () => {
      modelStore.inferencing = true;
      modelStore.context = undefined;
      expect(store.chatBusyOnCpu).toBe(false);
    });
  });

  describe('spoken language', () => {
    it('starts undetected and keeps what it is set to', () => {
      expect(store.spokenLanguage).toBeNull();
      store.setSpokenLanguage('de');
      expect(store.spokenLanguage).toBe('de');
      store.setSpokenLanguage(null);
      expect(store.spokenLanguage).toBeNull();
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
      expect(mockIsInstalled).toHaveBeenCalledTimes(ASR_TIER_ORDER.length);
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

    it('keeps the selected tier when asked not to select', async () => {
      await store.init();
      store.setSelectedTier('small');
      await store.downloadModel('base', {select: false});
      expect(store.downloadStates.base).toBe('ready');
      expect(store.selectedTier).toBe('small');
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

    it.each(['requesting_perm', 'recording', 'transcribing'] as const)(
      'keeps the whisper context while a capture is %s',
      async state => {
        await store.init();
        store.setCaptureState(state);
        appStateHandlers.forEach(h => h('background'));
        expect(mockRelease).not.toHaveBeenCalled();
      },
    );

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
      store.setError('transcribe_failed');
      expect(store.captureState).toBe('error');
      expect(store.lastError).toBe('transcribe_failed');
      store.resetCapture();
      expect(store.captureState).toBe('idle');
      expect(store.lastError).toBeNull();
    });

    it('keeps only the most recent input levels, cleared per recording', async () => {
      await store.init();
      store.setCaptureState('recording');
      for (let i = 0; i < ASR_LEVEL_HISTORY + 5; i++) {
        store.pushInputLevel(i);
      }
      expect(store.inputLevels).toHaveLength(ASR_LEVEL_HISTORY);
      expect(store.inputLevels[0]).toBe(5);
      expect(store.inputLevels[ASR_LEVEL_HISTORY - 1]).toBe(
        ASR_LEVEL_HISTORY + 4,
      );

      store.setCaptureState('recording');
      expect(store.inputLevels).toEqual([]);
    });

    it('records when a recording started and clears it after', async () => {
      await store.init();
      store.setCaptureState('recording');
      expect(store.recordingStartedAt).not.toBeNull();
      store.setCaptureState('transcribing');
      expect(store.recordingStartedAt).toBeNull();
      store.setCaptureState('recording');
      store.resetCapture();
      expect(store.recordingStartedAt).toBeNull();
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
