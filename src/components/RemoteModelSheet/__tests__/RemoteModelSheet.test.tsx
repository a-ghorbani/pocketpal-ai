import React from 'react';
import {render, fireEvent, waitFor} from '../../../../jest/test-utils';
import {RemoteModelSheet} from '../RemoteModelSheet';
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
  fetchModels: jest.fn(),
}));

// Mock lodash debounce to execute immediately
jest.mock('lodash/debounce', () => (fn: any) => {
  const debounced = (...args: any[]) => fn(...args);
  debounced.cancel = jest.fn();
  return debounced;
});

describe('RemoteModelSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when not visible', () => {
    const {queryByTestId} = render(
      <RemoteModelSheet isVisible={false} onDismiss={jest.fn()} />,
    );

    expect(queryByTestId('sheet')).toBeNull();
  });

  it('renders the sheet with URL input when visible', () => {
    const {getByTestId} = render(
      <RemoteModelSheet isVisible={true} onDismiss={jest.fn()} />,
    );

    expect(getByTestId('sheet')).toBeTruthy();
    expect(getByTestId('remote-url-input')).toBeTruthy();
  });

  it('renders the Add Model button', () => {
    const {getByTestId} = render(
      <RemoteModelSheet isVisible={true} onDismiss={jest.fn()} />,
    );

    expect(getByTestId('add-model-button')).toBeTruthy();
  });

  it('shows privacy notice when not acknowledged', () => {
    serverStore.privacyNoticeAcknowledged = false;

    const {getByText} = render(
      <RemoteModelSheet isVisible={true} onDismiss={jest.fn()} />,
    );

    // The privacy notice text should be visible
    expect(
      getByText(/Messages sent to remote servers leave your device/i, {
        exact: false,
      }),
    ).toBeTruthy();
  });

  it('hides privacy notice when acknowledged', () => {
    serverStore.privacyNoticeAcknowledged = true;

    const {queryByText} = render(
      <RemoteModelSheet isVisible={true} onDismiss={jest.fn()} />,
    );

    expect(
      queryByText(/Messages sent to remote servers leave your device/i, {
        exact: false,
      }),
    ).toBeNull();
  });

  it('calls onDismiss when sheet close is triggered', () => {
    const mockDismiss = jest.fn();
    const {getByTestId} = render(
      <RemoteModelSheet isVisible={true} onDismiss={mockDismiss} />,
    );

    fireEvent.press(getByTestId('sheet-close-button'));
    expect(mockDismiss).toHaveBeenCalled();
  });

  it('shows server chips when servers exist', () => {
    serverStore.servers = [
      {id: 'srv-1', name: 'LM Studio', url: 'http://localhost:1234'},
    ];

    const {getByText, getByTestId} = render(
      <RemoteModelSheet isVisible={true} onDismiss={jest.fn()} />,
    );

    expect(getByText('LM Studio')).toBeTruthy();
    expect(getByTestId('server-chip-srv-1')).toBeTruthy();
  });

  it('does not show server chips when no servers exist', () => {
    serverStore.servers = [];

    const {queryByText} = render(
      <RemoteModelSheet isVisible={true} onDismiss={jest.fn()} />,
    );

    // The "Your Servers" label should not be present
    expect(queryByText('Your Servers')).toBeNull();
  });

  it('disables Add Model button when no model is selected', () => {
    const {getByTestId} = render(
      <RemoteModelSheet isVisible={true} onDismiss={jest.fn()} />,
    );

    const addButton = getByTestId('add-model-button');
    expect(addButton.props.accessibilityState?.disabled).toBe(true);
  });
});
