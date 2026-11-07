import React from 'react';

import Clipboard from '@react-native-clipboard/clipboard';
import {runInAction} from 'mobx';
import {Keyboard} from 'react-native';

import {render, fireEvent, act} from '../../../../jest/test-utils';
import {mockLocalApiServerStore as store} from '../../../../__mocks__/stores/localApiServerStore';
import {mockModelStore} from '../../../../__mocks__/stores/modelStore';
import {mockPurchaseStore} from '../../../../__mocks__/stores/purchaseStore';
import {openPlus} from '../../../services/plus/gate';

import {LocalApiServerCard} from '../LocalApiServerCard';

jest.mock('../../../services/plus/gate', () => ({
  ...jest.requireActual('../../../services/plus/gate'),
  openPlus: jest.fn(),
}));

const mockSheetProps: any[] = [];

jest.mock('../../../components/Sheet/Sheet', () => {
  const {Pressable, View} = require('react-native');
  const MockSheet = (props: any) => {
    mockSheetProps.push(props);
    const {children, isVisible, title, onClose} = props;
    if (!isVisible) {
      return null;
    }
    return (
      <View testID="sheet">
        <View testID="sheet-title">{title}</View>
        <Pressable testID="sheet-close" onPress={onClose} />
        {children}
      </View>
    );
  };
  MockSheet.ScrollView = ({children}: any) => <View>{children}</View>;
  MockSheet.View = ({children, testID}: any) => (
    <View testID={testID}>{children}</View>
  );
  MockSheet.Actions = ({children}: any) => <View>{children}</View>;
  return {Sheet: MockSheet};
});

const setState = (state: Partial<typeof store>) =>
  runInAction(() => Object.assign(store, state));

const setPlusUnlocked = (unlocked: boolean) =>
  runInAction(() => {
    mockPurchaseStore.plusUnlocked = unlocked;
  });

