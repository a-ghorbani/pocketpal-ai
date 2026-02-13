import DeviceInfo from 'react-native-device-info';
import {renderHook} from '@testing-library/react-hooks';
import {runInAction} from 'mobx';

import {largeMemoryModel, localModel} from '../../../jest/fixtures/models';
import {modelStore} from '../../store';

// Unmock the hook for actual testing
jest.unmock('../useMemoryCheck');

import {useMemoryCheck} from '../useMemoryCheck';

import {l10n} from '../../locales';

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
      fitStatus: 'fits',
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

    // Should have tight or wont_fit status with appropriate warnings
    expect(result.current.fitStatus).not.toBe('fits');
    expect(result.current.shortMemoryWarning).toBeTruthy();
    expect(result.current.memoryWarning).toContain('needs');
    expect(result.current.multimodalWarning).toBe('');
  });

  it('relies on ModelStore calibration data (no local fallback)', async () => {
    runInAction(() => {
      modelStore.availableMemoryCeiling = 5 * 1e9; // 5GB from store
      modelStore.largestSuccessfulLoad = undefined;
    });

    // localModel.size = 2GB, requirement = 2.4GB
    // availableBytes = max(0, 5GB) = 5GB
    // 2.4GB <= 5GB → fits
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
      fitStatus: 'fits',
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
      fitStatus: 'fits',
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
    expect(result.current.fitStatus).toBe('fits');

    // Now test that a lower ceiling would fail
    // localModel.size = 2GB, requirement = 2.4GB
    // ceiling = 2GB → 2.4GB > 2GB → fails (tight or wont_fit)
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

    // Should show memory tight or low memory warning with detailed message
    expect(result2.current.fitStatus).not.toBe('fits');
    expect(result2.current.shortMemoryWarning).toBeTruthy();
    expect(result2.current.memoryWarning).toContain('needs');
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
      fitStatus: 'fits',
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Memory check failed:',
      expect.any(Error),
    );

    consoleErrorSpy.mockRestore();

    // Restore mock
    (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValue(4 * 1e9);
  });

  it('returns memoryTight for tight status', async () => {
    // Set ceiling so requirement is between available and total
    // This creates a "tight" situation
    runInAction(() => {
      modelStore.availableMemoryCeiling = 2 * 1e9; // 2GB available
      modelStore.largestSuccessfulLoad = 2 * 1e9;
    });

    // Mock total memory to be higher than requirement
    (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValue(8 * 1e9); // 8GB total

    const {result, waitForNextUpdate} = renderHook(
      () => useMemoryCheck(localModel), // 2GB model → 2.4GB requirement
    );

    try {
      await waitForNextUpdate();
    } catch {
      // Ignoring timeout
    }

    // 2.4GB > 2GB available but < 8GB total → tight
    expect(result.current.fitStatus).toBe('tight');
    expect(result.current.shortMemoryWarning).toBe(l10n.en.memory.memoryTight);
  });

  it('returns lowMemory for wont_fit status', async () => {
    // Set ceiling and total memory so requirement exceeds both
    runInAction(() => {
      modelStore.availableMemoryCeiling = 2 * 1e9;
      modelStore.largestSuccessfulLoad = 2 * 1e9;
    });

    // Mock total memory to be less than requirement
    (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValue(2 * 1e9); // 2GB total

    const {result, waitForNextUpdate} = renderHook(
      () => useMemoryCheck(localModel), // 2GB model → 2.4GB requirement
    );

    try {
      await waitForNextUpdate();
    } catch {
      // Ignoring timeout
    }

    // 2.4GB > 2GB total → wont_fit
    expect(result.current.fitStatus).toBe('wont_fit');
    expect(result.current.shortMemoryWarning).toBe(l10n.en.memory.lowMemory);
  });
});
