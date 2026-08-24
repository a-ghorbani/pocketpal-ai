import type {TurboModule} from 'react-native';
import {TurboModuleRegistry} from 'react-native';

export interface Spec extends TurboModule {
  start(title: string, text: string): void;
  update(text: string): void;
  stop(): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>(
  'ForegroundServiceModule',
);
