import DeviceInfo from 'react-native-device-info';
import {renderHook} from '@testing-library/react-hooks';
import {runInAction} from 'mobx';

import {largeMemoryModel, localModel} from '../../../jest/fixtures/models';
import {modelStore} from '../../store';

// Unmock the hook for actual testing
jest.unmock('../useMemoryCheck');

import {useMemoryCheck} from '../useMemoryCheck';

import {l10n} from '../../utils/l10n';

describe('useMemoryCheck', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset calibration data to known state
    runInAction(() => {
      modelStore.availableMemoryCeiling = 5 * 1e9; // 5GB
      modelStore.largestSuccessfulLoad = 4 * 1e9; // 4GB
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns no warning when model size is within calibrated ceiling', async () => {
    // localModel.size is 2GB, requirement = 2GB × 1.2 = 2.4GB (fallback estimation)
    // ceiling = max(4GB, 5GB) = 5GB
    // 2.4GB <= 5GB → passes
    const {result, waitForNextUpdate} = renderHook(() =>
      useMemoryCheck(localModel),
    );

    try {
      await waitForNextUpdate();
    } catch {
      // Ignoring timeout
    }

    expect(result.current).toEqual({
      memoryWarning: '',
      shortMemoryWarning: '',
      multimodalWarning: '',
    });
  });

  it('returns memory warning when model size exceeds calibrated ceiling', async () => {
    // Set a low ceiling to trigger warning
    runInAction(() => {
      modelStore.availableMemoryCeiling = 2 * 1e9; // 2GB
      modelStore.largestSuccessfulLoad = 2 * 1e9; // 2GB
    });

    // largeMemoryModel.size = totalMemory × 1.1 (from fixture)
    // requirement = size × 1.2 (fallback estimation)
    // This will exceed the 2GB ceiling
    const {result, waitForNextUpdate} = renderHook(() =>
      useMemoryCheck(largeMemoryModel),
    );

    try {
      await waitForNextUpdate();
    } catch {
      // Ignoring timeout
    }

    expect(result.current).toEqual({
      memoryWarning: l10n.en.memory.warning,
      shortMemoryWarning: l10n.en.memory.shortWarning,
      multimodalWarning: '',
    });
  });

  it('uses cold start fallback when calibration data unavailable', async () => {
    // Clear calibration data
    runInAction(() => {
      modelStore.availableMemoryCeiling = undefined;
      modelStore.largestSuccessfulLoad = undefined;
    });

    // Mock getTotalMemory to return 6GB
    // localModel.size = 2GB, requirement = 2GB × 1.2 = 2.4GB
    // Cold start ceiling: 50% of 6GB = 3GB
    // 2.4GB <= 3GB → passes
    (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValue(6 * 1e9);

    const {result, waitForNextUpdate} = renderHook(() =>
      useMemoryCheck(localModel),
    );

    try {
      await waitForNextUpdate();
    } catch {
      // Ignoring timeout
    }

    expect(result.current).toEqual({
      memoryWarning: '',
      shortMemoryWarning: '',
      multimodalWarning: '',
    });
  });

  it('uses maximum of largestSuccessfulLoad and availableMemoryCeiling', async () => {
    // Set largestSuccessfulLoad higher than availableMemoryCeiling
    runInAction(() => {
      modelStore.availableMemoryCeiling = 2 * 1e9; // 2GB
      modelStore.largestSuccessfulLoad = 5 * 1e9; // 5GB (larger)
    });

    // localModel.size = 2GB, requirement = 2.4GB
    // ceiling = max(2GB, 5GB) = 5GB
    // 2.4GB <= 5GB → passes
    const {result, waitForNextUpdate} = renderHook(() =>
      useMemoryCheck(localModel),
    );

    try {
      await waitForNextUpdate();
    } catch {
      // Ignoring timeout
    }

    expect(result.current).toEqual({
      memoryWarning: '',
      shortMemoryWarning: '',
      multimodalWarning: '',
    });
  });

  it('uses single estimation function for memory requirement', async () => {
    // The memory requirement is calculated using getModelMemoryRequirement()
    // which applies 1.2× safety margin for fallback (no GGUF metadata)
    // localModel.size = 2GB, requirement = 2GB × 1.2 = 2.4GB
    // ceiling = 3GB → 2.4GB <= 3GB → passes
    runInAction(() => {
      modelStore.availableMemoryCeiling = 3 * 1e9;
      modelStore.largestSuccessfulLoad = 3 * 1e9;
    });

    const {result, waitForNextUpdate} = renderHook(() =>
      useMemoryCheck(localModel),
    );

    try {
      await waitForNextUpdate();
    } catch {
      // Ignoring timeout
    }

    expect(result.current.memoryWarning).toBe('');

    // Now test that a lower ceiling would fail
    // localModel.size = 2GB, requirement = 2.4GB
    // ceiling = 2GB → 2.4GB > 2GB → fails
    runInAction(() => {
      modelStore.availableMemoryCeiling = 2 * 1e9;
      modelStore.largestSuccessfulLoad = 2 * 1e9;
    });

    const {result: result2, waitForNextUpdate: wait2} = renderHook(() =>
      useMemoryCheck(localModel),
    );

    try {
      await wait2();
    } catch {
      // Ignoring timeout
    }

    expect(result2.current.memoryWarning).toBe(l10n.en.memory.warning);
  });

  it('handles errors gracefully when DeviceInfo.getTotalMemory fails on cold start', async () => {
    // Clear calibration data to force cold start path
    runInAction(() => {
      modelStore.availableMemoryCeiling = undefined;
      modelStore.largestSuccessfulLoad = undefined;
    });

    // Make getTotalMemory fail
    (DeviceInfo.getTotalMemory as jest.Mock).mockRejectedValueOnce(
      new Error('Memory error'),
    );

    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const {result, waitForNextUpdate} = renderHook(() =>
      useMemoryCheck(largeMemoryModel),
    );

    try {
      await waitForNextUpdate();
    } catch {
      // Ignoring timeout
    }

    // Ensure no warnings are shown when there's an error
    expect(result.current).toEqual({
      memoryWarning: '',
      shortMemoryWarning: '',
      multimodalWarning: '',
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Memory check failed:',
      expect.any(Error),
    );

    consoleErrorSpy.mockRestore();

    // Restore mock
    (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValue(4 * 1e9);
  });
});
