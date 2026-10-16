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
        'Any device on this network can use your model. Set an API key to limit who can.',
      ),
    ).toBeTruthy();
    expect(
      getByText('Not on Wi-Fi: only apps on this phone can reach the server.'),
    ).toBeTruthy();
  });

  it('shows the failure reason', () => {
    setState({enabled: true, status: 'failed', lastError: 'EADDRINUSE'});
    const {getByTestId, queryByTestId} = render(<LocalApiServerCard />);
    expect(getByTestId('local-api-server-error').props.children).toBe(
      'EADDRINUSE',
    );
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
});
