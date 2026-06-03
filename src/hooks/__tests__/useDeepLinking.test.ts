/**
 * useDeepLinking — cold-launch routing tests
 *
 * Covers the SHOULD rows from the Test Requirements table for the
 * `__E2E__`-gated `useEffect` that reads
 * `Linking.getInitialURL()` and routes to `BenchmarkRunner` when the
 * launching intent matches `pocketpal://e2e/benchmark`.
 *
 * Notes:
 * - We do NOT cover the existing iOS-only chat-deep-link path here; the
 *   only behavioral delta in this story is the cold-launch effect.
 * - We render via `renderHook` so the hook can subscribe to
 *   `useNavigation()` without a full screen tree.
 */

import {Alert, Linking} from 'react-native';
import {renderHook} from '@testing-library/react-native';

import {useDeepLinking} from '../useDeepLinking';
import {ROUTES} from '../../utils/navigationConstants';

// Stable navigate spy that we re-assert across the file. The hook reads
// `useNavigation()` once per render, so capturing the function from a
// module-level mock keeps the spy alive across re-renders.
const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => ({
      navigate: mockNavigate,
      addListener: jest.fn(() => ({remove: jest.fn()})),
      goBack: jest.fn(),
      setOptions: jest.fn(),
      dispatch: jest.fn(),
    }),
  };
});

// Stub the iOS-only DeepLinkService so the second `useEffect` (chat-deep-link
// path) is a no-op and doesn't mask the cold-launch effect under test.
jest.mock('../../services/DeepLinkService', () => ({
  deepLinkService: {
    initialize: jest.fn(),
    addListener: jest.fn(() => () => {}),
    cleanup: jest.fn(),
  },
}));

