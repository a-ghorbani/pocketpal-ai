import {computed, observable, runInAction} from 'mobx';

import {purchaseStore} from '../../store';

import {shippedPlusFeatures} from './shipped';

export interface PlusRequest {
  onUnlocked?: () => void;
}

export const plusGate = observable(
  {request: null as PlusRequest | null},
  {request: observable.ref},
);

const available = computed(() => shippedPlusFeatures().length > 0);

let returnFocusOnClose = false;

export const shouldReturnFocusOnClose = (): boolean => returnFocusOnClose;

export const isPlusAvailable = (): boolean =>
  __PLUS_STORE_GATE__ && available.get();

export const isPlusUnlocked = (): boolean =>
  !__PLUS_STORE_GATE__ || purchaseStore.plusUnlocked;

export const PLUS_STORE_GATE_MARKER = __PLUS_STORE_GATE__
  ? 'PLUS_STORE_GATE_ON'
  : null;

export const openPlus = (opts: PlusRequest = {}): void => {
  if (!isPlusAvailable()) {
    return;
  }
  runInAction(() => {
    if (plusGate.request === null) {
      purchaseStore.retryPlusProducts();
    }
    plusGate.request = {onUnlocked: opts.onUnlocked};
  });
};

export const dismissPlus = (): void => {
  const onUnlocked = plusGate.request?.onUnlocked;
  const unlocked = purchaseStore.plusUnlocked;
  runInAction(() => {
    returnFocusOnClose = !(unlocked && onUnlocked);
    plusGate.request = null;
  });
  if (unlocked) {
    onUnlocked?.();
  }
};
