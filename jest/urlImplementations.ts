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

/**
 * Assert the active global URL implementation without assuming host-case
 * preservation. The polyfill currently matches the WHATWG URL behavior by
 * lowercasing hostnames, so the test should verify the global constructor is
 * swapped instead of relying on a version-specific hostname quirk.
 */
export const expectUrlImplementationActive = (impl: typeof URL): void => {
  const parsed = new URL('https://A.com/');
  const expectedHostname = parsed.hostname.toLowerCase();

  expect(globalThis.URL).toBe(impl);
  expect(parsed.hostname).toBe(expectedHostname);
};
