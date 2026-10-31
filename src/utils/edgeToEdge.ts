import {Platform, TurboModuleRegistry, type TurboModule} from 'react-native';

interface DeviceInfoModule extends TurboModule {
  getConstants(): {isEdgeToEdge?: boolean};
}

let isEdgeToEdge: boolean | undefined;

// RN's edge-to-edge flag makes measureInWindow include the status bar, which Paper otherwise adds on Android.
export const measuresIncludeStatusBar = (): boolean => {
  if (Platform.OS !== 'android') {
    return false;
  }
  if (isEdgeToEdge === undefined) {
    isEdgeToEdge =
      TurboModuleRegistry.get<DeviceInfoModule>('DeviceInfo')?.getConstants()
        .isEdgeToEdge === true;
  }
  return isEdgeToEdge;
};
