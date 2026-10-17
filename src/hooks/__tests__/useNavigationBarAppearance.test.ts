import {renderHook} from '@testing-library/react-native';

import * as specModule from '../../specs/NativeNavigationBar';
import {uiStore} from '../../store';
import {useNavigationBarAppearance} from '../useNavigationBarAppearance';

const setNavigationBarDark = specModule.default!
  .setNavigationBarDark as jest.Mock;

describe('useNavigationBarAppearance', () => {
  beforeEach(() => {
    setNavigationBarDark.mockClear();
    uiStore.colorScheme = 'light';
  });

  it('requests light icons when the app is dark', () => {
    uiStore.colorScheme = 'dark';

    renderHook(() => useNavigationBarAppearance());

    expect(setNavigationBarDark).toHaveBeenCalledTimes(1);
    expect(setNavigationBarDark).toHaveBeenCalledWith(true);
  });

  it('requests dark icons when the scheme changes to light', () => {
    uiStore.colorScheme = 'dark';
    const {rerender} = renderHook(() => useNavigationBarAppearance());

    uiStore.colorScheme = 'light';
    rerender({});

    expect(setNavigationBarDark).toHaveBeenCalledTimes(2);
    expect(setNavigationBarDark).toHaveBeenLastCalledWith(false);
  });

  it('does not call again when the scheme is unchanged', () => {
    const {rerender} = renderHook(() => useNavigationBarAppearance());

    rerender({});

    expect(setNavigationBarDark).toHaveBeenCalledTimes(1);
  });

  it('exports no module on iOS', () => {
    jest.isolateModules(() => {
      const {Platform} = require('react-native');
      Platform.OS = 'ios';

      expect(
        jest.requireActual('../../specs/NativeNavigationBar').default,
      ).toBeNull();
    });
  });

  it('renders without calling native when the module is absent', () => {
    jest.replaceProperty(specModule, 'default', null);

    expect(() => renderHook(() => useNavigationBarAppearance())).not.toThrow();
    expect(setNavigationBarDark).not.toHaveBeenCalled();
  });
});
