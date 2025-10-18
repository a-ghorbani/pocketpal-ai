import {renderHook, waitFor} from '@testing-library/react-native';

jest.unmock('../useTheme');
jest.unmock('../../store');
import {useTheme} from '../useTheme';

import {uiStore} from '../../store';

import {darkTheme, lightTheme} from '../../utils/theme';

describe('useTheme', () => {
  beforeEach(() => {
    uiStore.setColorScheme('light');
  });

  it('should return light theme when colorScheme is light', () => {
    const {result} = renderHook(() => useTheme());

    expect(result.current).toEqual(
      expect.objectContaining({
        ...lightTheme,
      }),
    );
  });

  it('should return dark theme when colorScheme is dark', async () => {
    uiStore.setColorScheme('dark');

    const {result} = renderHook(() => useTheme());

    // Wait for the theme change to be applied
    await waitFor(() => {
      expect(result.current).toEqual(
        expect.objectContaining({
          ...darkTheme,
        }),
      );
    });
  });
});
