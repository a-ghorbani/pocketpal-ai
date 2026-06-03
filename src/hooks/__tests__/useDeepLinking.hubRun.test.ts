/**
 * useDeepLinking — hub/run dispatch.
 *
 * Covers: valid link -> DeepLinkStore.setPendingHubRun; invalid/malformed link
 * -> Alert + NO store write (validation runs before any side effect); and that
 * the iOS native-emitter path (handleDeepLink, host === 'hub') routes to the
 * same handler.
 */

import {Alert, Linking} from 'react-native';
import {renderHook} from '@testing-library/react-native';

import {useDeepLinking} from '../useDeepLinking';
import {deepLinkStore} from '../../store';

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

// Capture the handler registered by the iOS native-emitter path so we can
// simulate a deep link arriving via DeepLinkService.
let registeredHandler: ((params: any) => void) | undefined;

jest.mock('../../services/DeepLinkService', () => ({
  deepLinkService: {
    initialize: jest.fn(),
    addListener: jest.fn((cb: any) => {
      registeredHandler = cb;
      return () => {};
    }),
    cleanup: jest.fn(),
  },
}));

const VALID_URL =
  'pocketpal://hub/run?repo_id=author/model&filename=model.Q4_K_M.gguf&source=hf';

describe('useDeepLinking — hub/run dispatch', () => {
  let getInitialURLSpy: jest.SpyInstance;
  let addEventListenerSpy: jest.SpyInstance;
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    registeredHandler = undefined;
    deepLinkStore.pendingHubRun = null;
    (global as any).__E2E__ = false;
    getInitialURLSpy = jest
      .spyOn(Linking, 'getInitialURL')
      .mockResolvedValue(null);
    addEventListenerSpy = jest
      .spyOn(Linking, 'addEventListener')
      .mockReturnValue({remove: jest.fn()} as any);
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    getInitialURLSpy.mockRestore();
    addEventListenerSpy.mockRestore();
    alertSpy.mockRestore();
  });

  it('parks a valid link in pendingHubRun via the iOS emitter path', async () => {
    renderHook(() => useDeepLinking());
    await Promise.resolve();

    expect(registeredHandler).toBeDefined();
    await registeredHandler!({host: 'hub', url: VALID_URL});

    expect(deepLinkStore.setPendingHubRun).toHaveBeenCalledWith({
      repoId: 'author/model',
      filename: 'model.Q4_K_M.gguf',
      source: 'hf',
    });
    expect(deepLinkStore.pendingHubRun).toEqual({
      repoId: 'author/model',
      filename: 'model.Q4_K_M.gguf',
      source: 'hf',
    });
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('alerts and writes nothing on a malformed link', async () => {
    renderHook(() => useDeepLinking());
    await Promise.resolve();

    await registeredHandler!({
      host: 'hub',
      url: 'pocketpal://hub/run?repo_id=author/model', // no filename
    });

    expect(alertSpy).toHaveBeenCalled();
    expect(deepLinkStore.setPendingHubRun).not.toHaveBeenCalled();
    expect(deepLinkStore.pendingHubRun).toBeNull();
  });

  it('parks a valid link arriving cold via the prod Linking path', async () => {
    getInitialURLSpy.mockResolvedValue(VALID_URL);

    renderHook(() => useDeepLinking());
    await Promise.resolve();
    await Promise.resolve();

    expect(deepLinkStore.setPendingHubRun).toHaveBeenCalledWith(
      expect.objectContaining({
        repoId: 'author/model',
        filename: 'model.Q4_K_M.gguf',
      }),
    );
  });

  it('parks a valid link arriving warm via the prod Linking url event', async () => {
    const handlers: Array<(evt: {url: string}) => void> = [];
    addEventListenerSpy.mockImplementation((event: string, cb: any) => {
      if (event === 'url') {
        handlers.push(cb);
      }
      return {remove: jest.fn()} as any;
    });

    renderHook(() => useDeepLinking());
    await Promise.resolve();

    expect(handlers.length).toBeGreaterThan(0);
    handlers.forEach(h => h({url: VALID_URL}));

    expect(deepLinkStore.setPendingHubRun).toHaveBeenCalledWith(
      expect.objectContaining({repoId: 'author/model'}),
    );
  });

  it('does not write for a non-hub link on the prod Linking path', async () => {
    getInitialURLSpy.mockResolvedValue('pocketpal://chat?palId=foo');

    renderHook(() => useDeepLinking());
    await Promise.resolve();
    await Promise.resolve();

    expect(deepLinkStore.setPendingHubRun).not.toHaveBeenCalled();
  });
});
