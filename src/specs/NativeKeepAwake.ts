import type {TurboModule} from 'react-native';
import {TurboModuleRegistry} from 'react-native';

export interface Spec extends TurboModule {
  activate(): void;
  deactivate(): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('KeepAwakeModule');
