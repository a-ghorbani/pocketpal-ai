import {computed, observable, runInAction} from 'mobx';

import {purchaseStore} from '../../store';

import {PLUS_FEATURES} from './catalog';
import {shippedFeatures} from './features';
import {shipOverride} from './shipOverride';

export interface PlusRequest {
  onUnlocked?: () => void;
}

export const plusGate = observable(
  {request: null as PlusRequest | null},
  {request: observable.ref},
);

const available = computed(
  () => shippedFeatures(PLUS_FEATURES, shipOverride.get()).length > 0,
);

export const isPlusAvailable = (): boolean => available.get();

export const isPlusUnlocked = (): boolean => purchaseStore.plusUnlocked;

export const whenPlusReady = (): Promise<void> => purchaseStore.loadPlus();

export const openPlus = (opts: PlusRequest = {}): void => {
  if (!isPlusAvailable()) {
    return;
  }
  runInAction(() => {
    plusGate.request = {onUnlocked: opts.onUnlocked};
  });
};

export const dismissPlus = (): void => {
  const onUnlocked = plusGate.request?.onUnlocked;
  const unlocked = purchaseStore.plusUnlocked;
  runInAction(() => {
    plusGate.request = null;
  });
  if (unlocked) {
    onUnlocked?.();
  }
};
