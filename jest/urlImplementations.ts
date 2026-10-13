import {URL as PolyfillURL} from 'react-native-url-polyfill';

const NODE_URL = globalThis.URL;

export const URL_IMPLEMENTATIONS: Array<[string, typeof URL]> = [
  ['node URL', NODE_URL],
  ['react-native-url-polyfill URL', PolyfillURL as unknown as typeof URL],
];

export const POLYFILL_URL = URL_IMPLEMENTATIONS[1][1];

/** Swap `globalThis.URL` for each test in the enclosing describe. */
export const useUrlImplementation = (impl: typeof URL): void => {
  let saved: typeof URL;
  beforeEach(() => {
    saved = globalThis.URL;
    globalThis.URL = impl;
  });
  afterEach(() => {
    globalThis.URL = saved;
  });
};

/** Host case survives parsing only under the polyfill: proves the swap is live. */
export const expectUrlImplementationActive = (impl: typeof URL): void => {
  expect(new URL('https://A.com/').hostname).toBe(
    impl === NODE_URL ? 'a.com' : 'A.com',
  );
};
