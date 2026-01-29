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
    // localModel.size is ~2GB, which should fit in 5GB ceiling with 10% margin
    const {result, waitForNextUpdate} = renderHook(() =>
      useMemoryCheck(localModel.size),
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

    // largeMemoryModel requires ~4.48GB, should exceed 2GB * 0.9 = 1.8GB safe ceiling
    const {result, waitForNextUpdate} = renderHook(() =>
      useMemoryCheck(largeMemoryModel.size),
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
    // localModel requires ~2.27GB
    // Cold start: 50% of 6GB = 3GB ceiling, after 10% margin = 2.7GB (should fit)
    (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValue(6 * 1e9);

    const {result, waitForNextUpdate} = renderHook(() =>
      useMemoryCheck(localModel.size),
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
      modelStore.availableMemoryCeiling = 3 * 1e9; // 3GB
      modelStore.largestSuccessfulLoad = 5 * 1e9; // 5GB (larger)
    });

    // Model should pass because ceiling is max(3GB, 5GB) = 5GB
    const {result, waitForNextUpdate} = renderHook(() =>
      useMemoryCheck(localModel.size),
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

  it('applies 10% safety margin to calibrated ceiling', async () => {
    // Set ceiling so that after 10% margin it's clearly enough for the model
    // Model requirement: 0.43 + (0.92 * 2GB) = 2.27GB
    // Set ceiling to 3GB so after 10% margin (2.7GB) it passes
    runInAction(() => {
      modelStore.availableMemoryCeiling = 3 * 1e9;
      modelStore.largestSuccessfulLoad = 3 * 1e9;
    });

    const {result, waitForNextUpdate} = renderHook(() =>
      useMemoryCheck(localModel.size),
    );

    try {
      await waitForNextUpdate();
    } catch {
      // Ignoring timeout
    }

    // After 10% margin: 3GB * 0.9 = 2.7GB
    // Model requirement: 2.27GB
    // Should pass with margin
    expect(result.current.memoryWarning).toBe('');

    // Now test that a lower ceiling would fail
    runInAction(() => {
      modelStore.availableMemoryCeiling = 2.2 * 1e9; // Lower ceiling
      modelStore.largestSuccessfulLoad = 2.2 * 1e9;
    });

    const {result: result2, waitForNextUpdate: wait2} = renderHook(() =>
      useMemoryCheck(localModel.size),
    );

    try {
      await wait2();
    } catch {
      // Ignoring timeout
    }

    // After 10% margin: 2.2GB * 0.9 = 1.98GB < 2.27GB requirement
    // Should fail
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
      useMemoryCheck(largeMemoryModel.size),
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
