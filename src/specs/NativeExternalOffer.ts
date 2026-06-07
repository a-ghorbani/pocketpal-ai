import type {TurboModule} from 'react-native';
import {TurboModuleRegistry} from 'react-native';

export interface Spec extends TurboModule {
  reportTransaction(purchaseId: string): Promise<void>;
}

// Optional, Android-only: null on iOS and when the module is not registered.
export default TurboModuleRegistry.get<Spec>('ExternalOfferModule');
