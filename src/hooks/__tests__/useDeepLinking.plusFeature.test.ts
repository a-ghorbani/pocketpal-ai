import {Alert, Linking} from 'react-native';
import {renderHook} from '@testing-library/react-native';

import {useDeepLinking} from '../useDeepLinking';
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

jest.mock('../../services/DeepLinkService', () => ({
  deepLinkService: {
    initialize: jest.fn(),
    addListener: jest.fn(() => () => {}),
    cleanup: jest.fn(),
  },
}));

const URL = 'pocketpal://e2e/plus-feature';

describe('useDeepLinking — Plus test feature (Android Linking)', () => {
  let getInitialURLSpy: jest.SpyInstance;
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    getInitialURLSpy = jest.spyOn(Linking, 'getInitialURL');
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (global as any).__E2E__ = true;
  });

  afterEach(() => {
    getInitialURLSpy.mockRestore();
    alertSpy.mockRestore();
    (global as any).__E2E__ = true;
  });

  it('navigates on cold launch', async () => {
    getInitialURLSpy.mockResolvedValue(URL);

    renderHook(() => useDeepLinking());
    await Promise.resolve();
    await Promise.resolve();

    expect(mockNavigate).toHaveBeenCalledWith(ROUTES.PLUS_TEST_FEATURE);
  });

  it('navigates on a warm url event', async () => {
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
    handlers.forEach(handler => handler({url: URL}));

    expect(mockNavigate).toHaveBeenCalledWith(ROUTES.PLUS_TEST_FEATURE);
    addEventListenerSpy.mockRestore();
  });

  it('never routes outside e2e builds', async () => {
    (global as any).__E2E__ = false;
    getInitialURLSpy.mockResolvedValue(URL);

    renderHook(() => useDeepLinking());
    await Promise.resolve();
    await Promise.resolve();

    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
