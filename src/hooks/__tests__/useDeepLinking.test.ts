/**
 * useDeepLinking — cold-launch routing tests
 *
 * Covers the SHOULD rows from the TASK-20260428-1532 Test Requirements
 * table for the new `__E2E__`-gated `useEffect` that reads
 * `Linking.getInitialURL()` and routes to `BenchmarkRunner` when the
 * launching intent matches `pocketpal://e2e/benchmark`.
 *
 * Notes:
 * - We do NOT cover the existing iOS-only chat-deep-link path here; the
 *   only behavioral delta in this story is the cold-launch effect.
 * - We render via `renderHook` so the hook can subscribe to
 *   `useNavigation()` without a full screen tree.
 */

import {Linking} from 'react-native';
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

  beforeEach(() => {
    jest.clearAllMocks();
    getInitialURLSpy = jest.spyOn(Linking, 'getInitialURL');
    // Default: __E2E__ is true via jest/setup.ts; individual tests flip
    // it to false to assert the gate.
    (global as any).__E2E__ = true;
  });

  afterEach(() => {
    getInitialURLSpy.mockRestore();
  });

  it('navigates to BenchmarkRunner when __E2E__=true and getInitialURL returns the bench URL', async () => {
    getInitialURLSpy.mockResolvedValue('pocketpal://e2e/benchmark');

    renderHook(() => useDeepLinking());

    // Flush the microtask queue so the .then() in the effect fires.
    await Promise.resolve();
    await Promise.resolve();

    expect(getInitialURLSpy).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(ROUTES.BENCHMARK_RUNNER);
  });

  it('does NOT navigate when __E2E__=false (cold-launch effect short-circuits)', async () => {
    (global as any).__E2E__ = false;
    getInitialURLSpy.mockResolvedValue('pocketpal://e2e/benchmark');

    renderHook(() => useDeepLinking());

    await Promise.resolve();
    await Promise.resolve();

    // The effect's `if (!__E2E__) return;` guard means we never even ask
    // for the initial URL when E2E is off.
    expect(getInitialURLSpy).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does NOT navigate when getInitialURL returns null (regular launch)', async () => {
    getInitialURLSpy.mockResolvedValue(null);

    renderHook(() => useDeepLinking());

    await Promise.resolve();
    await Promise.resolve();

    expect(getInitialURLSpy).toHaveBeenCalledTimes(1);
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

    // Capture the listener callback so we can fire it ourselves. Holder
    // object dodges TS's narrowing of a `let` to `null`.
    const captured: {handler: ((evt: {url: string}) => void) | null} = {
      handler: null,
    };
    const removeSpy = jest.fn();
    const addEventListenerSpy = jest
      .spyOn(Linking, 'addEventListener')
      .mockImplementation((event: string, cb: any) => {
        if (event === 'url') {
          captured.handler = cb;
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
    expect(captured.handler).not.toBeNull();
    captured.handler!({url: 'pocketpal://e2e/benchmark'});
    expect(mockNavigate).toHaveBeenCalledWith(ROUTES.BENCHMARK_RUNNER);

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

    expect(removeSpy).toHaveBeenCalledTimes(1);
    addEventListenerSpy.mockRestore();
  });

  it('does NOT register the warm-state listener when __E2E__=false', async () => {
    (global as any).__E2E__ = false;
    const addEventListenerSpy = jest.spyOn(Linking, 'addEventListener');

    renderHook(() => useDeepLinking());
    await Promise.resolve();

    expect(addEventListenerSpy).not.toHaveBeenCalled();
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
