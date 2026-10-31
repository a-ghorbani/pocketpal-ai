import {AppState, Platform} from 'react-native';
import DeviceInfo from 'react-native-device-info';
import {runInAction} from 'mobx';
import {makePersistable} from 'mobx-persist-store';

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
  ASR_DEFAULT_TIER,
  ASR_INSUFFICIENT_STORAGE,
  ASR_LEVEL_HISTORY,
  ASR_TIER_ORDER,
  ASR_TIERS,
  whisperAsrEngine,
} from '../../services/asr';
import type {AsrTier} from '../../services/asr';
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

const flush = () => new Promise(resolve => setImmediate(resolve));

const installedOnDisk = (...tiers: AsrTier[]) =>
  mockIsInstalled.mockImplementation(async (tier: AsrTier) =>
    tiers.includes(tier),
  );

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => {
    resolve = r;
  });
  return {promise, resolve};
}

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

  const forceSelected = (tier: AsrTier, target: ASRStore = store) =>
    runInAction(() => {
      target.selectedTier = tier;
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

    const status = async () => (await store.captureMemoryFit()).status;

    it.each([
      [undefined, 'fits'],
      [2.5e9, 'fits'],
      [3.5e9, 'tight'],
      [8e9 - ASR_TIERS.base.runtimeBytes, 'tight'],
      [8e9 - ASR_TIERS.base.runtimeBytes + 1, 'wont_fit'],
    ] as const)(
      'Android, 8 GB, chat model %s bytes → %s',
      async (chatBytes, expected) => {
        Platform.OS = 'android';
        (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValue(8e9);
        modelStore.loadedModelBytes = chatBytes;
        await expect(status()).resolves.toBe(expected);
      },
    );

    it('Android budgets the selected whisper model', async () => {
      Platform.OS = 'android';
      (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValue(8e9);
      modelStore.loadedModelBytes = 3e9;
      forceSelected('base');
      await expect(store.captureMemoryFit()).resolves.toEqual({
        status: 'fits',
        neededBytes: 3e9 + ASR_TIERS.base.runtimeBytes,
      });
      forceSelected('large-turbo');
      await expect(store.captureMemoryFit()).resolves.toEqual({
        status: 'tight',
        neededBytes: 3e9 + ASR_TIERS['large-turbo'].runtimeBytes,
      });
    });

    it.each([
      ['1.7B', 1.9e9, 'small', 'fits'],
      ['4B Q4', 3.2e9, 'base', 'tight'],
      ['4B Q4', 3.2e9, 'small', 'tight'],
      ['4B Q8', 4.3e9, 'base', 'tight'],
      ['8B', 5.9e9, 'base', 'wont_fit'],
    ] as const)(
      'iOS, 4.2 GB free before any load, 6 GB RAM, chat model %s + %s → %s',
      async (_name, chatBytes, tier, expected) => {
        Platform.OS = 'ios';
        (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValue(6e9);
        modelStore.availableMemoryCeiling = 4.2e9;
        // A past oversized load must not raise the budget.
        modelStore.largestSuccessfulLoad = 5.3e9;
        modelStore.loadedModelBytes = chatBytes;
        forceSelected(tier);
        await expect(status()).resolves.toBe(expected);
      },
    );

    it('iOS warns above four fifths of the free memory', async () => {
      Platform.OS = 'ios';
      (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValue(6e9);
      modelStore.availableMemoryCeiling = 4e9;
      forceSelected('base');
      modelStore.loadedModelBytes = 3.2e9 - ASR_TIERS.base.runtimeBytes;
      await expect(status()).resolves.toBe('fits');
      modelStore.loadedModelBytes += 1;
      await expect(status()).resolves.toBe('tight');
    });

    it('iOS budgets the selected whisper model', async () => {
      Platform.OS = 'ios';
      (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValue(6e9);
      modelStore.availableMemoryCeiling = 4.2e9;
      modelStore.loadedModelBytes = 2.5e9;
      forceSelected('small');
      await expect(status()).resolves.toBe('fits');
      forceSelected('large-turbo');
      await expect(status()).resolves.toBe('tight');
    });

    it('iOS does not warn before any ceiling is known', async () => {
      Platform.OS = 'ios';
      modelStore.availableMemoryCeiling = undefined;
      modelStore.largestSuccessfulLoad = undefined;
      modelStore.loadedModelBytes = 4.3e9;
      await expect(status()).resolves.toBe('fits');
    });

    it('fits a need no larger than the one accepted, and warns again above it', async () => {
      Platform.OS = 'android';
      (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValue(8e9);
      forceSelected('base');
      modelStore.loadedModelBytes = 5e9;
      const {neededBytes} = await store.captureMemoryFit();
      store.acceptCaptureMemory(neededBytes);
      await expect(status()).resolves.toBe('fits');
      modelStore.loadedModelBytes = 4e9;
      await expect(status()).resolves.toBe('fits');
      modelStore.loadedModelBytes = 5e9 + 1;
      await expect(status()).resolves.toBe('tight');
    });

    it('an accepted need never lets a need above total RAM through', async () => {
      Platform.OS = 'android';
      (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValue(8e9);
      store.acceptCaptureMemory(20e9);
      modelStore.loadedModelBytes = 9e9;
      await expect(status()).resolves.toBe('wont_fit');
    });

    it('does not persist the accepted need', () => {
      const [[, options]] = (makePersistable as jest.Mock).mock.calls;
      expect(options.properties).not.toContain('acceptedCaptureBytes');
    });

    it('does not warn when memory cannot be read', async () => {
      Platform.OS = 'android';
      (DeviceInfo.getTotalMemory as jest.Mock).mockRejectedValue(
        new Error('unavailable'),
      );
      await expect(status()).resolves.toBe('fits');
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
      forceSelected('small');
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

  describe('in-use tier', () => {
    it('fresh install: nothing persisted or installed → the default, base', async () => {
      await store.init();
      expect(ASR_DEFAULT_TIER).toBe('base');
      expect(store.selectedTier).toBe('base');
      expect(store.isSelectedTierReady).toBe(false);
    });

    it.each([
      ['small', ['base'], 'base'],
      ['small', ['small', 'base'], 'small'],
      ['small', [], 'base'],
      ['large-turbo', ['small'], 'small'],
    ] as const)(
      'persisted %s with %j on disk → %s',
      async (persisted, onDisk, expected) => {
        forceSelected(persisted);
        installedOnDisk(...onDisk);
        await store.init();
        expect(store.selectedTier).toBe(expected);
      },
    );

    it('reconciles only after hydration, even when it lands after the disk scan', async () => {
      const hydration = deferred();
      (makePersistable as jest.Mock).mockImplementationOnce(
        () => hydration.promise,
      );
      const late = new ASRStore();
      installedOnDisk('small');
      const init = late.init();
      await flush();
      expect(late.downloadStates.small).toBe('not_installed');

      forceSelected('large-turbo', late);
      hydration.resolve();
      await init;

      expect(late.downloadStates.small).toBe('ready');
      expect(late.selectedTier).toBe('small');
    });

    it('keeps a download started during the disk scan in progress', async () => {
      const scan = deferred();
      mockIsInstalled.mockImplementation(async (tier: AsrTier) => {
        await scan.promise;
        return tier === 'small';
      });
      const engineDownload = deferred();
      mockDownloadModel.mockImplementationOnce(() => engineDownload.promise);

      const init = store.init();
      const download = store.downloadModel('base');
      await flush();
      scan.resolve();
      await init;

      expect(store.downloadStates.base).toBe('downloading');
      expect(store.selectedTier).toBe('small');

      engineDownload.resolve();
      await download;
      expect(store.downloadStates.base).toBe('ready');
      expect(store.selectedTier).toBe('small');
    });

    it('decides first-install select against the reconciled tier', async () => {
      const scan = deferred();
      mockIsInstalled.mockImplementation(async (tier: AsrTier) => {
        await scan.promise;
        return tier === 'small';
      });
      forceSelected('small');

      const init = store.init();
      const download = store.downloadModel('base');
      await flush();
      expect(mockDownloadModel).toHaveBeenCalled();
      expect(store.downloadStates.base).toBe('downloading');

      scan.resolve();
      await Promise.all([init, download]);

      expect(store.downloadStates.base).toBe('ready');
      expect(store.selectedTier).toBe('small');
    });

    it('a download does not switch a ready in-use tier; selectTier does', async () => {
      installedOnDisk('base');
      await store.init();

      await store.downloadModel('small');
      expect(store.downloadStates.small).toBe('ready');
      expect(store.selectedTier).toBe('base');

      store.selectTier('small');
      expect(store.selectedTier).toBe('small');
    });

    it('selectTier ignores a tier that is not installed', async () => {
      installedOnDisk('base');
      await store.init();
      store.selectTier('large-turbo');
      expect(store.selectedTier).toBe('base');
    });

    it('the first install selects its tier', async () => {
      await store.init();
      await store.downloadModel('small');
      expect(store.selectedTier).toBe('small');
    });

    it('deleting the in-use tier falls back through the ready tiers', async () => {
      installedOnDisk('base', 'small');
      await store.init();
      expect(store.selectedTier).toBe('base');

      await store.deleteModel('base');
      expect(store.selectedTier).toBe('small');

      await store.deleteModel('small');
      expect(store.selectedTier).toBe('base');
      expect(store.isSelectedTierReady).toBe(false);
    });

    it('concurrent first installs: the first to finish is in use', async () => {
      await store.init();
      const small = deferred();
      const base = deferred();
      mockDownloadModel.mockImplementation(async (tier: AsrTier) =>
        tier === 'small' ? small.promise : base.promise,
      );
      const smallDone = store.downloadModel('small');
      const baseDone = store.downloadModel('base');
      await flush();

      small.resolve();
      await smallDone;
      expect(store.selectedTier).toBe('small');

      base.resolve();
      await baseDone;
      expect(store.downloadStates.base).toBe('ready');
      expect(store.selectedTier).toBe('small');
    });

    it('a failed download leaves the in-use tier alone', async () => {
      await store.init();
      mockDownloadModel.mockRejectedValueOnce(new Error('network'));
      await store.downloadModel('small');
      expect(store.downloadStates.small).toBe('error');
      expect(store.selectedTier).toBe(ASR_DEFAULT_TIER);
    });

    it('setupTier is the in-use tier once ready, else the default', async () => {
      installedOnDisk('small');
      await store.init();
      expect(store.setupTier).toBe('small');

      await store.deleteModel('small');
      runInAction(() => {
        store.downloadStates.small = 'downloading';
      });
      expect(store.setupTier).toBe('base');
    });

    it('setupTier offers the default before reconcile, not a hydrated stale tier', async () => {
      const hydration = deferred();
      (makePersistable as jest.Mock).mockImplementationOnce(
        () => hydration.promise,
      );
      const early = new ASRStore();
      const init = early.init();
      forceSelected('small', early);

      expect(early.setupTier).toBe('base');

      hydration.resolve();
      await init;
      expect(early.selectedTier).toBe('base');
    });
  });

  describe('deleteModel', () => {
    it('reselects a remaining ready tier when the active tier is deleted', async () => {
      await store.init();
      store.downloadStates.base = 'ready';
      store.downloadStates.small = 'ready';
      forceSelected('small');
      await store.deleteModel('small');
      expect(store.downloadStates.small).toBe('not_installed');
      expect(store.selectedTier).toBe('base');
    });

    it('falls back to the default tier when none remain ready', async () => {
      await store.init();
      store.downloadStates.small = 'ready';
      forceSelected('small');
      await store.deleteModel('small');
      expect(store.selectedTier).toBe(ASR_DEFAULT_TIER);
      // The fallback tier is not installed, so the mic stays self-gated.
      expect(store.isSelectedTierReady).toBe(false);
    });

    it('leaves the active tier untouched when a different tier is deleted', async () => {
      await store.init();
      store.downloadStates.small = 'ready';
      store.downloadStates.base = 'ready';
      forceSelected('small');
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
