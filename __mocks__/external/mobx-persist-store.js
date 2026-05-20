// Mock for `mobx-persist-store`.
//
// `makePersistable` is a no-op (returns a resolved Promise).
//
// `isHydrated` is controllable per-test via `__setHydrated(bool)`. The
// flag is a MobX observable so `observer`-wrapped components react to
// `__setHydrated()` and trigger the post-hydration render path.
//
// Default state is `true` so suites that don't care about the gate see
// the post-hydration tree as before.
import {observable, runInAction} from 'mobx';

const _state = observable.box(true);

export const makePersistable = jest.fn().mockImplementation(() => {
  return Promise.resolve();
});

export const isHydrated = jest.fn(() => _state.get());

export const __setHydrated = value => {
  runInAction(() => _state.set(value));
};