describe('useDeepLinking — cold-launch routing', () => {
  let getInitialURLSpy: jest.SpyInstance;
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    getInitialURLSpy = jest.spyOn(Linking, 'getInitialURL');
    // The prod hub/run Linking effect surfaces an Alert on invalid links.
    // Benchmark URLs are invalid hub links, so silence the Alert here.
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    // Default: __E2E__ is true via jest/setup.ts; individual tests flip
    // it to false to assert the gate.
    (global as any).__E2E__ = true;
  });

  afterEach(() => {
    getInitialURLSpy.mockRestore();
    alertSpy.mockRestore();
  });

  it('navigates to BenchmarkRunner with autostart:false for the bare bench URL on cold launch', async () => {
    getInitialURLSpy.mockResolvedValue('pocketpal://e2e/benchmark');

    renderHook(() => useDeepLinking());

    // Flush the microtask queue so the .then() in the effect fires.
    await Promise.resolve();
    await Promise.resolve();

    // Both the __E2E__ benchmark effect and the always-on prod hub/run effect
    // read getInitialURL on cold launch.
    expect(getInitialURLSpy).toHaveBeenCalledTimes(2);
    // Bare URL still routes; autostart resolves false so the screen stays
    // idle and waits for a tap — current behaviour preserved.
    expect(mockNavigate).toHaveBeenCalledWith(ROUTES.BENCHMARK_RUNNER, {
      autostart: false,
    });
  });

  it('navigates with autostart:true for the autostart bench URL on cold launch', async () => {
    getInitialURLSpy.mockResolvedValue('pocketpal://e2e/benchmark?autostart=1');

    renderHook(() => useDeepLinking());

    await Promise.resolve();
    await Promise.resolve();

    expect(mockNavigate).toHaveBeenCalledWith(ROUTES.BENCHMARK_RUNNER, {
      autostart: true,
    });
  });

  it('does NOT navigate when __E2E__=false (cold-launch effect short-circuits)', async () => {
    (global as any).__E2E__ = false;
    getInitialURLSpy.mockResolvedValue('pocketpal://e2e/benchmark');

    renderHook(() => useDeepLinking());

    await Promise.resolve();
    await Promise.resolve();

    // The benchmark effect's `if (!__E2E__) return;` guard keeps it from
    // navigating. The prod hub/run effect still reads getInitialURL, but a
    // benchmark URL is not a valid hub link, so it never navigates.
    expect(getInitialURLSpy).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does NOT navigate when getInitialURL returns null (regular launch)', async () => {
    getInitialURLSpy.mockResolvedValue(null);

    renderHook(() => useDeepLinking());

    await Promise.resolve();
    await Promise.resolve();

    // Both the benchmark and prod hub/run effects read getInitialURL.
    expect(getInitialURLSpy).toHaveBeenCalledTimes(2);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does NOT navigate when getInitialURL returns an unrelated URL', async () => {
    getInitialURLSpy.mockResolvedValue('pocketpal://chat?palId=foo');

    renderHook(() => useDeepLinking());

    await Promise.resolve();
    await Promise.resolve();

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('swallows getInitialURL rejections without navigating', async () => {
    getInitialURLSpy.mockRejectedValue(new Error('linking unavailable'));

    expect(() => renderHook(() => useDeepLinking())).not.toThrow();

    await Promise.resolve();
    await Promise.resolve();

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('navigates on warm-state url events (WDIO deepLink path)', async () => {
    // Cold launch returns null — this app start was a regular launch.
    getInitialURLSpy.mockResolvedValue(null);

    // Both the benchmark and prod hub/run effects register a 'url' listener;
    // capture all of them and fire each so the benchmark handler is exercised.
    const handlers: Array<(evt: {url: string}) => void> = [];
    const removeSpy = jest.fn();
    const addEventListenerSpy = jest
      .spyOn(Linking, 'addEventListener')
      .mockImplementation((event: string, cb: any) => {
        if (event === 'url') {
          handlers.push(cb);
        }
        return {remove: removeSpy} as any;
      });

    renderHook(() => useDeepLinking());
    await Promise.resolve();
    await Promise.resolve();

    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'url',
      expect.any(Function),
    );
    expect(mockNavigate).not.toHaveBeenCalled(); // no cold-launch URL

    // Simulate WDIO firing `mobile: deepLink` after the app started.
    expect(handlers.length).toBeGreaterThan(0);
    handlers.forEach(h => h({url: 'pocketpal://e2e/benchmark'}));
    expect(mockNavigate).toHaveBeenCalledWith(ROUTES.BENCHMARK_RUNNER, {
      autostart: false,
    });

    addEventListenerSpy.mockRestore();
  });

  it('navigates with autostart:true on a warm-state autostart url event', async () => {
    getInitialURLSpy.mockResolvedValue(null);

    const handlers: Array<(evt: {url: string}) => void> = [];
    const addEventListenerSpy = jest
      .spyOn(Linking, 'addEventListener')
      .mockImplementation((event: string, cb: any) => {
        if (event === 'url') {
          handlers.push(cb);
        }
        return {remove: jest.fn()} as any;
      });

    renderHook(() => useDeepLinking());
    await Promise.resolve();
    await Promise.resolve();

    expect(handlers.length).toBeGreaterThan(0);
    handlers.forEach(h => h({url: 'pocketpal://e2e/benchmark?autostart=1'}));
    expect(mockNavigate).toHaveBeenCalledWith(ROUTES.BENCHMARK_RUNNER, {
      autostart: true,
    });

    addEventListenerSpy.mockRestore();
  });

  it('navigates with autostart:false for autostart=0 on a warm-state url event', async () => {
    getInitialURLSpy.mockResolvedValue(null);

    const handlers: Array<(evt: {url: string}) => void> = [];
    const addEventListenerSpy = jest
      .spyOn(Linking, 'addEventListener')
      .mockImplementation((event: string, cb: any) => {
        if (event === 'url') {
          handlers.push(cb);
        }
        return {remove: jest.fn()} as any;
      });

    renderHook(() => useDeepLinking());
    await Promise.resolve();
    await Promise.resolve();

    expect(handlers.length).toBeGreaterThan(0);
    handlers.forEach(h => h({url: 'pocketpal://e2e/benchmark?autostart=0'}));
    expect(mockNavigate).toHaveBeenCalledWith(ROUTES.BENCHMARK_RUNNER, {
      autostart: false,
    });

    addEventListenerSpy.mockRestore();
  });

  it('removes the warm-state url listener on unmount', async () => {
    getInitialURLSpy.mockResolvedValue(null);
    const removeSpy = jest.fn();
    const addEventListenerSpy = jest
      .spyOn(Linking, 'addEventListener')
      .mockImplementation(() => ({remove: removeSpy}) as any);

    const {unmount} = renderHook(() => useDeepLinking());
    await Promise.resolve();
    unmount();

    // Both the benchmark and prod hub/run 'url' listeners are removed.
    expect(removeSpy).toHaveBeenCalledTimes(2);
    addEventListenerSpy.mockRestore();
  });

  it('still registers the prod hub/run url listener when __E2E__=false', async () => {
    (global as any).__E2E__ = false;
    getInitialURLSpy.mockResolvedValue(null);
    const addEventListenerSpy = jest
      .spyOn(Linking, 'addEventListener')
      .mockImplementation(() => ({remove: jest.fn()}) as any);

    renderHook(() => useDeepLinking());
    await Promise.resolve();

    // The benchmark listener is gated off, but the prod hub/run effect is
    // always on, so a 'url' listener is still registered.
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'url',
      expect.any(Function),
    );
    expect(addEventListenerSpy).toHaveBeenCalledTimes(1);
    addEventListenerSpy.mockRestore();
  });

  it('contains a synchronous addEventListener throw without breaking the hook lifecycle', async () => {
    getInitialURLSpy.mockResolvedValue(null);
    const addEventListenerSpy = jest
      .spyOn(Linking, 'addEventListener')
      .mockImplementation(() => {
        throw new Error('native-bridge-blew-up');
      });

    // The hook must still mount and unmount without surfacing the throw.
    const {unmount} = renderHook(() => useDeepLinking());
    await Promise.resolve();
    expect(() => unmount()).not.toThrow();

    addEventListenerSpy.mockRestore();
  });
});
