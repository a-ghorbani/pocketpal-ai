import React from 'react';
import {runInAction} from 'mobx';

import {render, fireEvent, waitFor} from '../../../../jest/test-utils';
import {serverStore} from '../../../store';
import {ServerConfigSheet} from '../ServerConfigSheet';

// Mock the Sheet component following the HFTokenSheet test pattern
jest.mock('../../Sheet', () => {
  const {View, Button} = require('react-native');
  const MockSheet = ({
    children,
    isVisible,
    onClose,
    title,
  }: {
    children: React.ReactNode;
    isVisible: boolean;
    onClose: () => void;
    title: string;
  }) => {
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
  MockSheet.ScrollView = ({children}: {children: React.ReactNode}) => (
    <View testID="sheet-scroll-view">{children}</View>
  );
  MockSheet.Actions = ({children}: {children: React.ReactNode}) => (
    <View testID="sheet-actions">{children}</View>
  );
  return {Sheet: MockSheet};
});

// Mock the TextInput component
jest.mock('../../TextInput', () => {
  const {TextInput} = require('react-native');
  return {
    TextInput: (props: any) => <TextInput {...props} />,
  };
});

// Mock the icon imports
jest.mock('../../../assets/icons', () => ({
  EyeIcon: () => null,
  EyeOffIcon: () => null,
}));

// Mock the dynamic import used for testConnection
jest.mock('../../../api/openai', () => ({
  testConnection: jest.fn().mockResolvedValue({ok: true, modelCount: 5}),
}));

describe('ServerConfigSheet', () => {
  const defaultProps = {
    isVisible: true,
    onDismiss: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    runInAction(() => {
      serverStore.privacyNoticeAcknowledged = false;
    });
  });

  it('renders when visible', () => {
    const {getByTestId} = render(<ServerConfigSheet {...defaultProps} />);
    expect(getByTestId('sheet')).toBeTruthy();
  });

  it('does not render when not visible', () => {
    const {queryByTestId} = render(
      <ServerConfigSheet {...defaultProps} isVisible={false} />,
    );
    expect(queryByTestId('sheet')).toBeNull();
  });

  it('renders input fields for name, URL, and API key', () => {
    const {getByTestId} = render(<ServerConfigSheet {...defaultProps} />);

    expect(getByTestId('server-name-input')).toBeTruthy();
    expect(getByTestId('server-url-input')).toBeTruthy();
    expect(getByTestId('server-apikey-input')).toBeTruthy();
  });

  it('renders save and test buttons', () => {
    const {getByTestId} = render(<ServerConfigSheet {...defaultProps} />);

    expect(getByTestId('server-save-button')).toBeTruthy();
    expect(getByTestId('server-test-button')).toBeTruthy();
  });

  it('shows privacy notice when not acknowledged and in add mode', () => {
    runInAction(() => {
      serverStore.privacyNoticeAcknowledged = false;
    });

    const {queryByText} = render(<ServerConfigSheet {...defaultProps} />);

    // The privacy notice text should be visible
    // The l10n mock provides the raw key text
    expect(
      queryByText(/Messages sent to remote servers|remotePrivacyNotice/i),
    ).toBeTruthy();
  });

  it('hides privacy notice when already acknowledged', () => {
    runInAction(() => {
      serverStore.privacyNoticeAcknowledged = true;
    });

    const {queryByText} = render(<ServerConfigSheet {...defaultProps} />);

    // Privacy notice should not appear
    expect(queryByText(/Messages sent to remote servers/)).toBeNull();
  });

  it('calls addServer on save with valid input', async () => {
    (serverStore.addServer as jest.Mock).mockReturnValue('new-server-id');

    const {getByTestId} = render(<ServerConfigSheet {...defaultProps} />);

    const nameInput = getByTestId('server-name-input');
    const urlInput = getByTestId('server-url-input');

    fireEvent.changeText(nameInput, 'My Server');
    fireEvent.changeText(urlInput, 'http://localhost:1234');

    const saveButton = getByTestId('server-save-button');
    fireEvent.press(saveButton);

    await waitFor(() => {
      expect(serverStore.addServer).toHaveBeenCalledWith({
        name: 'My Server',
        url: 'http://localhost:1234',
        isActive: true,
      });
    });
  });

  it('calls onDismiss after successful save', async () => {
    (serverStore.addServer as jest.Mock).mockReturnValue('new-server-id');

    const {getByTestId} = render(<ServerConfigSheet {...defaultProps} />);

    fireEvent.changeText(getByTestId('server-name-input'), 'Server');
    fireEvent.changeText(
      getByTestId('server-url-input'),
      'http://localhost:1234',
    );

    fireEvent.press(getByTestId('server-save-button'));

    await waitFor(() => {
      expect(defaultProps.onDismiss).toHaveBeenCalled();
    });
  });

  it('saves API key when provided', async () => {
    (serverStore.addServer as jest.Mock).mockReturnValue('new-server-id');

    const {getByTestId} = render(<ServerConfigSheet {...defaultProps} />);

    fireEvent.changeText(getByTestId('server-name-input'), 'Server');
    fireEvent.changeText(
      getByTestId('server-url-input'),
      'http://localhost:1234',
    );
    fireEvent.changeText(getByTestId('server-apikey-input'), 'sk-test-key');

    fireEvent.press(getByTestId('server-save-button'));

    await waitFor(() => {
      expect(serverStore.setApiKey).toHaveBeenCalledWith(
        'new-server-id',
        'sk-test-key',
      );
    });
  });

  it('pre-fills fields in edit mode', () => {
    const existingServer = {
      id: 'server-1',
      name: 'Existing Server',
      url: 'http://192.168.1.100:1234',
      isActive: true,
    };

    const {getByTestId} = render(
      <ServerConfigSheet {...defaultProps} server={existingServer} />,
    );

    const nameInput = getByTestId('server-name-input');
    const urlInput = getByTestId('server-url-input');

    expect(nameInput.props.defaultValue).toBe('Existing Server');
    expect(urlInput.props.defaultValue).toBe('http://192.168.1.100:1234');
  });

  it('calls updateServer in edit mode', async () => {
    const existingServer = {
      id: 'server-1',
      name: 'Old Name',
      url: 'http://192.168.1.100:1234',
      isActive: true,
    };

    const {getByTestId} = render(
      <ServerConfigSheet {...defaultProps} server={existingServer} />,
    );

    fireEvent.changeText(getByTestId('server-name-input'), 'New Name');

    fireEvent.press(getByTestId('server-save-button'));

    await waitFor(() => {
      expect(serverStore.updateServer).toHaveBeenCalledWith('server-1', {
        name: 'New Name',
        url: 'http://192.168.1.100:1234',
      });
    });
  });

  it('does not show privacy notice in edit mode', () => {
    runInAction(() => {
      serverStore.privacyNoticeAcknowledged = false;
    });

    const existingServer = {
      id: 'server-1',
      name: 'Server',
      url: 'http://localhost:1234',
      isActive: true,
    };

    const {queryByText} = render(
      <ServerConfigSheet {...defaultProps} server={existingServer} />,
    );

    expect(queryByText(/Messages sent to remote servers/)).toBeNull();
  });
});
