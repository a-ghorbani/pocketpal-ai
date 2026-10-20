import {useEffect} from 'react';

import NativeNavigationBar from '../specs/NativeNavigationBar';
import {uiStore} from '../store';

/** Sets the Android navigation bar icons to contrast with the app's colour scheme. */
export const useNavigationBarAppearance = (): void => {
  const isDark = uiStore.colorScheme === 'dark';

  useEffect(() => {
    NativeNavigationBar?.setNavigationBarDark(isDark);
  }, [isDark]);
};
