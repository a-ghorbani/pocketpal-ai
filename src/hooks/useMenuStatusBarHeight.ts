import {useMemo} from 'react';
import {Platform, TurboModuleRegistry, type TurboModule} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

interface DeviceInfoModule extends TurboModule {
  getConstants(): {isEdgeToEdge?: boolean};
}

// RN's edge-to-edge flag makes measureInWindow include the status bar, which Paper otherwise adds on Android.
const measuresIncludeStatusBar = (): boolean =>
  Platform.OS === 'android' &&
  TurboModuleRegistry.get<DeviceInfoModule>('DeviceInfo')?.getConstants()
    .isEdgeToEdge === true;

/** The `statusBarHeight` to pass to a Paper `Menu`. */
export const useMenuStatusBarHeight = (): number => {
  const {top} = useSafeAreaInsets();
  const includesStatusBar = useMemo(measuresIncludeStatusBar, []);
  return includesStatusBar ? 0 : top;
};
