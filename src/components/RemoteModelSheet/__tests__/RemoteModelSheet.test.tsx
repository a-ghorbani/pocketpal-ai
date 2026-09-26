import React from 'react';
import {render, fireEvent, waitFor, within} from '../../../../jest/test-utils';
import {RemoteModelSheet} from '../RemoteModelSheet';
import {serverStore} from '../../../store';
import {
  detectServerType,
  fetchModels,
  fetchModelsWithHeaders,
} from '../../../api/openai';
import {routerModelsBody} from '../../../../jest/fixtures/remoteModelList';
import {l10n} from '../../../locales';
import {routerWireEvents} from '../../../../jest/fixtures/routerWire';

const mockedFetchModels = fetchModels as jest.Mock;
const mockedFetchModelsWithHeaders = fetchModelsWithHeaders as jest.Mock;
const mockedDetectServerType = detectServerType as jest.Mock;

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

/**
 * What the store's own fetch would have left behind. The sheet asks the store
 * to read the list rather than reading it itself, so a test seeds the result
 * instead of the response.
 */
const seedServerModels = (rows: any[], serverId = 'srv-1') =>
  serverStore.serverModels.set(serverId, rows);

describe('RemoteModelSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    serverStore.serverModels.clear();
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

    // The server-type dropdown is seeded by detectServerType (mocked to ''),
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

  // Tapping a saved server's chip reads the list through the store, which is
  // what stamps the shape of the response beside the rows. A read issued here
  // would leave that stamp unwritten and every consumer of it guessing.
  describe('chip-press probe feed', () => {
    const savedServer = {
      id: 'srv-1',
      name: 'Slow Server',
      url: 'http://localhost:1234',
      requestTimeoutMs: 600000,
    };

    it('reads the list through the store rather than fetching it', async () => {
      serverStore.servers = [savedServer];
      (serverStore.getApiKey as jest.Mock).mockResolvedValue(undefined);
      seedServerModels([{id: 'llama-7b', object: 'model', owned_by: 'system'}]);

      const {getByTestId} = render(
        <RemoteModelSheet isVisible={true} onDismiss={jest.fn()} />,
      );

      fireEvent.press(getByTestId('server-chip-srv-1'));

      await waitFor(() => {
        expect(serverStore.fetchModelsForServer).toHaveBeenCalledWith('srv-1');
      });
      expect(mockedFetchModels).not.toHaveBeenCalled();
      expect(mockedFetchModelsWithHeaders).not.toHaveBeenCalled();
    });

    it('reports a chip whose server could not be read as offline', async () => {
      serverStore.servers = [savedServer];
      (serverStore.getApiKey as jest.Mock).mockResolvedValue(undefined);
      (serverStore.fetchModelsForServer as jest.Mock).mockResolvedValueOnce({
        ok: false,
        error: 'Network request failed',
      });

      const {getByTestId, getByText} = render(
        <RemoteModelSheet isVisible={true} onDismiss={jest.fn()} />,
      );

      fireEvent.press(getByTestId('server-chip-srv-1'));

      await waitFor(() => {
        expect(getByText(/Network request failed/)).toBeTruthy();
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
          serverType,
        },
      ];
      (serverStore.getApiKey as jest.Mock).mockResolvedValue(undefined);
      seedServerModels(rows);

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

      expect(mockedFetchModels).not.toHaveBeenCalled();
      expect(mockedFetchModelsWithHeaders).not.toHaveBeenCalled();
    });
  });

  describe('router model management', () => {
    const ROWS = routerModelsBody.data as any[];
    const LOADED = 'gemma-4-e2b';
    const UNLOADED = 'ggml-org/gemma-4-31B-it-GGUF:Q8_0';
    /** A model this app has business about that the server does not list. */
    const PENDING_REF = 'ggml-org/gemma-3-270m-it-GGUF:Q8_0';

    const openRouter = async (
      serverType: string | undefined = 'llama.cpp',
      rows: any[] = ROWS,
    ) => {
      serverStore.servers = [
        {
          id: 'srv-1',
          name: 'router',
          url: 'http://localhost:8080',
          serverType,
        },
      ];
      (serverStore.getApiKey as jest.Mock).mockResolvedValue(undefined);
      seedServerModels(rows);

      const view = render(
        <RemoteModelSheet isVisible={true} onDismiss={jest.fn()} />,
      );
      fireEvent.press(view.getByTestId('server-chip-srv-1'));
      await waitFor(() => {
        expect(view.queryByText(LOADED)).toBeTruthy();
      });
      return view;
    };

    beforeEach(() => {
      serverStore.routerEvents = {};
      serverStore.routerOps = {};
      serverStore.routerReasons = {};
      serverStore.routerStreamCap = {};
      serverStore.routerObservedEviction = new Set();
      serverStore.routerListShape = {};
    });

    it('opens the stream and asks for no capabilities per row', async () => {
      await openRouter();

      expect(serverStore.openRouterStream).toHaveBeenCalledWith('srv-1');
      expect(serverStore.fetchRemoteModelCaps).not.toHaveBeenCalled();
      expect(mockedFetchModels).not.toHaveBeenCalled();
    });

    it('groups rows by what the server says about them', async () => {
      const {getByTestId} = await openRouter();

      expect(getByTestId(`router-row-${LOADED}`)).toBeTruthy();
      expect(getByTestId(`router-unload-${LOADED}`)).toBeTruthy();
      expect(getByTestId(`router-load-${UNLOADED}`)).toBeTruthy();
    });

    it('shows the resident count as a fact and predicts nothing', async () => {
      const {getByTestId, queryByText} = await openRouter();

      expect(getByTestId('router-resident-count')).toBeTruthy();
      expect(queryByText(/evict/i)).toBeNull();
    });

    it('mentions eviction only once one has been seen', async () => {
      const first = await openRouter();
      expect(first.queryByTestId('router-eviction-note')).toBeNull();
      first.unmount();

      serverStore.routerObservedEviction = new Set(['srv-1']);
      const second = await openRouter();

      expect(second.getByTestId('router-eviction-note')).toBeTruthy();
    });

    it('never calls a model sleeping, whatever the row says', async () => {
      const rows = ROWS.map(row =>
        row.id === LOADED
          ? {...row, status: {...row.status, value: 'sleeping'}}
          : row,
      );
      const {queryByText, getByTestId} = await openRouter('llama.cpp', rows);

      expect(queryByText(/sleeping/i)).toBeNull();
      expect(getByTestId(`router-unload-${LOADED}`)).toBeTruthy();
    });

    it('renders a determinate bar for a load reporting zero progress', async () => {
      serverStore.routerOps = {
        [`srv-1/${UNLOADED}`]: {
          kind: 'load',
          attempt: 1,
          phase: 'active',
          serverId: 'srv-1',
          key: `srv-1/${UNLOADED}`,
          startedAt: Date.now(),
          requestSeq: 0,
          lastEvidenceAt: Date.now(),
        },
      };
      serverStore.routerEvents = {
        [`srv-1/${UNLOADED}`]: {progress: {value: 0}, at: Date.now()},
      };
      const {getByTestId} = await openRouter();

      // A determinate bar announces a value; an indeterminate one announces
      // none, so this distinguishes zero progress from no progress.
      const bar = getByTestId(`router-progress-${UNLOADED}`);
      expect(bar.props.accessibilityValue).toEqual({min: 0, max: 100, now: 0});
    });

    it('says a model is being released rather than offering a second unload', async () => {
      serverStore.routerOps = {
        [`srv-1/${LOADED}`]: {
          kind: 'unload',
          attempt: 1,
          phase: 'requested',
          serverId: 'srv-1',
          key: `srv-1/${LOADED}`,
          startedAt: Date.now(),
          requestSeq: 0,
          lastEvidenceAt: Date.now(),
        },
      };
      const {getByTestId, queryByTestId} = await openRouter();

      expect(getByTestId(`router-unloading-${LOADED}`)).toBeTruthy();
      expect(queryByTestId(`router-unload-${LOADED}`)).toBeNull();
    });

    it.each(['unknown', 'absent'])(
      'offers no download field while the stream has answered %s',
      async cap => {
        serverStore.routerStreamCap = {'srv-1': cap as any};
        const {queryByTestId} = await openRouter();

        expect(queryByTestId('router-download-field')).toBeNull();
      },
    );

    it('offers the download field once the stream has answered', async () => {
      serverStore.routerStreamCap = {'srv-1': 'present'};
      const {getByTestId} = await openRouter();

      expect(getByTestId('router-download-field')).toBeTruthy();
    });

    it('renders the router surface for a server that lists nothing', async () => {
      serverStore.routerListShape = {
        'srv-1': {hasModelsKey: false, seq: 1, stale: false},
      };
      serverStore.servers = [
        {
          id: 'srv-1',
          name: 'router',
          url: 'http://localhost:8080',
          serverType: 'llama.cpp',
        },
      ];
      (serverStore.getApiKey as jest.Mock).mockResolvedValue(undefined);
      seedServerModels([]);

      const {getByText, queryByTestId} = render(
        <RemoteModelSheet isVisible={true} onDismiss={jest.fn()} />,
      );
      fireEvent.press(getByText('router'));
      await waitFor(() => {
        expect(queryByTestId('router-resident-count')).toBeTruthy();
      });
    });

    it('leaves a server with no router evidence exactly as it was', async () => {
      const plain = [
        {id: 'solo', object: 'model', owned_by: 'llamacpp'},
      ] as any[];
      const {queryByTestId, getByText} = await (async () => {
        serverStore.servers = [
          {
            id: 'srv-1',
            name: 'router',
            url: 'http://localhost:8080',
            serverType: 'llama.cpp',
          },
        ];
        (serverStore.getApiKey as jest.Mock).mockResolvedValue(undefined);
        seedServerModels(plain);
        const view = render(
          <RemoteModelSheet isVisible={true} onDismiss={jest.fn()} />,
        );
        fireEvent.press(view.getByTestId('server-chip-srv-1'));
        await waitFor(() => expect(view.queryByText('solo')).toBeTruthy());
        return view;
      })();

      expect(queryByTestId('router-row-solo')).toBeNull();
      expect(queryByTestId('router-resident-count')).toBeNull();
      expect(getByText('solo')).toBeTruthy();
      expect(serverStore.openRouterStream).not.toHaveBeenCalled();
    });

    // A download the server has not finished has no row of its own, so the
    // rows alone leave the fetch invisible, its Cancel unreachable and the
    // copy for one that never arrived with nowhere to render.
    describe('a model the server has no row for', () => {
      const PENDING = 'ggml-org/gemma-3-270m-it-GGUF:Q8_0';
      const key = `srv-1/${PENDING}`;

      it('lists a download in flight with its cancel', async () => {
        serverStore.routerOps = {
          [key]: {
            kind: 'download',
            attempt: 1,
            phase: 'requested',
            serverId: 'srv-1',
            key,
            startedAt: Date.now(),
            requestSeq: 0,
            lastEvidenceAt: Date.now(),
          },
        };

        const {getByTestId} = await openRouter();

        expect(getByTestId(`router-row-${PENDING}`)).toBeTruthy();
        expect(getByTestId(`router-cancel-${PENDING}`)).toBeTruthy();
        expect(getByTestId(`router-state-${PENDING}`).props.children).toBe(
          'Downloading',
        );
      });

      it('renders the copy for a download that never arrived', async () => {
        serverStore.routerReasons = {[key]: {cause: 'download-not-fetched'}};

        const {getByTestId} = await openRouter();

        expect(getByTestId(`router-reason-${PENDING}`)).toBeTruthy();
        expect(getByTestId(`router-dismiss-${PENDING}`)).toBeTruthy();
      });

      it('reads the bar from the bytes the stream reported', async () => {
        const tick = routerWireEvents('sse-download-sequence.txt').find(
          event => event.event === 'download_progress',
        );
        const files = Object.values(tick.data.progress) as any[];
        const total = files.reduce((sum, file) => sum + file.total, 0);

        serverStore.routerOps = {
          [key]: {
            kind: 'download',
            attempt: 1,
            phase: 'active',
            serverId: 'srv-1',
            key,
            startedAt: Date.now(),
            requestSeq: 0,
            lastEvidenceAt: Date.now(),
          },
        };
        serverStore.routerEvents = {
          [key]: {
            bytes: {done: total / 2, total, urls: files.length},
            at: Date.now(),
          },
        };

        const {getByTestId} = await openRouter();
        // A determinate bar announces its value; an indeterminate one
        // announces none, which is what a parsed byte total was buying.
        expect(
          getByTestId(`router-progress-${PENDING}`).props.accessibilityValue,
        ).toEqual({min: 0, max: 100, now: 50});
      });
    });

    // While an operation holds a row, the operation is what the row says: the
    // list has an answer of its own and reading both is how two of them end
    // up on screen at once.
    it('lets the operation say what the row is doing', async () => {
      serverStore.routerOps = {
        [`srv-1/${UNLOADED}`]: {
          kind: 'load',
          attempt: 1,
          phase: 'active',
          serverId: 'srv-1',
          key: `srv-1/${UNLOADED}`,
          startedAt: Date.now(),
          requestSeq: 0,
          lastEvidenceAt: Date.now(),
        },
      };
      const {getByTestId, queryByTestId} = await openRouter();

      expect(getByTestId(`router-state-${UNLOADED}`).props.children).toBe(
        'Loading',
      );
      expect(getByTestId(`router-progress-${UNLOADED}`)).toBeTruthy();
      expect(getByTestId(`router-cancel-${UNLOADED}`)).toBeTruthy();
      expect(queryByTestId(`router-load-${UNLOADED}`)).toBeNull();
    });

    // Posting a second one collides with the load already running, and the
    // row it would collide with is not this app's to cancel.
    it('offers no load for a model the server is already loading', async () => {
      const rows = ROWS.map(row =>
        row.id === UNLOADED
          ? {...row, status: {...row.status, value: 'loading'}}
          : row,
      );
      const {queryByTestId} = await openRouter('llama.cpp', rows);

      expect(queryByTestId(`router-load-${UNLOADED}`)).toBeNull();
      expect(queryByTestId(`router-cancel-${UNLOADED}`)).toBeNull();
      expect(queryByTestId(`router-progress-${UNLOADED}`)).toBeNull();
    });

    // The device capture: the desktop stopped answering mid-load, and the row
    // went on calling itself loaded underneath the note saying so.
    it('makes no claim for a row the last fetch could not refresh', async () => {
      serverStore.routerListShape = {
        'srv-1': {hasModelsKey: false, seq: 1, stale: true},
      };
      const {queryByTestId, getByTestId} = await openRouter();

      expect(queryByTestId(`router-state-${LOADED}`)).toBeNull();
      expect(queryByTestId(`router-unload-${LOADED}`)).toBeNull();
      expect(getByTestId('router-resident-count').props.children).toBe(
        '0 resident',
      );
    });

    // The picker's own rows — a model this app has business about that the
    // server does not list — carry no state the server vouched for, so there
    // is nothing here to load.
    it('offers no load for a model the server has no row for', async () => {
      const key = `srv-1/${PENDING_REF}`;
      serverStore.routerReasons = {[key]: {cause: 'download-not-fetched'}};

      const {getByTestId, queryByTestId} = await openRouter();

      expect(getByTestId(`router-row-${PENDING_REF}`)).toBeTruthy();
      expect(queryByTestId(`router-load-${PENDING_REF}`)).toBeNull();
      expect(queryByTestId(`router-state-${PENDING_REF}`)).toBeNull();
    });

    // The row has no state of its own until the weights land, so the group it
    // sits in can only come from the operation.
    it('files a download with no row of its own under Downloading', async () => {
      const key = `srv-1/${PENDING_REF}`;
      serverStore.routerOps = {
        [key]: {
          kind: 'download',
          attempt: 1,
          phase: 'active',
          serverId: 'srv-1',
          key,
          startedAt: Date.now(),
          requestSeq: 0,
          lastEvidenceAt: Date.now(),
        },
      };

      const {getByTestId} = await openRouter();

      expect(
        within(getByTestId('router-group-downloading')).getByTestId(
          `router-row-${PENDING_REF}`,
        ),
      ).toBeTruthy();
    });

    // A model the server is still fetching is nothing a session can bind to,
    // whether or not the server already lists a row under that name.
    it('does not let a model being fetched be selected', async () => {
      const key = `srv-1/${UNLOADED}`;
      serverStore.routerOps = {
        [key]: {
          kind: 'download',
          attempt: 1,
          phase: 'active',
          serverId: 'srv-1',
          key,
          startedAt: Date.now(),
          requestSeq: 0,
          lastEvidenceAt: Date.now(),
        },
      };

      const {getByTestId} = await openRouter();
      fireEvent.press(getByTestId(`router-select-${UNLOADED}`));

      expect(
        getByTestId('add-model-button').props.accessibilityState?.disabled,
      ).toBe(true);
    });

    // On a server that has stopped answering, the operation lives on for the
    // ninety seconds the reach bound takes. It must not go on offering a
    // Cancel that cancels nothing or a bar for work nobody awaits — and it
    // must not go quiet either: cancelling posts an unload, and that is what
    // the row says is happening.
    it('presents an operation the user withdrew as the unload it now is', async () => {
      const key = `srv-1/${UNLOADED}`;
      serverStore.routerOps = {
        [key]: {
          kind: 'load',
          attempt: 1,
          phase: 'active',
          serverId: 'srv-1',
          key,
          startedAt: Date.now(),
          requestSeq: 0,
          lastEvidenceAt: Date.now(),
          cancelled: true,
        },
      };

      const {getByTestId, queryByTestId} = await openRouter();

      expect(queryByTestId(`router-cancel-${UNLOADED}`)).toBeNull();
      expect(queryByTestId(`router-progress-${UNLOADED}`)).toBeNull();
      expect(getByTestId(`router-unloading-${UNLOADED}`)).toBeTruthy();
    });

    // The field used to show the server's words alone, which said nothing
    // about what had gone wrong. It carries the app's cause now, with the
    // server's words quoted rather than spoken in the app's voice.
    it('names the failure and quotes the server when a download is refused', async () => {
      (serverStore.startRouterDownload as jest.Mock).mockResolvedValue({
        accepted: false,
        message: 'File Not Found',
      });
      serverStore.routerStreamCap = {'srv-1': 'present'};
      const {getByTestId, getByText} = await openRouter();

      fireEvent.changeText(
        getByTestId('router-download-input'),
        'owner/repo:Q8_0',
      );
      fireEvent.press(getByTestId('router-download-button'));

      await waitFor(() => {
        expect(
          getByText(
            `${l10n.en.settings.routerModels.downloadNotFetched} “File Not Found”`,
          ),
        ).toBeTruthy();
      });
    });

    // A row that is one accessibility target announces itself and swallows
    // every control inside it, so Load, Unload, Cancel and the star cannot be
    // reached and activating any of them selects the model instead.
    it('leaves every control in a row its own accessibility target', async () => {
      const {getByTestId} = await openRouter();

      expect(getByTestId(`router-select-${LOADED}`).props.accessible).toBe(
        false,
      );
      expect(getByTestId(`router-unload-${LOADED}`)).toBeTruthy();
    });

    // The sibling surfaces this sheet renders do not exist yet, so the
    // degraded path is the one that actually ships first.
    it('renders without favourites, last-used or presence', async () => {
      const {getByTestId, queryByTestId} = await openRouter();

      expect(queryByTestId(`router-favourite-${LOADED}`)).toBeNull();
      expect(getByTestId(`router-row-${LOADED}`)).toBeTruthy();
      expect(getByTestId(`router-load-${UNLOADED}`)).toBeTruthy();
    });
  });
});
