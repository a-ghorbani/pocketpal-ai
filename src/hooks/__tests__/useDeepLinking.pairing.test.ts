/**
 * useDeepLinking — `llama://` pairing dispatch and the scheme gates.
 *
 * Registering `llama` on both platforms means a `llama://hub/run` or
 * `llama://chat` payload can now be delivered to us. These tests pin that it
 * reaches neither route, on the dispatcher path and on the raw-`Linking` path,
 * which never enters the dispatcher at all.
 */

import {Alert, Linking} from 'react-native';
import {renderHook} from '@testing-library/react-native';

import {useDeepLinking} from '../useDeepLinking';
import {deepLinkStore} from '../../store';
import {ROUTES} from '../../utils/navigationConstants';

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

/** What the native emitter builds for a raw url, as DeepLinkService does. */
const emitterParams = (url: string) => {
  const parsed = new URL(url);
  const queryParams: Record<string, string> = {};
  parsed.searchParams.forEach((value, key) => {
    queryParams[key] = value;
  });
  return {
    url,
    scheme: parsed.protocol.replace(':', ''),
    host: parsed.hostname,
    queryParams,
  };
};

describe('useDeepLinking — llama:// pairing', () => {
  let getInitialURLSpy: jest.SpyInstance;
  let addEventListenerSpy: jest.SpyInstance;
  let alertSpy: jest.SpyInstance;
  let warmListeners: Array<(event: {url: string}) => void>;

  beforeEach(() => {
    jest.clearAllMocks();
    registeredHandler = undefined;
    warmListeners = [];
    deepLinkStore.pendingPairing = null;
    deepLinkStore.pendingHubRun = null;
    // jest/setup.ts defaults this to true for every test; without the
    // override the dispatcher runs its automation branch and the prod gate
    // below is never the code under test.
    (global as any).__E2E__ = false;
    getInitialURLSpy = jest
      .spyOn(Linking, 'getInitialURL')
      .mockResolvedValue(null);
    addEventListenerSpy = jest
      .spyOn(Linking, 'addEventListener')
      .mockImplementation((_event: any, handler: any) => {
        warmListeners.push(handler);
        return {remove: jest.fn()} as any;
      });
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    getInitialURLSpy.mockRestore();
    addEventListenerSpy.mockRestore();
    alertSpy.mockRestore();
    (global as any).__E2E__ = true;
  });

  const deliverWarm = (url: string) => {
    warmListeners.forEach(handler => handler({url}));
  };

  describe('the dispatcher path', () => {
    it('parks a pairing link and goes to the screen that hosts the sheet', () => {
      renderHook(() => useDeepLinking());

      registeredHandler!(
        emitterParams(
          'llama://add-server?url=http%3A%2F%2F100.101.102.103%3A9931&key=sk-x',
        ),
      );

      expect(deepLinkStore.setPendingPairing).toHaveBeenCalledWith({
        url: 'http://100.101.102.103:9931/',
        apiKey: 'sk-x',
        name: undefined,
      });
      expect(mockNavigate).toHaveBeenCalledWith(ROUTES.MODELS);
      expect(deepLinkStore.setPendingHubRun).not.toHaveBeenCalled();
    });

    it('routes llama://hub/run to neither the hub branch nor the pairing store', () => {
      renderHook(() => useDeepLinking());

      registeredHandler!(emitterParams('llama://hub/run?repo_id=a/b'));

      expect(deepLinkStore.setPendingHubRun).not.toHaveBeenCalled();
      expect(deepLinkStore.setPendingPairing).not.toHaveBeenCalled();
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it('routes llama://chat to neither the chat branch nor a prefilled draft', () => {
      renderHook(() => useDeepLinking());

      registeredHandler!(
        emitterParams('llama://chat?palId=p1&message=attacker%20text'),
      );

      expect(mockNavigate).not.toHaveBeenCalled();
      expect(deepLinkStore.setPendingMessage).not.toHaveBeenCalled();
      expect(deepLinkStore.setPendingPairing).not.toHaveBeenCalled();
    });

    it('still routes pocketpal://hub/run as it does today', () => {
      renderHook(() => useDeepLinking());

      registeredHandler!(emitterParams('pocketpal://hub/run?repo_id=a/b'));

      expect(deepLinkStore.setPendingHubRun).toHaveBeenCalledWith({
        repoId: 'a/b',
        filename: undefined,
        source: undefined,
      });
    });

    it('ignores a scheme it does not route', () => {
      renderHook(() => useDeepLinking());

      registeredHandler!(emitterParams('otherapp://hub/run?repo_id=a/b'));

      expect(deepLinkStore.setPendingHubRun).not.toHaveBeenCalled();
      expect(deepLinkStore.setPendingPairing).not.toHaveBeenCalled();
    });
  });

  describe('the raw Linking path, which never enters the dispatcher', () => {
    it('parks a warm pairing link and goes to the same screen', () => {
      renderHook(() => useDeepLinking());

      deliverWarm('llama://192.168.1.5:9931');

      expect(deepLinkStore.setPendingPairing).toHaveBeenCalledWith({
        url: 'http://192.168.1.5:9931',
      });
      expect(mockNavigate).toHaveBeenCalledWith(ROUTES.MODELS);
    });

    it('does not let llama://hub/run through isHubLink', () => {
      renderHook(() => useDeepLinking());

      deliverWarm('llama://hub/run?repo_id=a/b');

      expect(deepLinkStore.setPendingHubRun).not.toHaveBeenCalled();
    });

    it('ignores an unrecognised link without alerting or navigating', () => {
      renderHook(() => useDeepLinking());

      deliverWarm('llama://');

      expect(deepLinkStore.setPendingPairing).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it('parks a cold pairing link', async () => {
      getInitialURLSpy.mockResolvedValue('llama://192.168.1.5:9931');

      renderHook(() => useDeepLinking());
      await Promise.resolve();
      await Promise.resolve();

      expect(deepLinkStore.setPendingPairing).toHaveBeenCalledWith({
        url: 'http://192.168.1.5:9931',
      });
    });
  });

  it('lets a second link overwrite the parked one', () => {
    renderHook(() => useDeepLinking());

    deliverWarm('llama://192.168.1.5:9931');
    deliverWarm('llama://192.168.1.6:9931');

    expect(deepLinkStore.pendingPairing).toEqual({
      url: 'http://192.168.1.6:9931',
    });
  });
});
