import type {TurboModule} from 'react-native';
import {TurboModuleRegistry} from 'react-native';

export interface Spec extends TurboModule {
  openAuth(url: string, callbackScheme: string): Promise<string>;
}

export default TurboModuleRegistry.get<Spec>('AuthSessionModule');
