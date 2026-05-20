// Mock for `mobx-persist-store`.
//
// `makePersistable` is a no-op (returns a resolved Promise).
//
// `isHydrated` is controllable per-test via `__setHydrated(bool)`. The
// default is `true` so tests that don't care about the hydration gate
// see the post-hydration tree as before.
let _hydrated = true;

export const makePersistable = jest.fn().mockImplementation(() => {
  return Promise.resolve();
});

export const isHydrated = jest.fn(() => _hydrated);

export const __setHydrated = value => {
  _hydrated = value;
};
