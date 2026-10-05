import React from 'react';
import {Alert, StyleSheet} from 'react-native';
import {runInAction} from 'mobx';
import {render, fireEvent, waitFor, within} from '../../../../jest/test-utils';
import {RemoteModelSheet} from '../RemoteModelSheet';
import {l10n} from '../../../locales';
import {modelStore, routerStore, serverStore} from '../../../store';
import {fetchModels, fetchModelsWithHeaders} from '../../../api/openai';
import {detectServerType} from '../../../api/servers/detect';
import {routerModelsBody} from '../../../../jest/fixtures/remoteModelList';
import type {ServerType} from '../../../utils/serverTypes';

const mockedFetchModels = fetchModels as jest.Mock;
const mockedFetchModelsWithHeaders = fetchModelsWithHeaders as jest.Mock;
const mockedDetectServerType = detectServerType as jest.Mock;

const seedChipList = (rows: any[]) =>
  (serverStore.fetchModelsForServer as jest.Mock).mockImplementationOnce(
    async (serverId: string) => {
      serverStore.serverModels.set(serverId, rows);
      return {ok: true};
    },
  );

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
}));

jest.mock('../../../api/servers/detect', () => ({
  detectServerType: jest.fn().mockResolvedValue(undefined),
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

    // The server-type dropdown is seeded by detectServerType (mocked to
    // undefined),
    // so it falls back to 'unknown'. Selecting an override persists through the
    // addServer call.
    it('persists a user-selected serverType when adding a new server', async () => {
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
        expect(getByTestId('server-type-dropdown')).toBeTruthy();
        expect(getByText('llama-7b')).toBeTruthy();
      });

      // Open the dropdown and override the seeded value.
      fireEvent.press(getByTestId('server-type-dropdown'));
      fireEvent.press(getByTestId('server-type-option-Ollama'));
      fireEvent.press(getByTestId('add-model-button'));

      await waitFor(() => {
        expect(serverStore.addServer).toHaveBeenCalledWith(
          expect.objectContaining({serverType: 'Ollama'}),
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

  // A saved server's chip reads its list through the store's own fetch, the
  // one writer of the list; the slow-server timeout is that fetch's to honour.
  describe('chip-press probe feed', () => {
    it('reads the list through the store and renders its rows', async () => {
      serverStore.servers = [
        {
          id: 'srv-1',
          name: 'Slow Server',
          url: 'http://localhost:1234',
          requestTimeoutMs: 600000,
        },
      ];
      (serverStore.getApiKey as jest.Mock).mockResolvedValue(undefined);
      seedChipList([{id: 'llama-7b', object: 'model', owned_by: 'system'}]);

      const {getByTestId, getByText} = render(
        <RemoteModelSheet isVisible={true} onDismiss={jest.fn()} />,
      );

      fireEvent.press(getByTestId('server-chip-srv-1'));

      await waitFor(() => {
        expect(getByText('llama-7b')).toBeTruthy();
      });
      expect(serverStore.fetchModelsForServer).toHaveBeenCalledWith('srv-1');
      expect(mockedFetchModels).not.toHaveBeenCalled();
      expect(mockedFetchModelsWithHeaders).not.toHaveBeenCalled();
    });

    it('shows the failure text of the read unchanged', async () => {
      serverStore.servers = [
        {id: 'srv-1', name: 'Default Server', url: 'http://localhost:1234'},
      ];
      (serverStore.getApiKey as jest.Mock).mockResolvedValue(undefined);
      (serverStore.fetchModelsForServer as jest.Mock).mockResolvedValueOnce({
        ok: false,
        error: 'Connection timed out',
      });

      const {getByTestId, getByText} = render(
        <RemoteModelSheet isVisible={true} onDismiss={jest.fn()} />,
      );

      fireEvent.press(getByTestId('server-chip-srv-1'));

      await waitFor(() => {
        expect(getByText(/Connection timed out/)).toBeTruthy();
      });
    });
  });
  describe('the row vision slot', () => {
    const ROUTER_ROWS = routerModelsBody.data as any[];
    const VISION = 'gemma-4-e2b';
    const TEXT = 'gemma-3-4b';

    const openViaChip = async (
      serverType: string | undefined,
      rows: any[] = ROUTER_ROWS,
    ) => {
      serverStore.servers = [
        {
          id: 'srv-1',
          name: 'router',
          url: 'http://localhost:8080',
          // The matrix covers values the type forbids but storage can hold.
          serverType: serverType as ServerType,
        },
      ];
      (serverStore.getApiKey as jest.Mock).mockResolvedValue(undefined);
      seedChipList(rows);

      const view = render(
        <RemoteModelSheet isVisible={true} onDismiss={jest.fn()} />,
      );
      fireEvent.press(view.getByTestId('server-chip-srv-1'));
      await waitFor(() => {
        expect(view.queryByText(VISION)).toBeTruthy();
      });
      return view;
    };

    const slot = (id: string) => `remote-model-row-vision-${id}`;

    it('tells the three states apart in one list', async () => {
      // The row the router build cannot describe has to read differently from
      // the row it describes as text-only, or 42 rows collapse into one state.
      const unknownRow = {...ROUTER_ROWS[0], id: 'mystery-model'};
      delete unknownRow.architecture;
      const {getByTestId} = await openViaChip('llama.cpp', [
        ...ROUTER_ROWS,
        unknownRow,
      ]);

      const labels = [VISION, TEXT, 'mystery-model'].map(
        id => getByTestId(slot(id)).props.accessibilityLabel,
      );

      expect(labels).toEqual([
        'Vision: Supported',
        'Vision: Not supported',
        'Vision: Unknown',
      ]);
      expect(new Set(labels).size).toBe(3);
    });

    it('reads the persisted server type, not the type this sheet detected', async () => {
      const {getByTestId} = await openViaChip('llama.cpp');

      // The chip path never detects a type, so the sheet's own serverType
      // state is still its initial 'unknown'.
      expect(mockedDetectServerType).not.toHaveBeenCalled();
      expect(getByTestId(slot(VISION))).toBeTruthy();
    });

    it.each([
      ['llama.cpp', true],
      ['LM Studio', false],
      ['Ollama', false],
      ['OpenAI', false],
      ['vLLM', false],
      ['unknown', false],
      ['', false],
      ['LLAMA.CPP', false],
      ['my server', false],
    ])('shows the slot for server type %j: %s', async (type, shown) => {
      const {queryByTestId} = await openViaChip(type);

      expect(queryByTestId(slot(VISION)) !== null).toBe(shown);
    });

    it('renders no slot at all on a server of another type', async () => {
      const {queryByTestId} = await openViaChip('Ollama');

      expect(queryByTestId(slot(VISION))).toBeNull();
      expect(queryByTestId(slot(TEXT))).toBeNull();
    });

    it('renders no slot for a server whose type is unknown', async () => {
      const {queryByTestId} = await openViaChip(undefined);

      expect(queryByTestId(slot(VISION))).toBeNull();
    });

    it('issues no request of its own to answer', async () => {
      await openViaChip('llama.cpp');

      expect(serverStore.fetchModelsForServer).toHaveBeenCalledTimes(1);
      expect(mockedFetchModelsWithHeaders).not.toHaveBeenCalled();
    });
  });

  describe('router rows', () => {
    const ROUTER = 'srv-r';
    const KEY = (id: string) => `${ROUTER}/${id}`;
    const row = (id: string, value: string, extra = {}) => ({
      id,
      object: 'model',
      status: {value, ...extra},
    });

    const openRouter = async (
      rows: any[],
      serverType: ServerType = 'llama.cpp',
    ) => {
      serverStore.servers = [
        {id: ROUTER, name: 'desk', url: 'http://desk:8080', serverType},
      ];
      (serverStore.getApiKey as jest.Mock).mockResolvedValue(undefined);
      (serverStore.fetchModelsForServer as jest.Mock).mockImplementationOnce(
        async (serverId: string) => {
          runInAction(() => {
            serverStore.serverModels.set(serverId, rows);
            serverStore.listReads = {
              [serverId]: {seq: 1, hasModelsKey: false, stale: false},
            };
          });
          return {ok: true};
        },
      );
      const view = render(
        <RemoteModelSheet isVisible={true} onDismiss={jest.fn()} />,
      );
      fireEvent.press(view.getByTestId(`server-chip-${ROUTER}`));
      await waitFor(() => {
        expect(view.queryByText(rows[0].id)).toBeTruthy();
      });
      return view;
    };

    const seedRecord = (id: string, record: Record<string, unknown>) => {
      const seeded = {key: KEY(id), ...record};
      routerStore.records.set(KEY(id), seeded as any);
      return seeded;
    };

    beforeEach(() => {
      routerStore.records.clear();
      routerStore.observedEviction.clear();
      serverStore.serverModels.clear();
      serverStore.listReads = {};
      serverStore.userSelectedModels = [];
      modelStore.activeRemoteBinding = undefined;
    });

    it.each([
      ['a load of ours', 'unloaded', 'load', 'loaded', 'Loading', 'cancel'],
      ['an unload of ours', 'loaded', 'unload', 'loaded', 'Unloading…', null],
      ['a loaded row', 'loaded', null, 'loaded', 'Loaded', 'unload'],
      ['a sleeping row', 'sleeping', null, 'loaded', 'Resident', 'unload'],
      [
        'a row another client loads',
        'loading',
        null,
        'loaded',
        'Loading',
        null,
      ],
      ['an unloaded row', 'unloaded', null, 'available', 'Not loaded', 'load'],
      ['an unreadable row', 'hibernating', null, 'available', null, 'load'],
      ['a downloading row', 'downloading', null, 'available', null, null],
    ])('presents %s', async (_label, value, kind, group, label, action) => {
      if (kind) {
        seedRecord('m', {kind});
      }
      const view = await openRouter([row('m', value)]);

      const groupView = within(view.getByTestId(`router-group-${group}`));
      expect(groupView.getByTestId('router-row-m')).toBeTruthy();
      if (label) {
        expect(view.getByTestId('router-state-m')).toHaveTextContent(label);
      } else {
        expect(view.queryByTestId('router-state-m')).toBeNull();
      }
      const actions = ['load', 'unload', 'cancel'].filter(
        name => view.queryByTestId(`router-${name}-m`) !== null,
      );
      expect(actions).toEqual(action ? [action] : []);
    });

    it('presents a failed row as not loaded', async () => {
      const view = await openRouter([
        row('m', 'unloaded', {failed: true, exit_code: 1}),
      ]);

      expect(view.getByTestId('router-state-m')).toHaveTextContent(
        'Not loaded',
      );
    });

    it('claims nothing about a row from a stale list', async () => {
      const view = await openRouter([row('m', 'loaded')]);
      runInAction(() => {
        serverStore.listReads[ROUTER].stale = true;
      });

      await waitFor(() => {
        expect(view.queryByTestId('router-state-m')).toBeNull();
      });
      expect(
        within(view.getByTestId('router-group-available')).getByTestId(
          'router-row-m',
        ),
      ).toBeTruthy();
    });

    it('never says sleeping', async () => {
      const view = await openRouter([row('m', 'sleeping')]);

      expect(view.queryByText(/sleeping/i)).toBeNull();
    });

    it('counts resident rows', async () => {
      const view = await openRouter([
        row('a', 'loaded'),
        row('b', 'sleeping'),
        row('c', 'loading'),
        row('d', 'unloaded'),
      ]);

      expect(view.getByTestId('router-resident-count')).toHaveTextContent(
        '2 resident',
      );
    });

    it('shows a determinate bar only for a progress value in range', async () => {
      seedRecord('a', {kind: 'load', detail: {progress: {value: 0}}});
      seedRecord('b', {kind: 'load', detail: {progress: {value: 2}}});
      const view = await openRouter([
        row('a', 'unloaded'),
        row('b', 'unloaded'),
      ]);

      expect(
        view.getByTestId('router-progress-a').props.accessibilityValue,
      ).toEqual({min: 0, max: 100, now: 0});
      expect(
        view.getByTestId('router-progress-b').props.accessibilityValue,
      ).toEqual({});
    });

    it('wires load and cancel to the store', async () => {
      seedRecord('b', {kind: 'load'});
      const view = await openRouter([
        row('a', 'unloaded'),
        row('b', 'unloaded'),
      ]);

      fireEvent.press(view.getByTestId('router-load-a'));
      fireEvent.press(view.getByTestId('router-cancel-b'));

      expect(routerStore.ensureLoaded).toHaveBeenCalledWith(ROUTER, 'a');
      expect(routerStore.cancel).toHaveBeenCalledWith(ROUTER, 'b');
    });

    it('confirms before unloading the model this chat uses', async () => {
      const alert = jest.spyOn(Alert, 'alert');
      modelStore.activeRemoteBinding = {
        modelId: KEY('bound'),
        serverId: ROUTER,
        remoteModelId: 'bound',
        url: 'http://desk:8080',
        serverType: 'llama.cpp',
      };
      const view = await openRouter([row('bound', 'loaded')]);

      fireEvent.press(view.getByTestId('router-unload-bound'));

      expect(alert).toHaveBeenCalledTimes(1);
      expect(routerStore.unload).not.toHaveBeenCalled();
      const buttons = alert.mock.calls[0][2] as any[];
      buttons.find(button => button.style === 'destructive').onPress();
      expect(routerStore.unload).toHaveBeenCalledWith(ROUTER, 'bound');
    });

    it('dims only the selection of an already-added row, not its actions', async () => {
      serverStore.userSelectedModels = [
        {serverId: ROUTER, remoteModelId: 'added'},
      ];
      const view = await openRouter([row('added', 'loaded')]);
      const opacityOf = (node: any) =>
        StyleSheet.flatten(node.props.style)?.opacity;
      const dimmedBetween = (node: any, until: any) => {
        for (
          let current = node;
          current && current !== until;
          current = current.parent
        ) {
          if (opacityOf(current) !== undefined && opacityOf(current) < 1) {
            return true;
          }
        }
        return false;
      };

      const rowNode = view.getByTestId('router-row-added');
      expect(
        dimmedBetween(view.getByTestId('router-unload-added'), rowNode),
      ).toBe(false);
      expect(
        dimmedBetween(view.getByTestId('router-state-added'), rowNode),
      ).toBe(false);
      expect(opacityOf(view.getByTestId('router-select-added'))).toBe(0.5);
      expect(
        within(view.getByTestId('router-select-added')).getByText(
          l10n.en.settings.alreadyAdded,
        ),
      ).toBeTruthy();
    });

    it('unloads any other model without asking', async () => {
      const alert = jest.spyOn(Alert, 'alert');
      const view = await openRouter([row('other', 'loaded')]);

      fireEvent.press(view.getByTestId('router-unload-other'));

      expect(alert).not.toHaveBeenCalled();
      expect(routerStore.unload).toHaveBeenCalledWith(ROUTER, 'other');
    });

    it('shows a failure with the server words as plain text, and dismisses it', async () => {
      seedRecord('m', {
        kind: 'load',
        failure: {cause: 'load-failed', message: '**bold** [x](http://e)'},
      });
      const view = await openRouter([row('m', 'unloaded')]);

      const reason = view.getByTestId('router-reason-m');
      expect(reason.type).toBe('Text');
      expect(reason).toHaveTextContent(
        'This model did not load. **bold** [x](http://e)',
      );
      fireEvent.press(view.getByTestId('router-dismiss-m'));
      expect(routerStore.dismiss).toHaveBeenCalledWith(ROUTER, 'm');
    });

    it('shows the eviction note only once the store observed one', async () => {
      const view = await openRouter([row('m', 'loaded')]);
      expect(view.queryByTestId('router-eviction-note')).toBeNull();

      runInAction(() => {
        routerStore.observedEviction.add(ROUTER);
      });

      await waitFor(() => {
        expect(view.getByTestId('router-eviction-note')).toBeTruthy();
      });
    });

    it('tells the store which server the picker shows', async () => {
      const view = await openRouter([row('m', 'loaded')]);

      expect(routerStore.setPickerServer).toHaveBeenLastCalledWith(ROUTER);
      view.unmount();
      expect(routerStore.setPickerServer).toHaveBeenLastCalledWith(null);
    });

    it('asks the server for nothing beyond the list', async () => {
      await openRouter([row('m', 'loaded'), row('n', 'unloaded')]);

      expect(serverStore.fetchRemoteModelCaps).not.toHaveBeenCalled();
      expect(routerStore.ensureLoaded).not.toHaveBeenCalled();
    });

    it.each([
      [
        'a non-router llama.cpp server',
        'llama.cpp',
        [{id: 'm', object: 'model'}],
      ],
      [
        'a router-shaped list on another server type',
        'Ollama',
        [row('m', 'loaded')],
      ],
    ])('renders the plain picker for %s', async (_label, serverType, rows) => {
      const view = await openRouter(rows, serverType as ServerType);

      expect(view.queryByTestId('router-group-loaded')).toBeNull();
      expect(view.queryByTestId('router-row-m')).toBeNull();
      expect(view.queryByTestId('router-resident-count')).toBeNull();
      expect(routerStore.setPickerServer).not.toHaveBeenCalled();
    });
  });
});
