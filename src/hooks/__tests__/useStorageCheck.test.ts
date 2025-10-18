import {renderHook, waitFor} from '@testing-library/react-native';

import {largeDiskModel, basicModel} from '../../../jest/fixtures/models';

import {useStorageCheck} from '../useStorageCheck';

describe('useStorageCheck', () => {
  it('returns storage OK status when there is enough space', async () => {
    const {result} = renderHook(() => useStorageCheck(basicModel));

    expect(result.current).toEqual({
      isOk: true,
      message: '',
    });
  });

  it('returns storage low message when there is not enough space', async () => {
    const {result} = renderHook(() => useStorageCheck(largeDiskModel));

    await waitFor(() => {
      expect(result.current.isOk).toBe(false);
    });

    expect(result.current).toEqual(
      expect.objectContaining({
        isOk: false,
        message: expect.stringContaining('Storage low!'),
      }),
    );
  });

  it('does not update state when unmounted (cleanup test)', async () => {
    const {result, unmount} = renderHook(() => useStorageCheck(largeDiskModel));

    const initialValue = result.current;
    unmount();

    // After unmount, the result should remain at the initial value
    expect(result.current).toEqual(initialValue);
  });
});
