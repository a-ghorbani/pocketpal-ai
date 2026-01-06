import DeviceInfo from 'react-native-device-info';
import {renderHook} from '@testing-library/react-hooks';

import {largeMemoryModel, localModel} from '../../../jest/fixtures/models';

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
    } catch (error) {
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
    (DeviceInfo.getTotalMemory as jest.Mock).mockRejectedValue(
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
});