describe('LocalApiServerCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setState({
      enabled: false,
      status: 'stopped',
      lastError: undefined,
      port: 8080,
      lanEnabled: false,
      hasApiKey: false,
      lanAddress: undefined,
      baseUrl: undefined,
      servedModelId: undefined,
    });
    setPlusUnlocked(true);
  });

  afterEach(() => {
    setPlusUnlocked(false);
  });

  it('renders the stopped state with editable config', () => {
    const {getByTestId, queryByTestId} = render(<LocalApiServerCard />);
    expect(getByTestId('local-api-server-card')).toBeTruthy();
    expect(getByTestId('local-api-server-switch').props.value).toBe(false);
    expect(getByTestId('local-api-server-port-input').props.value).toBe('8080');
    expect(getByTestId('local-api-server-port-input').props.editable).not.toBe(
      false,
    );
    expect(queryByTestId('local-api-server-url')).toBeNull();
    expect(queryByTestId('local-api-server-error')).toBeNull();
  });

  it('shows progress and locks config while starting', () => {
    setState({enabled: true, status: 'starting'});
    const {getByText, getByTestId} = render(<LocalApiServerCard />);
    expect(getByText('Starting…')).toBeTruthy();
    expect(getByTestId('local-api-server-port-input').props.editable).toBe(
      false,
    );
    expect(
      getByText('Turn the server off to change these settings.'),
    ).toBeTruthy();
  });

  it('shows the URL and served model while running, and copies the URL', () => {
    setState({
      enabled: true,
      status: 'running',
      baseUrl: 'http://127.0.0.1:8080/v1',
      servedModelId: mockModelStore.models[0].id,
    });
    mockModelStore.activeModelId = mockModelStore.models[0].id;
    const {getByTestId, getByText} = render(<LocalApiServerCard />);

    expect(getByTestId('local-api-server-url').props.children).toBe(
      'http://127.0.0.1:8080/v1',
    );
    expect(getByText(`Serving ${mockModelStore.models[0].name}`)).toBeTruthy();
    fireEvent.press(getByText('Copy URL'));
    expect(Clipboard.setString).toHaveBeenCalledWith(
      'http://127.0.0.1:8080/v1',
    );
    mockModelStore.activeModelId = undefined;
  });

  it('says when no model is served', () => {
    setState({
      enabled: true,
      status: 'running',
      baseUrl: 'http://127.0.0.1:8080/v1',
    });
    const {getByText} = render(<LocalApiServerCard />);
    expect(
      getByText('No model loaded. Requests fail until you load one.'),
    ).toBeTruthy();
  });

  it('warns about the network and a missing Wi-Fi address', () => {
    setState({
      enabled: true,
      status: 'running',
      lanEnabled: true,
      lanAddress: undefined,
      baseUrl: 'http://127.0.0.1:8080/v1',
    });
    const {getByText, getByTestId} = render(<LocalApiServerCard />);
    expect(getByTestId('local-api-server-url').props.children).toBe(
      'http://127.0.0.1:8080/v1',
    );
    expect(
      getByText(
        'The server is reachable on every network this phone is on: Wi-Fi, mobile data, hotspot and VPN. Set an API key to limit who can use it.',
      ),
    ).toBeTruthy();
    expect(getByText('Not on Wi-Fi, so no network URL is shown.')).toBeTruthy();
  });

  it('shows the Wi-Fi URL without the not-on-Wi-Fi note when an address is known', () => {
    setState({
      enabled: true,
      status: 'running',
      lanEnabled: true,
      lanAddress: '192.168.1.23',
      baseUrl: 'http://192.168.1.23:8080/v1',
    });
    const {getByTestId, queryByText} = render(<LocalApiServerCard />);
    expect(getByTestId('local-api-server-url').props.children).toBe(
      'http://192.168.1.23:8080/v1',
    );
    expect(queryByText('Not on Wi-Fi, so no network URL is shown.')).toBeNull();
  });

  it('says any app but a browser page can use a server without a key', () => {
    const {getByText} = render(<LocalApiServerCard />);
    expect(
      getByText(
        'No key: any app that can reach the server can use it, except browser pages.',
      ),
    ).toBeTruthy();
  });

  it.each([
    [
      'port_in_use',
      'Port 8080 is already in use. Turn the server off and choose another port.',
    ],
    [
      'listen_failed',
      'The server could not start. Turn it off and on again, or choose another port.',
    ],
    [
      'stopped_listening',
      'The server stopped unexpectedly. Turn it off and on again.',
    ],
    [
      'key_unavailable',
      'Could not read the API key. Unlock your phone, then turn the server off and on again.',
    ],
  ] as const)('explains the %s failure', (lastError, message) => {
    setState({enabled: true, status: 'failed', lastError});
    const {getByTestId, queryByTestId} = render(<LocalApiServerCard />);
    expect(getByTestId('local-api-server-error').props.children).toBe(message);
    expect(queryByTestId('local-api-server-url')).toBeNull();
  });

  it('commits a valid port on blur and flags an invalid one', () => {
    const {getByTestId, getByText, queryByText} = render(
      <LocalApiServerCard />,
    );
    const input = getByTestId('local-api-server-port-input');
    fireEvent.changeText(input, '80');
    fireEvent(input, 'blur');
    expect(getByText('Use a port from 1024 to 65535')).toBeTruthy();
    expect(store.port).toBe(8080);

    fireEvent.changeText(input, '9090');
    fireEvent(input, 'blur');
    expect(store.setPort).toHaveBeenLastCalledWith(9090);
    expect(store.port).toBe(9090);
    expect(queryByText('Use a port from 1024 to 65535')).toBeNull();
  });

  it('follows the stored port and drops the port hint once the server starts', () => {
    const {getByTestId, getByText, queryByText} = render(
      <LocalApiServerCard />,
    );
    act(() => setState({port: 9090}));
    expect(getByTestId('local-api-server-port-input').props.value).toBe('9090');

    const input = getByTestId('local-api-server-port-input');
    fireEvent.changeText(input, '80');
    fireEvent(input, 'blur');
    expect(getByText('Use a port from 1024 to 65535')).toBeTruthy();

    act(() => setState({enabled: true, status: 'starting'}));
    expect(queryByText('Use a port from 1024 to 65535')).toBeNull();
  });

  describe('a typed port that was never blurred', () => {
    const HINT = 'Use a port from 1024 to 65535';

    it('is committed before the server starts', () => {
      const {getByTestId, queryByText} = render(<LocalApiServerCard />);
      fireEvent.changeText(getByTestId('local-api-server-port-input'), '9090');
      fireEvent(getByTestId('local-api-server-switch'), 'onValueChange', true);

      expect(store.setPort).toHaveBeenCalledWith(9090);
      expect(store.port).toBe(9090);
      expect(store.setEnabled).toHaveBeenCalledWith(true);
      expect(store.setPort.mock.invocationCallOrder[0]).toBeLessThan(
        store.setEnabled.mock.invocationCallOrder[0],
      );
      expect(queryByText(HINT)).toBeNull();
    });

    it('blocks the start when out of range', () => {
      const {getByTestId, getByText} = render(<LocalApiServerCard />);
      const input = getByTestId('local-api-server-port-input');
      fireEvent.changeText(input, '80');
      fireEvent(getByTestId('local-api-server-switch'), 'onValueChange', true);

      expect(store.setEnabled).not.toHaveBeenCalled();
      expect(getByTestId('local-api-server-switch').props.value).toBe(false);
      expect(input.props.value).toBe('8080');
      expect(getByText(HINT)).toBeTruthy();
    });

    it('is dropped without a hint when the server starts elsewhere', () => {
      const {getByTestId, queryByText} = render(<LocalApiServerCard />);
      const input = getByTestId('local-api-server-port-input');
      fireEvent.changeText(input, '9091');
      act(() => setState({enabled: true, status: 'starting'}));
      fireEvent(input, 'blur');

      expect(store.port).toBe(8080);
      expect(store.setPort).not.toHaveBeenCalled();
      expect(getByTestId('local-api-server-port-input').props.value).toBe(
        '8080',
      );
      expect(queryByText(HINT)).toBeNull();
    });
  });

  it('sets the LAN switch through the store', () => {
    const {getByTestId} = render(<LocalApiServerCard />);
    fireEvent(
      getByTestId('local-api-server-lan-switch'),
      'onValueChange',
      true,
    );
    expect(store.setLanEnabled).toHaveBeenCalledWith(true);
  });

  it('sets a key through a sheet and never shows it back', async () => {
    const {getByTestId, queryByTestId, queryByText, queryByDisplayValue} =
      render(<LocalApiServerCard />);
    fireEvent.press(getByTestId('local-api-server-key-button'));
    fireEvent.changeText(getByTestId('local-api-server-key-input'), 'secret');
    await act(async () => {
      fireEvent.press(getByTestId('local-api-server-key-save'));
    });

    expect(store.setApiKey).toHaveBeenCalledWith('secret');
    expect(queryByTestId('local-api-server-key-input')).toBeNull();
    expect(queryByText('secret')).toBeNull();
    expect(queryByDisplayValue('secret')).toBeNull();
    expect(queryByText('Requests must send this key')).toBeTruthy();
  });

  it('clears a set key', () => {
    setState({hasApiKey: true});
    const {getByTestId} = render(<LocalApiServerCard />);
    fireEvent.press(getByTestId('local-api-server-key-button'));
    expect(store.clearApiKey).toHaveBeenCalled();
  });

  it('keeps the toggle on and config locked while failed', () => {
    setState({enabled: true, status: 'failed', lastError: 'port_in_use'});
    const {getByTestId} = render(<LocalApiServerCard />);
    expect(getByTestId('local-api-server-switch').props.value).toBe(true);
    expect(getByTestId('local-api-server-port-input').props.editable).toBe(
      false,
    );
    expect(
      getByTestId('local-api-server-lan-switch').props.disabled ??
        getByTestId('local-api-server-lan-switch').props.accessibilityState
          ?.disabled,
    ).toBe(true);
  });

  it.each(['Save', 'Cancel', 'sheet-close'])(
    'clears the draft and dismisses the keyboard when %s closes the sheet',
    async control => {
      const dismiss = jest
        .spyOn(Keyboard, 'dismiss')
        .mockImplementation(() => {});
      const {getByTestId, getByText, queryByTestId} = render(
        <LocalApiServerCard />,
      );
      fireEvent.press(getByTestId('local-api-server-key-button'));
      fireEvent.changeText(getByTestId('local-api-server-key-input'), 'draft');
      await act(async () => {
        fireEvent.press(
          control === 'sheet-close' ? getByTestId(control) : getByText(control),
        );
      });
      expect(queryByTestId('local-api-server-key-input')).toBeNull();
      expect(dismiss).toHaveBeenCalled();
      dismiss.mockRestore();

      act(() => setState({hasApiKey: false}));
      fireEvent.press(getByTestId('local-api-server-key-button'));
      expect(getByTestId('local-api-server-key-input').props.value).toBe('');
    },
  );

  it('opens the key sheet empty and disables Save until a key is typed', () => {
    const {getByTestId} = render(<LocalApiServerCard />);
    fireEvent.press(getByTestId('local-api-server-key-button'));

    expect(getByTestId('local-api-server-key-input').props.value).toBe('');
    const save = getByTestId('local-api-server-key-save');
    expect(save.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(save);
    expect(store.setApiKey).not.toHaveBeenCalled();

    fireEvent.changeText(getByTestId('local-api-server-key-input'), 'k');
    expect(
      getByTestId('local-api-server-key-save').props.accessibilityState
        ?.disabled,
    ).toBe(false);
  });

  it('keeps the sheet open with the draft when saving the key fails', async () => {
    store.setApiKey.mockResolvedValueOnce(false);
    const {getByTestId} = render(<LocalApiServerCard />);
    fireEvent.press(getByTestId('local-api-server-key-button'));
    fireEvent.changeText(getByTestId('local-api-server-key-input'), 'secret');
    await act(async () => {
      fireEvent.press(getByTestId('local-api-server-key-save'));
    });

    expect(store.setApiKey).toHaveBeenCalledWith('secret');
    expect(getByTestId('local-api-server-key-input').props.value).toBe(
      'secret',
    );
  });

  it('opens the key sheet at one of its own snap points', () => {
    const {getByTestId} = render(<LocalApiServerCard />);
    fireEvent.press(getByTestId('local-api-server-key-button'));
    const props = mockSheetProps.filter(({title}) => title === 'API key').pop();
    expect(props.isVisible).toBe(true);
    expect(props.index ?? 0).toBeLessThan(props.snapPoints.length);
  });

  describe('behind Plus', () => {
    const teaserTitle = 'Local API server is a Plus feature';

    beforeEach(() => {
      setPlusUnlocked(false);
    });

    it('shows the Plus badge and hint only while locked', () => {
      const {getByTestId, queryByTestId} = render(<LocalApiServerCard />);
      expect(getByTestId('local-api-server-lock')).toBeTruthy();
      expect(
        getByTestId('local-api-server-switch').props.accessibilityHint,
      ).toBe('Plus feature. Opens details.');

      act(() => setPlusUnlocked(true));
      expect(queryByTestId('local-api-server-lock')).toBeNull();
      expect(
        getByTestId('local-api-server-switch').props.accessibilityHint,
      ).toBeUndefined();
    });

    it('commits a typed port, then opens the teaser instead of enabling', () => {
      const {getByTestId, getByText} = render(<LocalApiServerCard />);
      fireEvent.changeText(getByTestId('local-api-server-port-input'), '9090');
      fireEvent(getByTestId('local-api-server-switch'), 'onValueChange', true);

      expect(store.setPort).toHaveBeenCalledWith(9090);
      expect(store.setEnabled).not.toHaveBeenCalled();
      expect(getByTestId('local-api-server-switch').props.value).toBe(false);
      expect(getByTestId('local-api-server-teaser')).toBeTruthy();
      expect(getByTestId('sheet-title').props.children).toBe(teaserTitle);
      expect(
        getByText('Let other apps use the model loaded on this phone.'),
      ).toBeTruthy();
    });

    it('keeps the port hint and no teaser for an out-of-range port', () => {
      const {getByTestId, getByText, queryByTestId} = render(
        <LocalApiServerCard />,
      );
      fireEvent.changeText(getByTestId('local-api-server-port-input'), '80');
      fireEvent(getByTestId('local-api-server-switch'), 'onValueChange', true);

      expect(getByText('Use a port from 1024 to 65535')).toBeTruthy();
      expect(queryByTestId('local-api-server-teaser')).toBeNull();
      expect(store.setEnabled).not.toHaveBeenCalled();
    });

    it('opens Plus from the teaser and enables once Plus unlocks', () => {
      const {getByTestId, queryByTestId} = render(<LocalApiServerCard />);
      fireEvent(getByTestId('local-api-server-switch'), 'onValueChange', true);
      fireEvent.press(getByTestId('local-api-server-teaser-get-plus'));

      expect(queryByTestId('local-api-server-teaser')).toBeNull();
      expect(openPlus).toHaveBeenCalledTimes(1);
      expect(store.setEnabled).not.toHaveBeenCalled();

      const {onUnlocked} = (openPlus as jest.Mock).mock.calls[0][0];
      onUnlocked();
      expect(store.setEnabled).toHaveBeenCalledWith(true);
    });

    it('closes the teaser on Not now without enabling', () => {
      const {getByTestId, queryByTestId} = render(<LocalApiServerCard />);
      fireEvent(getByTestId('local-api-server-switch'), 'onValueChange', true);
      fireEvent.press(getByTestId('local-api-server-teaser-not-now'));

      expect(queryByTestId('local-api-server-teaser')).toBeNull();
      expect(openPlus).not.toHaveBeenCalled();
      expect(store.setEnabled).not.toHaveBeenCalled();
    });

    it('turns a running server off without the teaser', () => {
      setState({enabled: true, status: 'running'});
      const {getByTestId, queryByTestId} = render(<LocalApiServerCard />);
      fireEvent(getByTestId('local-api-server-switch'), 'onValueChange', false);

      expect(store.setEnabled).toHaveBeenCalledWith(false);
      expect(queryByTestId('local-api-server-teaser')).toBeNull();
    });

    describe('in a build without the store gate', () => {
      beforeEach(() => {
        (global as any).__PLUS_STORE_GATE__ = false;
      });

      afterEach(() => {
        (global as any).__PLUS_STORE_GATE__ = true;
      });

      it('shows no badge or teaser and enables directly', () => {
        const {getByTestId, queryByTestId} = render(<LocalApiServerCard />);
        expect(queryByTestId('local-api-server-lock')).toBeNull();

        fireEvent(
          getByTestId('local-api-server-switch'),
          'onValueChange',
          true,
        );
        expect(queryByTestId('local-api-server-teaser')).toBeNull();
        expect(store.setEnabled).toHaveBeenCalledWith(true);
      });
    });
  });
});
