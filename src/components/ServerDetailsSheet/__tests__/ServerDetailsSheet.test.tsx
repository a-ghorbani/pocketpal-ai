import React from 'react';
import {Alert} from 'react-native';
import {render, fireEvent, waitFor} from '../../../../jest/test-utils';
import {ServerDetailsSheet} from '../ServerDetailsSheet';
import {serverStore} from '../../../store';

// Mock the Sheet component following HFTokenSheet test pattern
jest.mock('../../Sheet', () => {
  const {View, Button} = require('react-native');
  const MockSheet = ({children, isVisible, onClose, title}: any) => {
    if (!isVisible) {
      return null;
    }
    return (
      <View testID="sheet">
        <View testID="sheet-title">{title}</View>
        <Button title="Close" onPress={onClose} testID="sheet-close-button" />
        {children}
      </View>
    );
  };
  MockSheet.ScrollView = ({children}: any) => (
    <View testID="sheet-scroll-view">{children}</View>
  );
  MockSheet.Actions = ({children}: any) => (
    <View testID="sheet-actions">{children}</View>
  );
  return {Sheet: MockSheet};
});

// Mock the openai API module
jest.mock('../../../api/openai', () => ({
  testConnection: jest.fn(),
}));

// Mock lodash debounce to execute immediately
jest.mock('lodash/debounce', () => (fn: any) => {
  const debounced = (...args: any[]) => fn(...args);
  debounced.cancel = jest.fn();
  return debounced;
});

describe('ServerDetailsSheet', () => {
  const testServer = {
    id: 'srv-1',
    name: 'LM Studio',
    url: 'http://localhost:1234',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    serverStore.servers = [testServer];
    (serverStore.getApiKey as jest.Mock).mockResolvedValue('sk-test-key');
    (serverStore.getUserSelectedModelsForServer as jest.Mock).mockReturnValue([
      {serverId: 'srv-1', remoteModelId: 'llama-7b'},
      {serverId: 'srv-1', remoteModelId: 'codellama'},
    ]);
  });

  it('renders nothing when not visible', () => {
    const {queryByTestId} = render(
      <ServerDetailsSheet
        isVisible={false}
        onDismiss={jest.fn()}
        serverId="srv-1"
      />,
    );

    expect(queryByTestId('sheet')).toBeNull();
  });

  it('renders nothing when serverId is null', () => {
    const {queryByTestId} = render(
      <ServerDetailsSheet
        isVisible={true}
        onDismiss={jest.fn()}
        serverId={null}
      />,
    );

    expect(queryByTestId('sheet')).toBeNull();
  });

  it('renders server details when visible with valid serverId', async () => {
    const {getByTestId} = render(
      <ServerDetailsSheet
        isVisible={true}
        onDismiss={jest.fn()}
        serverId="srv-1"
      />,
    );

    expect(getByTestId('sheet')).toBeTruthy();
    expect(getByTestId('server-details-url-input')).toBeTruthy();
    expect(getByTestId('server-details-apikey-input')).toBeTruthy();
  });

  it('renders the URL input with server URL', async () => {
    const {getByTestId} = render(
      <ServerDetailsSheet
        isVisible={true}
        onDismiss={jest.fn()}
        serverId="srv-1"
      />,
    );

    const urlInput = getByTestId('server-details-url-input');
    expect(urlInput.props.defaultValue).toBe('http://localhost:1234');
  });

  it('renders the save button', () => {
    const {getByTestId} = render(
      <ServerDetailsSheet
        isVisible={true}
        onDismiss={jest.fn()}
        serverId="srv-1"
      />,
    );

    expect(getByTestId('save-server-button')).toBeTruthy();
  });

  it('renders the remove server button', () => {
    const {getByTestId} = render(
      <ServerDetailsSheet
        isVisible={true}
        onDismiss={jest.fn()}
        serverId="srv-1"
      />,
    );

    expect(getByTestId('remove-server-button')).toBeTruthy();
  });

  it('displays models using this server', () => {
    const {getByText} = render(
      <ServerDetailsSheet
        isVisible={true}
        onDismiss={jest.fn()}
        serverId="srv-1"
      />,
    );

    expect(getByText('llama-7b')).toBeTruthy();
    expect(getByText('codellama')).toBeTruthy();
  });

  it('shows confirmation dialog when remove server is pressed', () => {
    jest.spyOn(Alert, 'alert').mockImplementation();

    const {getByTestId} = render(
      <ServerDetailsSheet
        isVisible={true}
        onDismiss={jest.fn()}
        serverId="srv-1"
      />,
    );

    fireEvent.press(getByTestId('remove-server-button'));

    expect(Alert.alert).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('LM Studio'),
      expect.arrayContaining([
        expect.objectContaining({style: 'cancel'}),
        expect.objectContaining({style: 'destructive'}),
      ]),
    );
  });

  it('calls removeServer and dismisses on delete confirmation', () => {
    const mockDismiss = jest.fn();
    (Alert.alert as jest.Mock) = jest
      .fn()
      .mockImplementation((title, message, buttons) => {
        const destructiveButton = buttons.find(
          (b: any) => b.style === 'destructive',
        );
        destructiveButton?.onPress();
      });

    const {getByTestId} = render(
      <ServerDetailsSheet
        isVisible={true}
        onDismiss={mockDismiss}
        serverId="srv-1"
      />,
    );

    fireEvent.press(getByTestId('remove-server-button'));

    expect(serverStore.removeServer).toHaveBeenCalledWith('srv-1');
    expect(mockDismiss).toHaveBeenCalled();
  });

  it('calls updateServer and setApiKey on save', async () => {
    const mockDismiss = jest.fn();

    const {getByTestId} = render(
      <ServerDetailsSheet
        isVisible={true}
        onDismiss={mockDismiss}
        serverId="srv-1"
      />,
    );

    // Change URL
    fireEvent.changeText(
      getByTestId('server-details-url-input'),
      'http://localhost:5678',
    );

    // Change API key
    fireEvent.changeText(
      getByTestId('server-details-apikey-input'),
      'sk-new-key',
    );

    // Save
    fireEvent.press(getByTestId('save-server-button'));

    await waitFor(() => {
      expect(serverStore.updateServer).toHaveBeenCalledWith('srv-1', {
        url: 'http://localhost:5678',
      });
      expect(serverStore.setApiKey).toHaveBeenCalledWith('srv-1', 'sk-new-key');
      expect(mockDismiss).toHaveBeenCalled();
    });
  });
});
