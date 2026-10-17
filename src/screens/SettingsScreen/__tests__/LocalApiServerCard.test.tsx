import React from 'react';

import Clipboard from '@react-native-clipboard/clipboard';
import {runInAction} from 'mobx';

import {render, fireEvent, act} from '../../../../jest/test-utils';
import {mockLocalApiServerStore as store} from '../../../../__mocks__/stores/localApiServerStore';
import {mockModelStore} from '../../../../__mocks__/stores/modelStore';

import {LocalApiServerCard} from '../LocalApiServerCard';

const setState = (state: Partial<typeof store>) =>
  runInAction(() => Object.assign(store, state));

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

  it('turns the server on through the store', () => {
    const {getByTestId} = render(<LocalApiServerCard />);
    fireEvent(getByTestId('local-api-server-switch'), 'onValueChange', true);
    expect(store.setEnabled).toHaveBeenCalledWith(true);
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
      baseUrl: 'http://127.0.0.1:8080/v1',
    });
    const {getByText} = render(<LocalApiServerCard />);
    expect(
      getByText(
        'The server is reachable on every network this phone is on: Wi-Fi, mobile data, hotspot and VPN. Set an API key to limit who can use it.',
      ),
    ).toBeTruthy();
    expect(getByText('Not on Wi-Fi, so no network URL is shown.')).toBeTruthy();
  });

  it('says browser pages are refused without a key', () => {
    const {getByText} = render(<LocalApiServerCard />);
    expect(
      getByText(
        'No key: any app that can reach the server can use it. Browser pages are refused until you set a key.',
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

    it('clears the hint on the next edit', () => {
      const {getByTestId, queryByText} = render(<LocalApiServerCard />);
      const input = getByTestId('local-api-server-port-input');
      fireEvent.changeText(input, '80');
      fireEvent(input, 'blur');
      expect(queryByText(HINT)).toBeTruthy();

      fireEvent.changeText(input, '9');
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

  it('sets a key through a dialog and never shows it back', async () => {
    const {getByTestId, queryByText, queryByDisplayValue} = render(
      <LocalApiServerCard />,
    );
    fireEvent.press(getByTestId('local-api-server-key-button'));
    fireEvent.changeText(getByTestId('local-api-server-key-input'), 'secret');
    await act(async () => {
      fireEvent.press(getByTestId('local-api-server-key-save'));
    });

    expect(store.setApiKey).toHaveBeenCalledWith('secret');
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

  it('drops the key draft when the dialog is cancelled', () => {
    const {getByTestId, getByText, queryByDisplayValue} = render(
      <LocalApiServerCard />,
    );
    fireEvent.press(getByTestId('local-api-server-key-button'));
    fireEvent.changeText(getByTestId('local-api-server-key-input'), 'draft');
    fireEvent.press(getByText('Cancel'));
    fireEvent.press(getByTestId('local-api-server-key-button'));

    expect(store.setApiKey).not.toHaveBeenCalled();
    expect(queryByDisplayValue('draft')).toBeNull();
  });
});
