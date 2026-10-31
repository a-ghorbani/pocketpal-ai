import {observable, runInAction} from 'mobx';

export const shipOverride = observable.box<ReadonlySet<string>>(new Set(), {
  deep: false,
});

export const setShipOverride = (featureIds: readonly string[]): void => {
  if (__E2E__) {
    runInAction(() => {
      shipOverride.set(new Set(featureIds));
    });
  }
};
