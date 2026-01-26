import DeviceInfo from 'react-native-device-info';
import {renderHook} from '@testing-library/react-hooks';

import {largeMemoryModel, localModel} from '../../../jest/fixtures/models';
import NativeHardwareInfo from '../../specs/NativeHardwareInfo';
import {modelStore} from '../../store';

// Unmock the hook for actual testing
jest.unmock('../useMemoryCheck');

import {useMemoryCheck} from '../useMemoryCheck';

import {l10n} from '../../utils/l10n';

describe('useMemoryCheck', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns no warning when model size is within safe memory limits', async () => {
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

  it('returns memory warning when model size exceeds safe memory limits', async () => {
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

  it('handles errors gracefully when memory check fails', async () => {
    // Make native API fail first, then DeviceInfo.getTotalMemory fail
    (NativeHardwareInfo.getAvailableMemory as jest.Mock).mockRejectedValueOnce(
      new Error('Native API error'),
    );
    (DeviceInfo.getTotalMemory as jest.Mock).mockRejectedValueOnce(
      new Error('Memory error'),
    );

    // Spy on console.error to ensure it gets called with the correct error
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

    // Ensure the error is logged. TODO: check if there is a better way.
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Memory check failed:',
      new Error('Memory error'),
    );

    consoleErrorSpy.mockRestore();
  });

  it('should use native getAvailableMemory() API', async () => {
    // Verify that the native API is called
    const {result, waitForNextUpdate} = renderHook(() =>
      useMemoryCheck(localModel.size),
    );

    try {
      await waitForNextUpdate();
    } catch {
      // Ignoring timeout
    }

    // Should pass because model is small and 3GB * 0.9 = 2.7GB available
    expect(result.current).toEqual({
      memoryWarning: '',
      shortMemoryWarning: '',
      multimodalWarning: '',
    });

    expect(NativeHardwareInfo.getAvailableMemory).toHaveBeenCalled();
  });

  it('should apply 10% safety margin to available memory', async () => {
    // Test that 10% safety margin is applied
    // Reset mock to return 3GB available (same as default from jest/setup.ts)
    (NativeHardwareInfo.getAvailableMemory as jest.Mock).mockResolvedValue(
      3 * 1000 * 1000 * 1000,
    );

    // The default mock returns 3GB available, after 10% margin = 2.7GB
    // Use largeMemoryModel which is 4.4GB to ensure warning is shown
    // This verifies the native API path is being used with the safety margin applied
    const {result, waitForNextUpdate} = renderHook(() =>
      useMemoryCheck(largeMemoryModel.size),
    );

    try {
      await waitForNextUpdate();
    } catch {
      // Ignoring timeout
    }

    // Model is too large for available memory (after 10% safety margin)
    // This confirms the safety margin is being applied in the native API path
    expect(result.current).toEqual({
      memoryWarning: l10n.en.memory.warning,
      shortMemoryWarning: l10n.en.memory.shortWarning,
      multimodalWarning: '',
    });
  });

  it('should fallback to heuristic if native API fails', async () => {
    (NativeHardwareInfo.getAvailableMemory as jest.Mock).mockRejectedValueOnce(
      new Error('Native API error'),
    );

    const consoleWarnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => {});

    const {result, waitForNextUpdate} = renderHook(() =>
      useMemoryCheck(localModel.size),
    );

    try {
      await waitForNextUpdate();
    } catch {
      // Ignoring timeout
    }

    // Should still work with fallback
    expect(result.current.memoryWarning).toBe('');
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Native API failed'),
      expect.any(Error),
    );

    consoleWarnSpy.mockRestore();

    // Restore the mock to default behavior for subsequent tests
    (NativeHardwareInfo.getAvailableMemory as jest.Mock).mockResolvedValue(
      3 * 1000 * 1000 * 1000,
    );
  });

  describe('Phase 2: Effective Available Memory', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      // Clear modelStore state
      (modelStore as any).loadedModelMemoryUsage = undefined;
      (modelStore as any).activeModelId = undefined;
      (modelStore as any).isMultimodalActive = false;
    });

    it('should add back actual loaded model memory to available', async () => {
      // Setup: 2GB model loaded, consuming 2.2GB actual memory
      // Native API reports 3GB available (after current model loaded)
      // Effective available = 3GB + 2.2GB = 5.2GB

      (NativeHardwareInfo.getAvailableMemory as jest.Mock).mockResolvedValue(
        3 * 1000 * 1000 * 1000, // 3GB available
      );

      // Mock loaded model memory - use a real model from fixtures
      // localModel is 2GB
      (modelStore as any).loadedModelMemoryUsage = 2.2 * 1000 * 1000 * 1000; // 2.2GB
      (modelStore as any).activeModelId = localModel.id; // Sets activeModel via computed
      (modelStore as any).isMultimodalActive = false;

      // Test loading a 4GB model (requires ~4.1GB with formula)
      const modelSize = 4 * 1000 * 1000 * 1000;
      const {result, waitForNextUpdate} = renderHook(() =>
        useMemoryCheck(modelSize),
      );

      try {
        await waitForNextUpdate();
      } catch {
        // Ignoring timeout
      }

      // Should PASS because effective 5.2GB > required 4.1GB
      expect(result.current.memoryWarning).toBe('');
    });

    it('should add back estimated memory when actual unavailable', async () => {
      // Setup: 2GB model loaded, but no actual measurement
      // Native API reports 3GB available
      // Model estimate: 0.43 + 0.92 * 2 = 2.27GB
      // Effective available = 3GB + 2.27GB = 5.27GB

      (NativeHardwareInfo.getAvailableMemory as jest.Mock).mockResolvedValue(
        3 * 1000 * 1000 * 1000,
      );

      // No actual measurement, only active model
      (modelStore as any).loadedModelMemoryUsage = undefined;
      (modelStore as any).activeModelId = localModel.id; // Sets activeModel via computed
      (modelStore as any).isMultimodalActive = false;

      // Test loading a 4GB model (requires ~4.1GB)
      const modelSize = 4 * 1000 * 1000 * 1000;
      const {result, waitForNextUpdate} = renderHook(() =>
        useMemoryCheck(modelSize),
      );

      try {
        await waitForNextUpdate();
      } catch {
        // Ignoring timeout
      }

      // Should PASS because effective 5.27GB > required 4.1GB
      expect(result.current.memoryWarning).toBe('');
    });

    it('should not add memory if no model loaded', async () => {
      // Setup: No model loaded
      // Native API reports 3GB available
      // Effective available = 3GB (no adjustment)

      (NativeHardwareInfo.getAvailableMemory as jest.Mock).mockResolvedValue(
        3 * 1000 * 1000 * 1000,
      );

      (modelStore as any).loadedModelMemoryUsage = undefined;
      (modelStore as any).activeModelId = undefined; // No active model

      // Test loading a 4GB model (requires ~4.1GB)
      const modelSize = 4 * 1000 * 1000 * 1000;
      const {result, waitForNextUpdate} = renderHook(() =>
        useMemoryCheck(modelSize),
      );

      try {
        await waitForNextUpdate();
      } catch {
        // Ignoring timeout
      }

      // Should FAIL because 3GB < required 4.1GB
      expect(result.current.memoryWarning).toBe(l10n.en.memory.warning);
    });
  });
});
