import React from 'react';
import {render, fireEvent, waitFor} from '../../../../jest/test-utils';
import {RemoteModelSheet} from '../RemoteModelSheet';
import {serverStore} from '../../../store';
import {fetchModels, fetchModelsWithHeaders} from '../../../api/openai';

const mockedFetchModels = fetchModels as jest.Mock;
const mockedFetchModelsWithHeaders = fetchModelsWithHeaders as jest.Mock;

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
  fetchModels: jest.fn(),
  fetchModelsWithHeaders: jest
    .fn()
    .mockResolvedValue({models: [], headers: {}}),
  detectServerType: jest.fn().mockResolvedValue(''),
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

  // Manual add path — the in-edit timeout field feeds fetchModelsWithHeaders
  // (NOT the chip path's fetchModels). The field is rendered only after an
  // initial probe attempt surfaces the server fields.
  describe('manual add-path probe feed', () => {
    beforeEach(() => {
      serverStore.servers = [];
    });

    it('renders the timeout input after a probe attempt surfaces server fields', async () => {
      mockedFetchModelsWithHeaders.mockResolvedValue({models: [], headers: {}});

      const {getByTestId} = render(
        <RemoteModelSheet isVisible={true} onDismiss={jest.fn()} />,
      );

      // First probe surfaces the server fields (showServerFields).
      fireEvent.changeText(
        getByTestId('remote-url-input'),
        'http://localhost:1234',
      );

      await waitFor(() => {
        expect(getByTestId('remote-timeout-input')).toBeTruthy();
      });
    });

    it('passes the in-edit timeout field to fetchModelsWithHeaders', async () => {
      mockedFetchModelsWithHeaders.mockResolvedValue({models: [], headers: {}});

      const {getByTestId} = render(
        <RemoteModelSheet isVisible={true} onDismiss={jest.fn()} />,
      );

      // First probe to surface the timeout field.
      fireEvent.changeText(
        getByTestId('remote-url-input'),
        'http://localhost:1234',
      );
      await waitFor(() => {
        expect(getByTestId('remote-timeout-input')).toBeTruthy();
      });

      // Enter the in-edit timeout, then re-probe via another URL change.
      fireEvent.changeText(getByTestId('remote-timeout-input'), '600');
      mockedFetchModelsWithHeaders.mockClear();
      fireEvent.changeText(
        getByTestId('remote-url-input'),
        'http://localhost:5678',
      );

      await waitFor(() => {
        expect(mockedFetchModelsWithHeaders).toHaveBeenCalled();
      });
      // Assert URL (arg 0) and in-edit timeoutMs (arg 2); the chip path's
      // fetchModels must not be used for the manual add probe.
      const call = mockedFetchModelsWithHeaders.mock.calls.at(-1)!;
      expect(call[0]).toBe('http://localhost:5678');
      expect(call[2]).toBe(600000);
      expect(mockedFetchModels).not.toHaveBeenCalled();
    });

    // Adding a model on the new-server path persists the timeout
    // (seconds → ms) through the existing addServer call.
    it('persists the in-edit timeout as ms when adding a new server', async () => {
      mockedFetchModelsWithHeaders.mockResolvedValue({
        models: [{id: 'llama-7b', object: 'model', owned_by: 'system'}],
        headers: {},
      });

      const {getByTestId, getByText} = render(
        <RemoteModelSheet isVisible={true} onDismiss={jest.fn()} />,
      );

      // Probe surfaces the single model (auto-selected) and the timeout field.
      fireEvent.changeText(
        getByTestId('remote-url-input'),
        'http://localhost:1234',
      );
      await waitFor(() => {
        expect(getByTestId('remote-timeout-input')).toBeTruthy();
        expect(getByText('llama-7b')).toBeTruthy();
      });

      fireEvent.changeText(getByTestId('remote-timeout-input'), '600');
      fireEvent.press(getByTestId('add-model-button'));

      await waitFor(() => {
        expect(serverStore.addServer).toHaveBeenCalledWith(
          expect.objectContaining({
            url: 'http://localhost:1234',
            requestTimeoutMs: 600000,
          }),
        );
      });
    });

    it('persists requestTimeoutMs undefined when adding a server with empty timeout', async () => {
      mockedFetchModelsWithHeaders.mockResolvedValue({
        models: [{id: 'llama-7b', object: 'model', owned_by: 'system'}],
        headers: {},
      });

      const {getByTestId, getByText} = render(
        <RemoteModelSheet isVisible={true} onDismiss={jest.fn()} />,
      );

      fireEvent.changeText(
        getByTestId('remote-url-input'),
        'http://localhost:1234',
      );
      await waitFor(() => {
        expect(getByText('llama-7b')).toBeTruthy();
      });

      fireEvent.press(getByTestId('add-model-button'));

      await waitFor(() => {
        expect(serverStore.addServer).toHaveBeenCalledWith(
          expect.objectContaining({requestTimeoutMs: undefined}),
        );
      });
    });
  });

  // Tapping a saved server's chip probes via fetchModels using THAT server's
  // stored requestTimeoutMs (raw), so a saved slow server does not red-X at
  // the 30s default.
  describe('chip-press probe feed', () => {
    it('passes the saved server requestTimeoutMs to fetchModels on chip press', async () => {
      serverStore.servers = [
        {
          id: 'srv-1',
          name: 'Slow Server',
          url: 'http://localhost:1234',
          requestTimeoutMs: 600000,
        },
      ];
      (serverStore.getApiKey as jest.Mock).mockResolvedValue(undefined);
      mockedFetchModels.mockResolvedValueOnce([
        {id: 'llama-7b', object: 'model', owned_by: 'system'},
      ]);

      const {getByTestId} = render(
        <RemoteModelSheet isVisible={true} onDismiss={jest.fn()} />,
      );

      fireEvent.press(getByTestId('server-chip-srv-1'));

      await waitFor(() => {
        expect(mockedFetchModels).toHaveBeenCalledWith(
          'http://localhost:1234',
          undefined,
          600000,
        );
      });
      // The add-path probe must NOT be involved in the chip flow.
      expect(mockedFetchModelsWithHeaders).not.toHaveBeenCalled();
    });

    it('forwards undefined for a saved server without requestTimeoutMs', async () => {
      serverStore.servers = [
        {id: 'srv-1', name: 'Default Server', url: 'http://localhost:1234'},
      ];
      (serverStore.getApiKey as jest.Mock).mockResolvedValue(undefined);
      mockedFetchModels.mockResolvedValueOnce([]);

      const {getByTestId} = render(
        <RemoteModelSheet isVisible={true} onDismiss={jest.fn()} />,
      );

      fireEvent.press(getByTestId('server-chip-srv-1'));

      await waitFor(() => {
        expect(mockedFetchModels).toHaveBeenCalledWith(
          'http://localhost:1234',
          undefined,
          undefined,
        );
      });
    });
  });
});
