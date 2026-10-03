import type {TurboModule} from 'react-native';
import {Platform, TurboModuleRegistry} from 'react-native';

export interface Spec extends TurboModule {
  setEnabled(enabled: boolean): Promise<void>;
}

export default Platform.OS === 'android'
  ? TurboModuleRegistry.get<Spec>('VoiceChatLauncherModule')
  : null;
