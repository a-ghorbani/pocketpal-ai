import type {TurboModule} from 'react-native';
import {Platform, TurboModuleRegistry} from 'react-native';

export interface Spec extends TurboModule {
  setNavigationBarDark(isDark: boolean): void;
}

const NativeNavigationBar: Spec | null =
  Platform.OS === 'android'
    ? TurboModuleRegistry.getEnforcing<Spec>('NavigationBarModule')
    : null;

export default NativeNavigationBar;
