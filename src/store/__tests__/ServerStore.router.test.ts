import {AppState} from 'react-native';
import {runInAction} from 'mobx';

import * as openaiModule from '../../api/openai';

jest.mock('mobx-persist-store', () => ({
  makePersistable: jest.fn().mockReturnValue(Promise.resolve()),
}));

jest.mock('../../api/openai', () => ({
  fetchModelsWithHeaders: jest.fn(),
  fetchServerProps: jest.fn(),
  testConnection: jest.fn(),
  PROPS_TIMEOUT_MS: 5000,
}));

jest.mock('../../api/router', () => ({
  ...jest.requireActual('../../api/router'),
  openRouterEventStream: jest.fn(),
  routerLoad: jest.fn(),
  routerUnload: jest.fn(),
  routerDownload: jest.fn(),
}));

/**
 * The store registers its listener while it is being constructed, and import
 * hoisting puts that before any spy this file can install — so the handler has
 * to come from the registration the preset's own mock already recorded.
 */
const appStateChanged: (state: string) => void = (
  AppState.addEventListener as unknown as jest.Mock
).mock.calls[0][1];

const mockAddEventListener = jest.fn().mockReturnValue({remove: jest.fn()});
jest
  .spyOn(AppState, 'addEventListener')
  .mockImplementation(mockAddEventListener);

import {serverStore} from '../ServerStore';
import {
  directTextModelsBody,
  routerModelsBody,
} from '../../../jest/fixtures/remoteModelList';
import {
  routerWireEvents,
  routerWireJson,
  routerWireResponse,
} from '../../../jest/fixtures/routerWire';
import type {RemoteModelInfo} from '../../api/openai';
import type {RouterOp} from '../../utils/routerState';
import {
  openRouterEventStream,
  routerDownload,
  routerLoad,
  routerUnload,
  RouterStreamError,
} from '../../api/router';

const persistedProperties: string[] = (
  jest.requireMock('mobx-persist-store').makePersistable as jest.Mock
).mock.calls[0][1].properties;

const mockedFetch = openaiModule.fetchModelsWithHeaders as jest.Mock;
const mockedOpenStream = openRouterEventStream as jest.Mock;

/**
 * Stands in for the handle the real transport returns, which distinguishes the
 * two endings that look identical on the wire: `close()` is this store's own
 * decision and reaches no handler, while `endStream` is the stream ending
 * without being asked. A stand-in whose close did nothing at all would hide
 * every defect in that distinction, since nothing would ever fire.
 */
const openedStreams: Array<{handlers: any; closed: boolean}> = [];

const installStreamHandle = () => {
  openedStreams.length = 0;
  mockedOpenStream.mockImplementation((_url, _apiKey, handlers) => {
    const stream = {handlers, closed: false};
    openedStreams.push(stream);
    return {
      close: () => {
        stream.closed = true;
      },
    };
  });
};

const liveStream = () => openedStreams[openedStreams.length - 1];

/** The stream ends by itself: the server hung up, or the transport gave out. */
const endStream = (error?: RouterStreamError) => {
  const stream = liveStream();
  if (!stream || stream.closed) {
    return;
  }
  stream.closed = true;
  stream.handlers.onClose?.(error);
};
const mockedRouterLoad = routerLoad as jest.Mock;
const mockedRouterUnload = routerUnload as jest.Mock;
const mockedRouterDownload = routerDownload as jest.Mock;

/** One of the captured router rows; the tests move it between states. */
const TARGET = 'gemma-4-e2b';
const UNLOADED_TARGET = 'ggml-org/gemma-4-31B-it-GGUF:Q8_0';
const ROUTER_ACK_MS = 20000;
const ROUTER_EVIDENCE_MS = 45000;
const ROUTER_UNREACHABLE_MS = 90000;
const ROUTER_LOAD_MAX_MS = 10 * 60 * 1000;
const ROUTER_UNLOAD_SETTLE_MS = 30000;
const ROUTER_POLL_MS = 4000;
const ROUTER_DOWNLOAD_SETTLE_MS = 8000;
const ROUTER_DOWNLOAD_MAX_MS = 2 * 60 * 60 * 1000;
const ROUTER_TICK_MS = 1000;
const ROUTER_RECONNECT_MAX = 6;
const ROUTER_RECONNECT_BACKOFF_MS = 1000;

const routerWireResponseBody = (name: any) =>
  JSON.parse(routerWireResponse(name).body);

const listResult = (models: any[], hasModelsKey: boolean) => ({
  models: models as RemoteModelInfo[],
  headers: {},
  hasModelsKey,
});

/** The first real progress tick of a captured load, value and all. */
const firstProgressEvent = () =>
  routerWireEvents('sse-load-sequence.txt').find(
    event => event.data?.progress !== undefined,
  );

/** A stream failure carrying a captured envelope's own status and wording. */
const streamErrorFrom = (name: any) => {
  const captured = routerWireResponse(name);
  return new RouterStreamError(
    JSON.parse(captured.body).error.message,
    captured.status,
  );
};

/** Advance in slices so each tick's detached fetch can resolve between them. */
const advance = async (ms: number) => {
  for (let elapsed = 0; elapsed < ms; elapsed += 1000) {
    jest.advanceTimersByTime(1000);
    await flush();
  }
};

/** A reconcile that starts strictly after whatever came before it. */
const reconcile = async (serverId: string) => {
  jest.advanceTimersByTime(1);
  await serverStore.fetchModelsForServer(serverId);
};

/** Let a scheduled reopen run, then let the work it starts settle. */
const settleReopen = async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
  await flush();
};

/** Let a detached reconcile reach its mocked fetch. */
const flush = async () => {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
  }
};

const addServer = (serverType = 'llama.cpp') =>
  serverStore.addServer({
    name: 'desktop',
    url: 'http://desktop:8080',
    serverType,
  });

const resetStore = () => {
  runInAction(() => {
    serverStore.servers = [];
    serverStore.serverModels.clear();
    serverStore.userSelectedModels = [];
    serverStore.isLoading = false;
    serverStore.error = null;
    serverStore.routerEvents = {};
    serverStore.routerOps = {};
    serverStore.routerStream = null;
    serverStore.routerPolls = new Set();
    serverStore.routerStreamCap = {};
    serverStore.routerObservedEviction = new Set();
    serverStore.routerListShape = {};
    serverStore.routerReasons = {};
  });
  // Through the action, so the poll bookkeeping it owns is cleared too.
  runInAction(() => serverStore.syncRouterTiers());
};

describe('router detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    installStreamHandle();
    resetStore();
  });

  it('detects a router from the rows the fetch returned', async () => {
    const id = addServer();
    mockedFetch.mockResolvedValueOnce(listResult(routerModelsBody.data, false));

    await serverStore.fetchModelsForServer(id);

    expect(serverStore.isRouterServer(id)).toBe(true);
  });

  // The measured discriminator, from a second and later build than the one
  // remoteModelList.ts was captured from.
  it('agrees with the captured router body from another build', async () => {
    const id = addServer();
    const body = routerWireJson('router-v1-models.json');
    expect('models' in body).toBe(false);
    mockedFetch.mockResolvedValueOnce(listResult(body.data, false));

    await serverStore.fetchModelsForServer(id);

    expect(serverStore.isRouterServer(id)).toBe(true);
  });

  it('does not detect a single-model server', async () => {
    const id = addServer();
    mockedFetch.mockResolvedValueOnce(
      listResult(directTextModelsBody.data, true),
    );

    await serverStore.fetchModelsForServer(id);

    expect(serverStore.isRouterServer(id)).toBe(false);
    expect(serverStore.routerRowStates).toEqual({});
  });

  it('detects a router that lists no models at all', async () => {
    const id = addServer();
    mockedFetch.mockResolvedValueOnce(listResult([], false));

    await serverStore.fetchModelsForServer(id);

    expect(serverStore.isRouterServer(id)).toBe(true);
    expect(serverStore.routerRowStates).toEqual({});
  });

  it('leaves a non-llama.cpp server inert whatever its rows look like', async () => {
    const id = addServer('lmstudio');
    mockedFetch.mockResolvedValueOnce(listResult(routerModelsBody.data, false));

    await serverStore.fetchModelsForServer(id);

    expect(serverStore.isRouterServer(id)).toBe(false);
  });

  it('is inert before anything has been fetched', () => {
    const id = addServer();

    expect(serverStore.isRouterServer(id)).toBe(false);
  });

  it('records nothing about a fetch that failed', async () => {
    const id = addServer();
    mockedFetch.mockRejectedValueOnce(new Error('Connection refused'));

    await serverStore.fetchModelsForServer(id);

    expect(serverStore.routerListShape[id]).toBeUndefined();
    expect(serverStore.isRouterServer(id)).toBe(false);
  });

  it('persists no router state', () => {
    expect(persistedProperties).toEqual([
      'servers',
      'privacyNoticeAcknowledged',
      'userSelectedModels',
      'remoteReasoning',
      'remoteCaps',
    ]);
  });
});

describe('routerRowStates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    installStreamHandle();
    resetStore();
  });

  const withRouter = async () => {
    const id = addServer();
    mockedFetch.mockResolvedValue(listResult(routerModelsBody.data, false));
    await serverStore.fetchModelsForServer(id);
    return id;
  };

  it('maps every row the server listed', async () => {
    const id = await withRouter();

    for (const row of routerModelsBody.data) {
      expect(serverStore.routerRowState(id, row.id)).toBe(row.status.value);
    }
  });

  it('counts residents without predicting an eviction', async () => {
    const id = await withRouter();

    const loaded = routerModelsBody.data.filter(
      row => row.status.value === 'loaded',
    ).length;
    expect(serverStore.routerResidentCount(id)).toBe(loaded);
  });

  it('reports a model the server does not list as absent', async () => {
    const id = await withRouter();

    expect(serverStore.routerRowState(id, 'never-heard-of-it')).toBe('absent');
  });
});

describe('the router event stream', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    installStreamHandle();
    resetStore();
  });

  const openOn = async (serverId: string) => {
    mockedOpenStream.mockClear();
    openedStreams.length = 0;
    await serverStore.openRouterStream(serverId);
    return liveStream()?.handlers;
  };

  const routerServer = async () => {
    const id = addServer();
    mockedFetch.mockResolvedValue(listResult(routerModelsBody.data, false));
    await serverStore.fetchModelsForServer(id);
    return id;
  };

  it('remembers an unregistered stream endpoint and never retries it', async () => {
    const id = await routerServer();
    const handlers = await openOn(id);

    handlers.onClose(streamErrorFrom('sse-unregistered-404.txt'));

    expect(serverStore.routerStreamCapFor(id)).toBe('absent');

    mockedOpenStream.mockClear();
    await serverStore.openRouterStream(id);
    expect(mockedOpenStream).not.toHaveBeenCalled();
  });

  // 404 and 401 both pass against an implementation matching the error text,
  // because the captured 401 message carries no number. A status a text match
  // would find is what separates them.
  it.each([401, 400, 500])(
    'remembers nothing from a %i, which is not about the build',
    async status => {
      const id = await routerServer();
      const handlers = await openOn(id);

      handlers.onClose(
        status === 401
          ? streamErrorFrom('sse-unauthorized-401.txt')
          : new RouterStreamError('Server error', status),
      );

      expect(serverStore.routerStreamCapFor(id)).toBe('unknown');
    },
  );

  // The pair above still passes if the cap is read off the wording, because
  // none of those three messages carries the 404's words. These two put the
  // wording and the status on opposite sides, so only a reading of the status
  // answers both.
  it.each([400, 500])(
    'remembers nothing from a %i wearing the 404 wording',
    async status => {
      const id = await routerServer();
      const handlers = await openOn(id);
      const notFound = streamErrorFrom('sse-unregistered-404.txt');

      handlers.onClose(new RouterStreamError(notFound.message, status));

      expect(serverStore.routerStreamCapFor(id)).toBe('unknown');
    },
  );

  it('remembers a 404 that does not say so in words', async () => {
    const id = await routerServer();
    const handlers = await openOn(id);

    handlers.onClose(new RouterStreamError('', 404));

    expect(serverStore.routerStreamCapFor(id)).toBe('absent');
  });

  it('records the stream as present once it answers', async () => {
    const id = await routerServer();
    const handlers = await openOn(id);

    handlers.onOpen();

    expect(serverStore.routerStreamCapFor(id)).toBe('present');
    expect(serverStore.routerStream).toEqual({serverId: id, state: 'open'});
  });

  it('opens nothing on a server with no router evidence', async () => {
    const id = addServer();
    mockedFetch.mockResolvedValue(listResult(directTextModelsBody.data, true));
    await serverStore.fetchModelsForServer(id);

    mockedOpenStream.mockClear();
    await serverStore.openRouterStream(id);

    expect(mockedOpenStream).not.toHaveBeenCalled();
  });

  it('keeps at most one stream when focus moves', async () => {
    const first = await routerServer();
    const second = addServer();
    mockedFetch.mockResolvedValue(listResult(routerModelsBody.data, false));
    await serverStore.fetchModelsForServer(second);

    await serverStore.openRouterStream(first);
    await serverStore.openRouterStream(second);

    expect(serverStore.routerStream?.serverId).toBe(second);
  });

  it('opens no second stream for a close it asked for itself', async () => {
    const id = await routerServer();
    await openOn(id);

    serverStore.closeRouterStream();
    await flush();

    expect(mockedOpenStream).toHaveBeenCalledTimes(1);
    expect(serverStore.routerStream).toBeNull();
  });

  it('reopens a stream that ended without being asked to', async () => {
    const id = await routerServer();
    await openOn(id);

    endStream();
    await settleReopen();

    expect(mockedOpenStream).toHaveBeenCalledTimes(2);
  });

  // React Native maps `xhr.timeout = 0` onto Foundation's 60-second idle
  // default on iOS, so a stream that merely went quiet ends as an error with
  // no status. Reopening only on a clean end never reconnects on that platform.
  it('reopens after a transport ending that carries no status', async () => {
    const id = await routerServer();
    await openOn(id);

    endStream(new RouterStreamError('Stream timed out'));
    await settleReopen();

    expect(mockedOpenStream).toHaveBeenCalledTimes(2);
  });

  it('does not reopen after a refusal that would only be refused again', async () => {
    const id = await routerServer();
    await openOn(id);

    endStream(streamErrorFrom('sse-unauthorized-401.txt'));
    await settleReopen();

    expect(mockedOpenStream).toHaveBeenCalledTimes(1);
  });

  // The release lands after the stream ended and before the reopen it
  // scheduled — the window the transport split made the ordinary one, and the
  // one the release above never enters because it closes the stream itself.
  it('cancels a reopen the release lands in the middle of', async () => {
    const id = await routerServer();
    await openOn(id);

    endStream();
    serverStore.releaseRouterStream(id);
    await settleReopen();

    expect(mockedOpenStream).toHaveBeenCalledTimes(1);
    expect(serverStore.routerStream).toBeNull();
  });

  it('opens nothing further once the server is released', async () => {
    const id = await routerServer();
    await openOn(id);

    serverStore.releaseRouterStream(id);
    endStream();
    await settleReopen();

    expect(mockedOpenStream).toHaveBeenCalledTimes(1);
    expect(serverStore.routerStream).toBeNull();
  });

  // Two callers reaching the guard while the first is still reading the
  // Keychain would each open a request, and only the later handle would be
  // held — leaving a token-bearing connection no close could ever reach.
  it('opens one request when two callers ask at once', async () => {
    const id = await routerServer();
    mockedOpenStream.mockClear();
    openedStreams.length = 0;

    await Promise.all([
      serverStore.openRouterStream(id),
      serverStore.openRouterStream(id),
    ]);

    expect(mockedOpenStream).toHaveBeenCalledTimes(1);
  });

  it('writes the overlay from the captured load stream', async () => {
    const id = await routerServer();

    for (const event of routerWireEvents('sse-load-sequence.txt')) {
      serverStore.applyRouterEvent(id, event);
    }

    expect(serverStore.routerLive(id, 'alpha')?.exitCode).toBe(0);
  });

  /** An operation of ours on some other model, which is what asks for room. */
  const putOpAt = (id: string, model: string, kind: RouterOp['kind']) =>
    runInAction(() => {
      serverStore.routerOps[`${id}/${model}`] = {
        kind,
        attempt: 1,
        phase: 'requested',
        serverId: id,
        key: `${id}/${model}`,
        startedAt: Date.now(),
        requestSeq: 0,
        lastEvidenceAt: Date.now(),
      };
    });

  const goesUnloaded = (id: string, model: string) =>
    serverStore.applyRouterEvent(id, {
      model,
      event: 'status_change',
      data: {status: 'unloaded'},
    });

  it('turns the eviction note on for a model released to make room', async () => {
    const id = await routerServer();
    putOpAt(id, UNLOADED_TARGET, 'load');

    goesUnloaded(id, TARGET);

    expect(serverStore.routerObservedEviction.has(id)).toBe(true);
  });

  it('does not call our own unload an eviction', async () => {
    const id = await routerServer();
    putOpAt(id, TARGET, 'unload');

    goesUnloaded(id, TARGET);

    expect(serverStore.routerObservedEviction.has(id)).toBe(false);
  });

  // Both of these read identically on the wire to a real eviction, and both
  // appear in the captures, so a note that fires on them is telling the user
  // something untrue about their server every time they load a model.
  it('does not call our own load failing an eviction', async () => {
    const id = await routerServer();
    putOpAt(id, TARGET, 'load');

    goesUnloaded(id, TARGET);

    expect(serverStore.routerObservedEviction.has(id)).toBe(false);
  });

  it('does not call an idle exit with nothing in flight an eviction', async () => {
    const id = await routerServer();

    goesUnloaded(id, TARGET);

    expect(serverStore.routerObservedEviction.has(id)).toBe(false);
  });

  it('drops every belief about a server on models_reload', async () => {
    const id = await routerServer();
    serverStore.applyRouterEvent(id, {
      model: 'alpha',
      event: 'status_change',
      data: {status: 'loading'},
    });

    serverStore.applyRouterEvent(id, {model: '*', event: 'models_reload'});

    expect(serverStore.routerLive(id, 'alpha')).toBeUndefined();
  });

  it('reconciles on a terminal-looking event and not on a progress tick', async () => {
    const id = await routerServer();
    mockedFetch.mockClear();

    serverStore.applyRouterEvent(id, firstProgressEvent());
    await flush();
    expect(mockedFetch).not.toHaveBeenCalled();

    serverStore.applyRouterEvent(id, {
      model: 'alpha',
      event: 'status_change',
      data: {status: 'loaded'},
    });
    await flush();
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });
});

describe('a peer that ends every stream it opens', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    installStreamHandle();
    jest.useFakeTimers();
    resetStore();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('is reconnected to at a bounded rate rather than as fast as it answers', async () => {
    const id = addServer();
    mockedFetch.mockResolvedValue(listResult(routerModelsBody.data, false));
    await serverStore.fetchModelsForServer(id);
    await serverStore.openRouterStream(id);

    for (let attempt = 0; attempt < 20; attempt++) {
      endStream();
      await flush();
      jest.advanceTimersByTime(ROUTER_RECONNECT_BACKOFF_MS);
      await flush();
    }

    expect(mockedOpenStream.mock.calls.length).toBeLessThanOrEqual(
      ROUTER_RECONNECT_MAX + 1,
    );
  });
});

describe('leaving and returning to the foreground', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    installStreamHandle();
    jest.useFakeTimers();
    resetStore();
    mockedRouterDownload.mockResolvedValue({
      status: 200,
      body: {success: true},
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    appStateChanged('active');
  });

  const busyRouter = async () => {
    const id = addServer();
    mockedFetch.mockResolvedValue(listResult(routerModelsBody.data, false));
    await serverStore.fetchModelsForServer(id);
    await serverStore.startRouterDownload(id, 'owner/repo:Q4_K_M');
    await serverStore.openRouterStream(id);
    return id;
  };

  it('asks the list before it opens anything on the way back', async () => {
    const id = await busyRouter();

    appStateChanged('background');
    expect(serverStore.routerStream).toBeNull();

    mockedFetch.mockClear();
    mockedOpenStream.mockClear();
    openedStreams.length = 0;
    // The event that would have said the load finished may have arrived while
    // the stream was shut. Asking answers; waiting for a past event does not.
    let streamsOpenWhenAsked = -1;
    mockedFetch.mockImplementation(async () => {
      streamsOpenWhenAsked = openedStreams.length;
      return listResult(routerModelsBody.data, false);
    });

    appStateChanged('active');
    await flush();

    expect(mockedFetch).toHaveBeenCalled();
    expect(streamsOpenWhenAsked).toBe(0);
    expect(mockedOpenStream).toHaveBeenCalledTimes(1);
    expect(serverStore.routerStream?.serverId).toBe(id);
  });

  // The bounds measure how long this app has failed to ask. A backgrounded app
  // was not failing to ask, and charging it settles a model that is still
  // loading as failed the moment the user comes back.
  it('does not charge time in the background against the reach bound', async () => {
    const id = await busyRouter();
    const key = `${id}/owner/repo:Q4_K_M`;
    runInAction(() => {
      serverStore.routerOps[key].verdictRequested = true;
    });
    mockedFetch.mockRejectedValue(new Error('unreachable'));

    appStateChanged('background');
    jest.advanceTimersByTime(ROUTER_UNREACHABLE_MS * 2);
    appStateChanged('active');
    await flush();

    await advance(ROUTER_TICK_MS * 3);
    expect(serverStore.routerOp(id, 'owner/repo:Q4_K_M')).toBeDefined();

    await advance(ROUTER_UNREACHABLE_MS + ROUTER_TICK_MS);
    expect(serverStore.routerOp(id, 'owner/repo:Q4_K_M')).toBeUndefined();
    expect(serverStore.routerReason(id, 'owner/repo:Q4_K_M')).toEqual({
      cause: 'server-unreachable',
    });
  });
});

describe('the poll tier', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    installStreamHandle();
    jest.useFakeTimers();
    resetStore();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const routerServer = async () => {
    const id = addServer();
    mockedFetch.mockResolvedValue(listResult(routerModelsBody.data, false));
    await serverStore.fetchModelsForServer(id);
    return id;
  };

  const inFlightOp = (serverId: string, kind: 'load' | 'download') =>
    runInAction(() => {
      serverStore.routerOps[`${serverId}/alpha`] = {
        kind,
        attempt: 1,
        phase: 'requested',
        serverId,
        key: `${serverId}/alpha`,
        startedAt: Date.now(),
        requestSeq: 0,
        lastEvidenceAt: Date.now(),
      };
      serverStore.syncRouterTiers();
    });

  it('polls a server with work in flight and no stream', async () => {
    const id = await routerServer();
    inFlightOp(id, 'load');
    expect(serverStore.routerPolls.has(id)).toBe(true);

    mockedFetch.mockClear();
    jest.advanceTimersByTime(5000);
    await flush();

    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it('does not poll the server the stream is open on', async () => {
    const id = await routerServer();
    runInAction(() =>
      serverStore.setRouterStream({serverId: id, state: 'open'}),
    );
    inFlightOp(id, 'load');

    expect(serverStore.routerPolls.has(id)).toBe(false);
  });

  it('adds no second source of the model list', async () => {
    const id = await routerServer();
    inFlightOp(id, 'download');

    mockedFetch.mockClear();
    jest.advanceTimersByTime(5000);
    await flush();

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(mockedFetch.mock.calls[0][0]).toBe('http://desktop:8080');
  });

  it('drops the entry once that server has no work left', async () => {
    const id = await routerServer();
    inFlightOp(id, 'load');

    runInAction(() => {
      serverStore.routerOps = {};
      serverStore.syncRouterTiers();
    });

    expect(serverStore.routerPolls.has(id)).toBe(false);
  });

  it('keeps one poll in flight per server', async () => {
    const id = await routerServer();
    inFlightOp(id, 'load');
    mockedFetch.mockClear();
    let release: () => void = () => {};
    mockedFetch.mockImplementation(
      () =>
        new Promise(resolve => {
          release = () => resolve(listResult(routerModelsBody.data, false));
        }),
    );

    jest.advanceTimersByTime(5000);
    await flush();
    jest.advanceTimersByTime(5000);
    await flush();

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    release();
  });
});

describe('loading a model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    installStreamHandle();
    jest.useFakeTimers();
    resetStore();
    mockedRouterLoad.mockResolvedValue({status: 200, body: {success: true}});
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /** Rows exactly as captured, with one model's state overridden. */
  const rowsWith = (id: string, value: string) =>
    routerModelsBody.data.map(row =>
      row.id === id ? {...row, status: {...row.status, value}} : row,
    );

  const routerServer = async (value = 'unloaded') => {
    const serverId = addServer();
    mockedFetch.mockResolvedValue(listResult(rowsWith(TARGET, value), false));
    await serverStore.fetchModelsForServer(serverId);
    jest.advanceTimersByTime(1);
    return serverId;
  };

  const answerWith = (value: string) =>
    mockedFetch.mockResolvedValue(listResult(rowsWith(TARGET, value), false));

  it('returns not-router without a request on a server with no evidence', async () => {
    const id = addServer();
    mockedFetch.mockResolvedValue(listResult(directTextModelsBody.data, true));
    await serverStore.fetchModelsForServer(id);

    await expect(serverStore.ensureRouterModelLoaded(id, TARGET)).resolves.toBe(
      'not-router',
    );
    expect(mockedRouterLoad).not.toHaveBeenCalled();
  });

  it('returns ready without a request when the model is already loaded', async () => {
    const id = await routerServer('loaded');

    await expect(serverStore.ensureRouterModelLoaded(id, TARGET)).resolves.toBe(
      'ready',
    );
    expect(mockedRouterLoad).not.toHaveBeenCalled();
  });

  it('posts once however many callers ask', async () => {
    const id = await routerServer();

    const first = serverStore.ensureRouterModelLoaded(id, TARGET);
    const second = serverStore.ensureRouterModelLoaded(id, TARGET);
    await flush();
    answerWith('loaded');
    await reconcile(id);

    await expect(first).resolves.toBe('ready');
    await expect(second).resolves.toBe('ready');
    expect(mockedRouterLoad).toHaveBeenCalledTimes(1);
  });

  it('does not settle on the response that accepted the request', async () => {
    const id = await routerServer();

    const pending = serverStore.ensureRouterModelLoaded(id, TARGET);
    await flush();

    expect(serverStore.routerOp(id, TARGET)?.phase).toBe('requested');
    expect(serverStore.routerRowState(id, TARGET)).toBe('unloaded');

    answerWith('loaded');
    await reconcile(id);
    await expect(pending).resolves.toBe('ready');
  });

  it('settles ready off a loaded row, never off the operation succeeding', async () => {
    const id = await routerServer();
    const pending = serverStore.ensureRouterModelLoaded(id, TARGET);
    await flush();

    jest.advanceTimersByTime(1);
    serverStore.applyRouterEvent(id, {
      ...firstProgressEvent(),
      model: TARGET,
    });
    expect(serverStore.routerLive(id, TARGET)?.progress?.value).toBe(0);
    expect(serverStore.routerRowState(id, TARGET)).toBe('unloaded');

    answerWith('loaded');
    await reconcile(id);

    await expect(pending).resolves.toBe('ready');
    expect(serverStore.routerOp(id, TARGET)).toBeUndefined();
  });

  // A request that never arrived says nothing about the model, so reporting
  // that it did not load would be a claim this app cannot support.
  it('blames the reach, not the model, when the request never arrived', async () => {
    const id = await routerServer();
    mockedRouterLoad.mockRejectedValueOnce(new Error('Connection timed out'));

    await expect(serverStore.ensureRouterModelLoaded(id, TARGET)).resolves.toBe(
      'failed',
    );
    expect(serverStore.routerReason(id, TARGET)).toEqual({
      cause: 'server-unreachable',
      message: 'Connection timed out',
    });
  });

  it('settles failed off the row that says so, after the request was accepted', async () => {
    const id = await routerServer();
    const pending = serverStore.ensureRouterModelLoaded(id, TARGET);
    await flush();

    mockedFetch.mockResolvedValue(
      listResult(
        routerModelsBody.data.map(row =>
          row.id === TARGET
            ? // Constructed: no capture holds a row after a failed load, only
              // the SSE transition that accompanies one.
              {...row, status: {value: 'unloaded', failed: true, exit_code: 1}}
            : row,
        ),
        false,
      ),
    );
    jest.advanceTimersByTime(ROUTER_ACK_MS + 2000);
    await flush();

    await expect(pending).resolves.toBe('failed');
    expect(serverStore.routerRowState(id, TARGET)).toBe('failed');
  });

  // The stream is corroboration, not authority. Losing it costs the progress
  // fraction; a load still running on the desktop must not be called failed
  // because this phone stopped hearing about it.
  it('settles nothing when the stream drops under a running load', async () => {
    const id = await routerServer();
    mockedOpenStream.mockClear();
    await serverStore.openRouterStream(id);
    const handlers = mockedOpenStream.mock.calls[0]?.[2];

    const pending = serverStore.ensureRouterModelLoaded(id, TARGET);
    await flush();
    answerWith('loading');
    jest.advanceTimersByTime(ROUTER_ACK_MS + 2000);
    await flush();

    // A clean close carries no error — the drop no reconnect can distinguish.
    handlers.onClose(undefined);
    jest.advanceTimersByTime(ROUTER_EVIDENCE_MS + ROUTER_POLL_MS);
    await flush();

    expect(serverStore.routerOp(id, TARGET)).toBeDefined();
    expect(serverStore.routerReason(id, TARGET)).toBeUndefined();

    // And the row, once it moves, is still what settles it.
    answerWith('loaded');
    await reconcile(id);
    await expect(pending).resolves.toBe('ready');
  });

  it('leaves a load in flight while the row still says loading', async () => {
    const id = await routerServer();
    const pending = serverStore.ensureRouterModelLoaded(id, TARGET);
    await flush();

    answerWith('loading');
    jest.advanceTimersByTime(ROUTER_ACK_MS + 2000);
    await flush();
    expect(serverStore.routerOp(id, TARGET)?.phase).toBe('active');

    jest.advanceTimersByTime(ROUTER_EVIDENCE_MS + 2000);
    await flush();
    expect(serverStore.routerOp(id, TARGET)).toBeDefined();

    answerWith('loaded');
    await reconcile(id);
    await expect(pending).resolves.toBe('ready');
  });

  it('settles ready and says nothing when the model is already resident', async () => {
    const id = await routerServer('sleeping');
    mockedRouterLoad.mockResolvedValueOnce({
      status: 400,
      body: routerWireJson('unload-not-running-400.json'),
    });

    await expect(serverStore.ensureRouterModelLoaded(id, TARGET)).resolves.toBe(
      'ready',
    );
    expect(serverStore.routerReason(id, TARGET)).toBeUndefined();
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  // Both of these put an event and the row in opposition, with the row's fetch
  // still in flight. An event is what the screen shows and never what settles
  // or gates an operation: resolving either off one reports a load that did
  // not happen as ready.
  it('resolves a refusal off the row, never off the event beside it', async () => {
    const id = await routerServer();
    let refuse: (answer: unknown) => void = () => {};
    mockedRouterLoad.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          refuse = resolve;
        }),
    );
    const pending = serverStore.ensureRouterModelLoaded(id, TARGET);
    await flush();

    mockedFetch.mockImplementation(() => new Promise(() => {}));
    jest.advanceTimersByTime(1);
    serverStore.applyRouterEvent(id, {
      model: TARGET,
      event: 'status_change',
      data: {status: 'sleeping'},
    });

    refuse({status: 400, body: {error: {message: 'no free slot'}}});
    await flush();

    expect(serverStore.routerOp(id, TARGET)?.reason).toBe('no free slot');
    expect(pending).toBeDefined();
  });

  it('gates a load on the row, never on the event beside it', async () => {
    const id = await routerServer();

    mockedFetch.mockImplementation(() => new Promise(() => {}));
    jest.advanceTimersByTime(1);
    serverStore.applyRouterEvent(id, {
      model: TARGET,
      event: 'status_change',
      data: {status: 'loaded'},
    });

    serverStore.ensureRouterModelLoaded(id, TARGET);
    await flush();

    expect(mockedRouterLoad).toHaveBeenCalledTimes(1);
  });

  it('carries the server reason when a refusal is not about residency', async () => {
    const id = await routerServer();
    mockedRouterLoad.mockResolvedValueOnce({
      status: 500,
      body: {error: {message: 'failed to allocate'}},
    });

    await expect(serverStore.ensureRouterModelLoaded(id, TARGET)).resolves.toBe(
      'failed',
    );
    expect(serverStore.routerReason(id, TARGET)).toEqual({
      cause: 'load-failed',
      message: 'failed to allocate',
    });
  });

  it('settles failed when the server could not be reached at all', async () => {
    const id = await routerServer();
    mockedFetch.mockRejectedValue(new Error('Network request failed'));
    const pending = serverStore.ensureRouterModelLoaded(id, TARGET);
    await flush();

    jest.advanceTimersByTime(ROUTER_UNREACHABLE_MS + ROUTER_ACK_MS);
    await flush();

    await expect(pending).resolves.toBe('failed');
  });

  // The send path awaits this promise before it starts inferring, so an
  // operation left unresolved is a chat that hangs with no error and no
  // spinner. Every operation settles, a superseded one included.
  // The row goes on saying `loading` and the list goes on answering, so the
  // reach bound never applies and every healthy read re-arms the watchdog. The
  // send path is waiting on this promise, and a chat that hangs with no error
  // and no spinner is the one outcome the gate must not produce.
  it('settles a load the row never moves off loading', async () => {
    const id = await routerServer();
    const pending = serverStore.ensureRouterModelLoaded(id, TARGET);
    await flush();
    answerWith('loading');
    await reconcile(id);

    await advance(ROUTER_LOAD_MAX_MS + ROUTER_TICK_MS);

    expect(serverStore.routerOp(id, TARGET)).toBeUndefined();
    await expect(pending).resolves.toBe('failed');
  });

  // Stopping it is a withdrawal, not a verdict: nothing is surfaced, and the
  // caller waiting on the promise is answered rather than left there.
  it('settles a load the user stopped, with nothing surfaced', async () => {
    mockedRouterUnload.mockResolvedValue({status: 200, body: {success: true}});
    const id = await routerServer();
    const pending = serverStore.ensureRouterModelLoaded(id, TARGET);
    await flush();
    answerWith('loading');
    await reconcile(id);

    await serverStore.cancelRouterOp(id, TARGET);
    await flush();

    expect(serverStore.routerOp(id, TARGET)).toBeUndefined();
    expect(serverStore.routerReason(id, TARGET)).toBeUndefined();
    await expect(pending).resolves.toBe('withdrawn');
  });

  // A load in flight is the operation's to present, and the operation is gone.
  // Nothing it left behind may go on saying the model is loading, and nothing
  // it left behind may count the model as resident.
  it('leaves a settled operation claiming nothing about the model', async () => {
    const id = await routerServer();
    let fail: (error: unknown) => void = () => {};
    mockedRouterLoad.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    const pending = serverStore.ensureRouterModelLoaded(id, TARGET);
    await flush();

    jest.advanceTimersByTime(1);
    serverStore.applyRouterEvent(id, {...firstProgressEvent(), model: TARGET});
    const whileLoading = serverStore.routerResidentCount(id);

    fail(new Error('Network request failed'));
    await expect(pending).resolves.toBe('failed');

    expect(serverStore.routerReason(id, TARGET)).toEqual({
      cause: 'server-unreachable',
      message: 'Network request failed',
    });
    expect(serverStore.routerRowState(id, TARGET)).toBe('unloaded');
    expect(serverStore.routerResidentCount(id)).toBe(whileLoading);
  });

  it('settles a load that a second operation on the same model supersedes', async () => {
    const id = await routerServer();
    const load = serverStore.ensureRouterModelLoaded(id, UNLOADED_TARGET);
    await flush();

    await serverStore.unloadRouterModel(id, UNLOADED_TARGET);

    await expect(load).resolves.toBe('failed');
  });

  // A chat activation opens the stream with no picker on screen, so nothing
  // else is holding it: one message would otherwise buy a token-bearing socket
  // for the life of the process, reopened on every foreground.
  it('closes the stream its own operation opened once that operation settles', async () => {
    const id = await routerServer();
    const pending = serverStore.ensureRouterModelLoaded(id, TARGET);
    await flush();
    expect(serverStore.routerStream?.serverId).toBe(id);

    answerWith('loaded');
    await reconcile(id);
    await expect(pending).resolves.toBe('ready');

    expect(serverStore.routerStream).toBeNull();
  });

  it('drops the poll entry once the load settles', async () => {
    const id = await routerServer();
    const pending = serverStore.ensureRouterModelLoaded(id, TARGET);
    await flush();
    expect(serverStore.routerPolls.has(id)).toBe(true);

    answerWith('loaded');
    await serverStore.fetchModelsForServer(id);
    await pending;

    expect(serverStore.routerPolls.has(id)).toBe(false);
  });
});

describe('one presenter at a time', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    installStreamHandle();
    jest.useFakeTimers();
    resetStore();
    mockedRouterLoad.mockResolvedValue({status: 200, body: {success: true}});
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const rowsWith = (value: string) =>
    routerModelsBody.data.map(row =>
      row.id === TARGET ? {...row, status: {...row.status, value}} : row,
    );

  const answerWith = (value: string) =>
    mockedFetch.mockResolvedValue(listResult(rowsWith(value), false));

  const routerServer = async (value = 'unloaded') => {
    const serverId = addServer();
    answerWith(value);
    await serverStore.fetchModelsForServer(serverId);
    jest.advanceTimersByTime(1);
    return serverId;
  };

  const residentRowsIn = (value: string) =>
    rowsWith(value).filter(
      row => row.status.value === 'loaded' || row.status.value === 'sleeping',
    ).length;

  it('reads the row and not the event, however recent the event is', async () => {
    const id = await routerServer('unloaded');
    jest.advanceTimersByTime(1);

    serverStore.applyRouterEvent(id, {
      model: TARGET,
      event: 'status_change',
      data: {status: 'loaded'},
    });

    expect(serverStore.routerRowState(id, TARGET)).toBe('unloaded');
  });

  it('leaves no status on the overlay for any surface to read', async () => {
    const id = await routerServer('unloaded');

    serverStore.applyRouterEvent(id, {...firstProgressEvent(), model: TARGET});

    expect(serverStore.routerLive(id, TARGET)).not.toHaveProperty('status');
  });

  // The device capture: the desktop stopped answering while the row said
  // loading, and the row went on saying it under the note that the server
  // could not be reached.
  it('makes no claim for a row the last fetch could not refresh', async () => {
    const id = await routerServer('loading');
    mockedFetch.mockRejectedValue(new Error('Network request failed'));

    await serverStore.fetchModelsForServer(id);

    expect(serverStore.routerOp(id, TARGET)).toBeUndefined();
    expect(serverStore.routerRowState(id, TARGET)).toBe('unknown');
  });

  it('believes the row again as soon as a fetch succeeds', async () => {
    const id = await routerServer('loading');
    mockedFetch.mockRejectedValue(new Error('Network request failed'));
    await serverStore.fetchModelsForServer(id);

    answerWith('loading');
    await serverStore.fetchModelsForServer(id);

    expect(serverStore.routerRowState(id, TARGET)).toBe('loading');
  });

  it('counts only the models the server is holding as resident', async () => {
    const id = await routerServer('loading');

    expect(serverStore.routerResidentCount(id)).toBe(residentRowsIn('loading'));
  });

  // Ten minutes is a fact about how long this app waited, and the desktop may
  // still be loading — but a message is on screen waiting for an answer, so
  // the end of the wait is itself news. What it may not do is blame the model.
  it('says the wait stopped when it ends with the row still loading', async () => {
    const id = await routerServer('unloaded');
    const pending = serverStore.ensureRouterModelLoaded(id, TARGET);
    await flush();
    answerWith('loading');
    await reconcile(id);

    await advance(ROUTER_LOAD_MAX_MS + ROUTER_TICK_MS);

    await expect(pending).resolves.toBe('failed');
    expect(serverStore.routerOp(id, TARGET)).toBeUndefined();
    expect(serverStore.routerReason(id, TARGET)).toEqual({
      cause: 'wait-stopped',
    });
  });

  it('leaves no detail from a settled attempt for the next one', async () => {
    const id = await routerServer('unloaded');
    const first = serverStore.ensureRouterModelLoaded(id, TARGET);
    await flush();
    jest.advanceTimersByTime(1);
    serverStore.applyRouterEvent(id, {...firstProgressEvent(), model: TARGET});
    expect(serverStore.routerLive(id, TARGET)?.progress).toBeDefined();

    answerWith('loaded');
    await reconcile(id);
    await expect(first).resolves.toBe('ready');

    answerWith('unloaded');
    await reconcile(id);
    serverStore.ensureRouterModelLoaded(id, TARGET);
    await flush();

    // A bar reading the last attempt's fraction opens the next one part-way
    // through, and a fresh failure reads the previous exit code.
    expect(serverStore.routerLive(id, TARGET)).toBeUndefined();
  });

  it('says nothing about a server for a request the user withdrew', async () => {
    mockedRouterUnload.mockResolvedValue({status: 200, body: {success: true}});
    const id = await routerServer('unloaded');
    const pending = serverStore.ensureRouterModelLoaded(id, TARGET);
    await flush();
    mockedFetch.mockRejectedValue(new Error('Network request failed'));

    await serverStore.cancelRouterOp(id, TARGET);
    await advance(ROUTER_UNREACHABLE_MS + ROUTER_ACK_MS);

    await expect(pending).resolves.toBe('failed');
    expect(serverStore.routerOp(id, TARGET)).toBeUndefined();
    expect(serverStore.routerReason(id, TARGET)).toBeUndefined();
  });

  // A read already in flight when the request went out can only report the
  // state from before it, which is not this request's answer in either
  // direction.
  it('does not settle ready off a list read that began before the request', async () => {
    const id = await routerServer('unloaded');
    let answerOld: (value: unknown) => void = () => {};
    mockedFetch.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          answerOld = resolve;
        }),
    );
    const older = serverStore.fetchModelsForServer(id);
    const pending = serverStore.ensureRouterModelLoaded(id, TARGET);
    await flush();

    answerOld(listResult(rowsWith('loaded'), false));
    await older;
    await flush();

    expect(serverStore.routerOp(id, TARGET)).toBeDefined();

    answerWith('loaded');
    await reconcile(id);
    await expect(pending).resolves.toBe('ready');
  });

  // The other way a row reads `unknown`: a build whose status value this one
  // cannot read. The settle path reaches it with no watchdog ceiling involved,
  // so what protects the record here is the row, not a timing relationship.
  it('records nothing when it cannot read the row it settles on', async () => {
    const id = await routerServer('unloaded');
    const pending = serverStore.ensureRouterModelLoaded(id, TARGET);
    await flush();

    answerWith('quiescing');
    jest.advanceTimersByTime(ROUTER_ACK_MS + 2000);
    await flush();

    await expect(pending).resolves.toBe('failed');
    expect(serverStore.routerRowState(id, TARGET)).toBe('unknown');
    expect(serverStore.routerReason(id, TARGET)).toBeUndefined();
  });

  // Two reads of one server overlap: the tiers hold separate in-flight guards,
  // and the foreground path fires two in the same tick. Whichever answers last
  // is not thereby the one that answered.
  it('does not let an overtaken read that failed discredit the list', async () => {
    const id = await routerServer('loaded');
    let failSlow: (error: unknown) => void = () => {};
    mockedFetch.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          failSlow = reject;
        }),
    );
    const slow = serverStore.fetchModelsForServer(id);
    answerWith('loaded');
    await serverStore.fetchModelsForServer(id);

    failSlow(new Error('Network request failed'));
    await slow;

    expect(serverStore.routerRowState(id, TARGET)).toBe('loaded');
    expect(serverStore.routerResidentCount(id)).toBe(residentRowsIn('loaded'));
  });

  it('does not let an overtaken read that succeeded install an older list', async () => {
    const id = await routerServer('unloaded');
    let answerSlow: (value: unknown) => void = () => {};
    mockedFetch.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          answerSlow = resolve;
        }),
    );
    const slow = serverStore.fetchModelsForServer(id);
    answerWith('loaded');
    await serverStore.fetchModelsForServer(id);

    answerSlow(listResult(rowsWith('unloaded'), false));
    await slow;

    expect(serverStore.routerRowState(id, TARGET)).toBe('loaded');
  });

  // Two routes reach the failure branch with a row that reads `loaded`, and
  // both were rendering "Loaded", an Unload button and "This model did not
  // load." together. An uncorroborated success means keep waiting.
  it('does not call a loaded row a failure when an event marked the op active', async () => {
    const id = await routerServer('unloaded');
    let answerOld: (value: unknown) => void = () => {};
    mockedFetch.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          answerOld = resolve;
        }),
    );
    const older = serverStore.fetchModelsForServer(id);
    serverStore.ensureRouterModelLoaded(id, TARGET);
    await flush();
    serverStore.applyRouterEvent(id, {
      model: TARGET,
      event: 'status_change',
      data: {status: 'loading'},
    });

    answerOld(listResult(rowsWith('loaded'), false));
    await older;
    await flush();

    expect(serverStore.routerReason(id, TARGET)).toBeUndefined();
    expect(serverStore.routerOp(id, TARGET)).toBeDefined();
  });

  it('does not call a loaded row a failure when a refusal asked for a verdict', async () => {
    const id = await routerServer('unloaded');
    let answerOld: (value: unknown) => void = () => {};
    mockedFetch.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          answerOld = resolve;
        }),
    );
    const older = serverStore.fetchModelsForServer(id);
    mockedRouterLoad.mockResolvedValueOnce({
      status: 400,
      body: {error: {message: 'model already loaded'}},
    });
    mockedFetch.mockRejectedValue(new Error('Network request failed'));
    serverStore.ensureRouterModelLoaded(id, TARGET);
    await flush();
    expect(serverStore.routerOp(id, TARGET)?.verdictRequested).toBe(true);

    answerOld(listResult(rowsWith('loaded'), false));
    await older;
    await flush();

    expect(serverStore.routerReason(id, TARGET)).toBeUndefined();
  });

  // An operation is identified by its attempt, not by the key it sits on: a
  // request that has already been replaced is answering about something the
  // store is no longer tracking.
  it('does not let a superseded load settle the operation that replaced it', async () => {
    const id = await routerServer('sleeping');
    let failLoad: (error: unknown) => void = () => {};
    mockedRouterLoad.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          failLoad = reject;
        }),
    );
    const load = serverStore.ensureRouterModelLoaded(id, TARGET);
    await flush();
    mockedRouterUnload.mockResolvedValue({status: 200, body: {success: true}});
    serverStore.unloadRouterModel(id, TARGET);
    await flush();
    expect(serverStore.routerOp(id, TARGET)?.kind).toBe('unload');

    failLoad(new Error('Network request failed'));
    await load;
    await flush();

    expect(serverStore.routerOp(id, TARGET)?.kind).toBe('unload');
    expect(serverStore.routerReason(id, TARGET)).toBeUndefined();
  });

  it('does not let a superseded load report the operation that replaced it ready', async () => {
    const id = await routerServer('sleeping');
    let refuse: (value: unknown) => void = () => {};
    mockedRouterLoad.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          refuse = resolve;
        }),
    );
    const load = serverStore.ensureRouterModelLoaded(id, TARGET);
    await flush();
    mockedRouterUnload.mockResolvedValue({status: 200, body: {success: true}});
    serverStore.unloadRouterModel(id, TARGET);
    await flush();

    refuse({status: 400, body: {error: {message: 'model is already running'}}});
    await load;
    await flush();

    // The row still says the model is resident, so the unload has converged
    // on nothing and must still be in flight.
    expect(serverStore.routerOp(id, TARGET)?.kind).toBe('unload');
  });

  it('still blames the model when the row it settles on says it failed', async () => {
    const id = await routerServer('unloaded');
    const pending = serverStore.ensureRouterModelLoaded(id, TARGET);
    await flush();
    mockedFetch.mockResolvedValue(
      listResult(
        routerModelsBody.data.map(row =>
          row.id === TARGET
            ? {...row, status: {value: 'unloaded', failed: true, exit_code: 1}}
            : row,
        ),
        false,
      ),
    );

    await advance(ROUTER_LOAD_MAX_MS + ROUTER_TICK_MS);

    await expect(pending).resolves.toBe('failed');
    expect(serverStore.routerReason(id, TARGET)?.cause).toBe('load-failed');
  });
});

describe('unloading a model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    installStreamHandle();
    jest.useFakeTimers();
    resetStore();
    mockedRouterUnload.mockResolvedValue({status: 200, body: {success: true}});
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const rowsWith = (id: string, value: string) =>
    routerModelsBody.data.map(row =>
      row.id === id ? {...row, status: {...row.status, value}} : row,
    );

  const answerWith = (value: string) =>
    mockedFetch.mockResolvedValue(listResult(rowsWith(TARGET, value), false));

  const routerServer = async (value = 'loaded') => {
    const serverId = addServer();
    answerWith(value);
    await serverStore.fetchModelsForServer(serverId);
    jest.advanceTimersByTime(1);
    return serverId;
  };

  // The row lags after every unload, the correct ones included.
  it('settles nothing while the row still reads loaded', async () => {
    const id = await routerServer('loaded');

    const pending = serverStore.unloadRouterModel(id, TARGET);
    await flush();
    await reconcile(id);

    expect(serverStore.routerOp(id, TARGET)).toBeDefined();
    expect(serverStore.routerRowState(id, TARGET)).toBe('loaded');

    answerWith('unloaded');
    await reconcile(id);
    await expect(pending).resolves.toBe('ready');
  });

  it.each([
    ['already unloaded', 'unload-not-running-400.json'],
    ['unknown to the server', 'unload-not-found-400.json'],
  ])('settles success and says nothing for a model %s', async (_l, capture) => {
    const id = await routerServer('loaded');
    mockedRouterUnload.mockResolvedValueOnce({
      status: 400,
      body: routerWireJson(capture as any),
    });
    answerWith('unloaded');

    await expect(serverStore.unloadRouterModel(id, TARGET)).resolves.toBe(
      'ready',
    );
    expect(serverStore.routerReason(id, TARGET)).toBeUndefined();
  });

  it('settles failed once the bound passes with the model still held', async () => {
    const id = await routerServer('loaded');
    const pending = serverStore.unloadRouterModel(id, TARGET);
    await flush();

    jest.advanceTimersByTime(ROUTER_UNLOAD_SETTLE_MS + 2000);
    await flush();

    await expect(pending).resolves.toBe('failed');
    expect(serverStore.routerReason(id, TARGET)).toEqual({
      cause: 'unload-not-released',
    });
    // Never offered as free while the server still holds it.
    expect(serverStore.routerRowState(id, TARGET)).toBe('loaded');
    expect(serverStore.routerPolls.has(id)).toBe(false);
  });

  // A row this build cannot read is not an unconverged row either. The bound
  // settled on `hasReconciledSince` alone, which proves a fetch succeeded after
  // the request and says nothing at all about what it found.
  it('records nothing at the bound when it cannot read the row', async () => {
    const id = await routerServer('loaded');
    const pending = serverStore.unloadRouterModel(id, TARGET);
    await flush();
    answerWith('quiescing');
    await reconcile(id);

    jest.advanceTimersByTime(ROUTER_UNLOAD_SETTLE_MS + 2000);
    await flush();

    await expect(pending).resolves.toBe('failed');
    expect(serverStore.routerRowState(id, TARGET)).toBe('unknown');
    expect(serverStore.routerReason(id, TARGET)).toBeUndefined();
  });

  // The same state by its other route: the list was read successfully once
  // after the request, and every read since has failed, so the row it left
  // behind is not one the app may say the server is still holding.
  it('records nothing at the bound when the list went stale after it', async () => {
    const id = await routerServer('loaded');
    const pending = serverStore.unloadRouterModel(id, TARGET);
    await flush();
    await reconcile(id);
    mockedFetch.mockRejectedValue(new Error('Network request failed'));
    await serverStore.fetchModelsForServer(id);

    await advance(ROUTER_UNLOAD_SETTLE_MS + ROUTER_TICK_MS);

    await expect(pending).resolves.toBe('failed');
    expect(serverStore.routerRowState(id, TARGET)).toBe('unknown');
    expect(serverStore.routerReason(id, TARGET)).toBeUndefined();
  });

  // A row nobody managed to re-read is not an unconverged row.
  it('does not settle failed at the bound when the reconcile failed', async () => {
    const id = await routerServer('loaded');
    mockedFetch.mockRejectedValue(new Error('Network request failed'));
    const pending = serverStore.unloadRouterModel(id, TARGET);
    await flush();

    jest.advanceTimersByTime(ROUTER_UNLOAD_SETTLE_MS + 2000);
    await flush();

    expect(serverStore.routerOp(id, TARGET)).toBeDefined();

    mockedFetch.mockClear();
    answerWith('unloaded');
    jest.advanceTimersByTime(ROUTER_POLL_MS + 1000);
    await flush();
    await expect(pending).resolves.toBe('ready');
  });

  it('settles every unload, so nothing polls forever', async () => {
    const id = await routerServer('loaded');
    mockedFetch.mockRejectedValue(new Error('Network request failed'));
    const pending = serverStore.unloadRouterModel(id, TARGET);
    await flush();

    jest.advanceTimersByTime(ROUTER_UNREACHABLE_MS + ROUTER_UNLOAD_SETTLE_MS);
    await flush();

    await expect(pending).resolves.toBe('failed');
    expect(serverStore.routerPolls.has(id)).toBe(false);
  });

  it('reads an unload the opposite way round from a load', async () => {
    const id = await routerServer('loaded');
    const pending = serverStore.unloadRouterModel(id, TARGET);
    await flush();

    await reconcile(id);

    expect(serverStore.routerOp(id, TARGET)?.kind).toBe('unload');
    jest.advanceTimersByTime(ROUTER_UNLOAD_SETTLE_MS + 2000);
    await flush();
    await expect(pending).resolves.toBe('failed');
  });
});

describe('downloading a model to the server', () => {
  const REFERENCE = 'ggml-org/gemma-3-270m-it-GGUF:Q8_0';
  const NORMALISED = 'ggml-org/gemma-3-270m-it-gguf:q8_0';

  beforeEach(() => {
    jest.clearAllMocks();
    installStreamHandle();
    jest.useFakeTimers();
    resetStore();
    mockedRouterDownload.mockResolvedValue({
      status: 200,
      body: {success: true},
    });
    mockedRouterUnload.mockResolvedValue({status: 200, body: {success: true}});
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const routerServer = async () => {
    const serverId = addServer();
    mockedFetch.mockResolvedValue(listResult(routerModelsBody.data, false));
    await serverStore.fetchModelsForServer(serverId);
    jest.advanceTimersByTime(1);
    return serverId;
  };

  const withDownloadedRow = () =>
    mockedFetch.mockResolvedValue(
      listResult(
        [
          ...routerModelsBody.data,
          {
            id: REFERENCE,
            object: 'model',
            owned_by: 'llamacpp',
            status: {value: 'unloaded'},
          },
        ],
        false,
      ),
    );

  it('posts the reference exactly as typed', async () => {
    const id = await routerServer();

    await serverStore.startRouterDownload(id, REFERENCE);

    expect(mockedRouterDownload.mock.calls[0][1]).toBe(REFERENCE);
  });

  // The server lists nothing for a model it has not finished fetching, so the
  // operation is the only thing that can say the fetch is under way.
  it('leaves the accepted request as the only sign of the download', async () => {
    const id = await routerServer();

    await serverStore.startRouterDownload(id, REFERENCE);

    expect(serverStore.routerOp(id, REFERENCE)?.kind).toBe('download');
    expect(serverStore.routerRowState(id, REFERENCE)).toBe('absent');
  });

  // The picker's rows are the server's plus this app's own business. Without
  // that second half an in-flight fetch has no row, so its Cancel is
  // unreachable and the copy for one that never arrived has nowhere to go.
  it('lists a model it has an operation about that the server does not list', async () => {
    const id = await routerServer();

    await serverStore.startRouterDownload(id, REFERENCE);

    expect(serverStore.routerPickerRows(id).map(row => row.id)).toContain(
      REFERENCE,
    );
  });

  it('lists a model with an unread failure and no row of its own', async () => {
    const id = await routerServer();
    runInAction(() => {
      serverStore.routerReasons[`${id}/${REFERENCE}`] = {
        cause: 'download-not-fetched',
      };
    });

    expect(serverStore.routerPickerRows(id).map(row => row.id)).toContain(
      REFERENCE,
    );
  });

  it('reports a refused request with the server reason and starts nothing', async () => {
    const id = await routerServer();
    mockedRouterDownload.mockResolvedValueOnce({
      status: 404,
      body: routerWireResponseBody('post-models-unregistered-404.txt'),
    });

    const result = await serverStore.startRouterDownload(id, REFERENCE);

    expect(result).toEqual({accepted: false, message: 'File Not Found'});
    expect(serverStore.routerOp(id, REFERENCE)).toBeUndefined();
  });

  // download_finished fires identically for a download that succeeded and one
  // of a repository that does not exist.
  it('settles success on the row appearing, not on the attempt ending', async () => {
    const id = await routerServer();
    await serverStore.startRouterDownload(id, REFERENCE);

    serverStore.applyRouterEvent(id, {
      model: REFERENCE,
      event: 'download_finished',
    });
    await flush();
    expect(serverStore.routerOp(id, REFERENCE)).toBeDefined();

    withDownloadedRow();
    await reconcile(id);

    expect(serverStore.routerOp(id, REFERENCE)).toBeUndefined();
    expect(serverStore.routerRowState(id, REFERENCE)).toBe('unloaded');
    expect(serverStore.routerReason(id, REFERENCE)).toBeUndefined();
  });

  // The terminal event lands well after the request here, so the two stamps
  // genuinely differ: a grace measured from the request would have the event
  // corroborate its own ending and could never be spent at all.
  it('settles failed when nothing ever appears after the attempt ended', async () => {
    const id = await routerServer();
    await serverStore.startRouterDownload(id, REFERENCE);
    await advance(ROUTER_POLL_MS);

    serverStore.applyRouterEvent(id, {
      model: REFERENCE,
      event: 'download_finished',
    });
    await flush();

    await advance(ROUTER_DOWNLOAD_SETTLE_MS + ROUTER_POLL_MS);

    expect(serverStore.routerOp(id, REFERENCE)).toBeUndefined();
    expect(serverStore.routerReason(id, REFERENCE)).toEqual({
      cause: 'download-not-fetched',
    });
    expect(serverStore.routerRowState(id, REFERENCE)).toBe('absent');
  });

  it('holds a download open when something corroborates it after that', async () => {
    const id = await routerServer();
    await serverStore.startRouterDownload(id, REFERENCE);
    await advance(ROUTER_POLL_MS);

    serverStore.applyRouterEvent(id, {
      model: REFERENCE,
      event: 'download_finished',
    });
    await flush();
    await advance(ROUTER_POLL_MS);
    serverStore.applyRouterEvent(id, {
      model: REFERENCE,
      event: 'download_progress',
      data: {progress: {'https://x/y.gguf': {done: 1, total: 2}}},
    });
    await flush();

    await advance(ROUTER_DOWNLOAD_SETTLE_MS + ROUTER_POLL_MS);

    expect(serverStore.routerOp(id, REFERENCE)).toBeDefined();
    expect(serverStore.routerReason(id, REFERENCE)).toBeUndefined();
  });

  it('does not fail a download that is still running and silent', async () => {
    const id = await routerServer();
    await serverStore.startRouterDownload(id, REFERENCE);

    await advance(ROUTER_EVIDENCE_MS * 4);

    expect(serverStore.routerOp(id, REFERENCE)).toBeDefined();
  });

  it('bounds a download nothing ever corroborates', async () => {
    const id = await routerServer();
    await serverStore.startRouterDownload(id, REFERENCE);

    await advance(ROUTER_DOWNLOAD_MAX_MS + ROUTER_POLL_MS);

    expect(serverStore.routerOp(id, REFERENCE)).toBeUndefined();
  });

  it('sums the captured byte map and keeps a first tick of zero', async () => {
    const id = await routerServer();
    await serverStore.startRouterDownload(id, REFERENCE);

    const first = routerWireEvents('sse-download-sequence.txt').find(
      event => event.event === 'download_progress' && event.model === REFERENCE,
    );
    serverStore.applyRouterEvent(id, first);

    expect(serverStore.routerLive(id, REFERENCE)?.bytes).toEqual({
      done: 0,
      total: 291545600,
      urls: 1,
    });
  });

  it('adopts the id the server used when one download is in flight', async () => {
    const id = await routerServer();
    await serverStore.startRouterDownload(id, REFERENCE);

    serverStore.applyRouterEvent(id, {
      model: NORMALISED,
      event: 'download_progress',
      data: {progress: {'https://x/y.gguf': {done: 1, total: 2}}},
    });

    expect(serverStore.routerOp(id, REFERENCE)).toBeUndefined();
    expect(serverStore.routerOp(id, NORMALISED)?.kind).toBe('download');
  });

  // The two above only cover adoption agreeing with the truth or declining.
  // This one puts them in opposition: a transition on an unrelated model is
  // not news of this download, and reading a verdict off that model's row
  // ends the download with the wrong answer and no trace of it.
  it('does not let an unrelated status move a download in flight', async () => {
    const id = await routerServer();
    await serverStore.startRouterDownload(id, REFERENCE);

    serverStore.applyRouterEvent(id, {
      model: TARGET,
      event: 'status_change',
      data: {status: 'sleeping'},
    });
    await flush();

    expect(serverStore.routerOp(id, REFERENCE)?.kind).toBe('download');
    expect(serverStore.routerOp(id, TARGET)).toBeUndefined();
    expect(serverStore.routerReason(id, REFERENCE)).toBeUndefined();
  });

  // The status above is rejected on its shape alone. This one is a download
  // event about a model the list already carries, so only presence separates
  // it from news of our fetch — and adopting it settles the download `ready`
  // off another model's row: the operation disappears reporting success while
  // the fetch it was tracking runs on untracked.
  it('does not let a download event about a listed model move one in flight', async () => {
    const id = await routerServer();
    await serverStore.startRouterDownload(id, REFERENCE);

    serverStore.applyRouterEvent(id, {
      model: TARGET,
      event: 'download_finished',
    });
    await flush();

    expect(serverStore.routerOp(id, REFERENCE)?.kind).toBe('download');
    expect(serverStore.routerOp(id, TARGET)).toBeUndefined();
    expect(serverStore.routerReason(id, REFERENCE)).toBeUndefined();
  });

  // Two downloads are in flight; ours has been heard from and the second has
  // not. Counting only the ones still unheard-from makes the second the lone
  // candidate, so a fetch the desktop started for itself rekeys it.
  it('adopts nothing while a second download is in flight, heard from or not', async () => {
    const id = await routerServer();
    const progress = {
      event: 'download_progress',
      data: {progress: {'https://x/y.gguf': {done: 1, total: 2}}},
    };
    await serverStore.startRouterDownload(id, REFERENCE);
    serverStore.applyRouterEvent(id, {...progress, model: NORMALISED});
    await serverStore.startRouterDownload(id, 'other/repo:Q4_K_M');

    serverStore.applyRouterEvent(id, {...progress, model: 'someone/else:Q4_0'});

    expect(serverStore.routerOp(id, 'other/repo:Q4_K_M')?.kind).toBe(
      'download',
    );
    expect(serverStore.routerOp(id, 'someone/else:Q4_0')).toBeUndefined();
  });

  it('adopts nothing once the download has already been heard from', async () => {
    const id = await routerServer();
    await serverStore.startRouterDownload(id, REFERENCE);
    const progress = {
      event: 'download_progress',
      data: {progress: {'https://x/y.gguf': {done: 1, total: 2}}},
    };

    serverStore.applyRouterEvent(id, {...progress, model: NORMALISED});
    serverStore.applyRouterEvent(id, {...progress, model: 'someone/else:Q4_0'});

    expect(serverStore.routerOp(id, NORMALISED)?.kind).toBe('download');
    expect(serverStore.routerOp(id, 'someone/else:Q4_0')).toBeUndefined();
  });

  it('adopts nothing while two downloads are in flight', async () => {
    const id = await routerServer();
    await serverStore.startRouterDownload(id, REFERENCE);
    await serverStore.startRouterDownload(id, 'other/repo:Q4_K_M');

    serverStore.applyRouterEvent(id, {
      model: NORMALISED,
      event: 'download_progress',
      data: {progress: {'https://x/y.gguf': {done: 1, total: 2}}},
    });

    expect(serverStore.routerOp(id, REFERENCE)?.kind).toBe('download');
    expect(serverStore.routerOp(id, 'other/repo:Q4_K_M')?.kind).toBe(
      'download',
    );
  });

  it('cancels by unloading, and settles on absence with nothing surfaced', async () => {
    const id = await routerServer();
    await serverStore.startRouterDownload(id, REFERENCE);

    await serverStore.cancelRouterOp(id, REFERENCE);
    serverStore.applyRouterEvent(id, {
      model: REFERENCE,
      event: 'download_failed',
    });
    await advance(ROUTER_DOWNLOAD_SETTLE_MS + ROUTER_POLL_MS);

    expect(mockedRouterUnload.mock.calls[0][1]).toBe(REFERENCE);
    expect(serverStore.routerOp(id, REFERENCE)).toBeUndefined();
    expect(serverStore.routerReason(id, REFERENCE)).toBeUndefined();
  });

  // A progress stream carries many of these a second, and each of them asking
  // the list separately is a request per tick against the user's desktop.
  it('collapses a burst of events into one list read and one follow-up', async () => {
    const id = await routerServer();
    mockedFetch.mockClear();

    for (let i = 0; i < 5; i++) {
      serverStore.applyRouterEvent(id, {
        model: TARGET,
        event: 'status_change',
        data: {status: 'unloaded'},
      });
    }
    await flush();

    expect(mockedFetch.mock.calls.length).toBeLessThanOrEqual(2);
  });

  // The overlay is keyed by whatever ids the server names, so without a prune
  // it grows for the life of the session.
  it('drops overlay entries for models the list no longer carries', async () => {
    const id = await routerServer();
    await serverStore.startRouterDownload(id, REFERENCE);
    for (const model of ['ghost-model', TARGET, REFERENCE]) {
      serverStore.applyRouterEvent(id, {
        model,
        event: 'status_change',
        data: {status: 'unloaded'},
      });
    }
    await flush();

    await reconcile(id);

    expect(serverStore.routerLive(id, 'ghost-model')).toBeUndefined();
    expect(serverStore.routerLive(id, TARGET)).toBeDefined();
    expect(serverStore.routerLive(id, REFERENCE)).toBeDefined();
  });

  it('never asks the router to reload its own list', async () => {
    const id = await routerServer();
    await serverStore.startRouterDownload(id, REFERENCE);
    withDownloadedRow();
    await reconcile(id);

    for (const call of mockedFetch.mock.calls) {
      expect(String(call[0])).not.toContain('reload');
    }
  });
});

describe('a server that is repointed or removed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    installStreamHandle();
    jest.useFakeTimers();
    resetStore();
    mockedRouterLoad.mockResolvedValue({status: 200, body: {success: true}});
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const busyRouter = async () => {
    const id = addServer();
    mockedFetch.mockResolvedValue(listResult(routerModelsBody.data, false));
    await serverStore.fetchModelsForServer(id);
    jest.advanceTimersByTime(1);
    const pending = serverStore.ensureRouterModelLoaded(id, UNLOADED_TARGET);
    await flush();
    serverStore.applyRouterEvent(id, {
      model: UNLOADED_TARGET,
      event: 'status_change',
      data: {status: 'loading'},
    });
    runInAction(() => {
      serverStore.routerStreamCap[id] = 'present';
      serverStore.routerObservedEviction.add(id);
      serverStore.routerReasons[`${id}/other`] = {cause: 'load-failed'};
    });
    return {id, pending};
  };

  const leftBehind = (id: string) => ({
    events: Object.keys(serverStore.routerEvents).filter(k =>
      k.startsWith(`${id}/`),
    ),
    ops: Object.keys(serverStore.routerOps).filter(k => k.startsWith(`${id}/`)),
    reasons: Object.keys(serverStore.routerReasons).filter(k =>
      k.startsWith(`${id}/`),
    ),
    polls: serverStore.routerPolls.has(id),
    cap: serverStore.routerStreamCap[id],
    shape: serverStore.routerListShape[id],
    eviction: serverStore.routerObservedEviction.has(id),
  });

  it.each([
    [
      'a new url',
      (id: string) =>
        serverStore.updateServer(id, {url: 'http://elsewhere:8080'}),
    ],
    [
      'a new type',
      (id: string) => serverStore.updateServer(id, {serverType: 'Ollama'}),
    ],
    ['removal', (id: string) => serverStore.removeServer(id)],
  ])('leaves no router state behind after %s', async (_label, act) => {
    const {id, pending} = await busyRouter();

    act(id);

    expect(leftBehind(id)).toEqual({
      events: [],
      ops: [],
      reasons: [],
      polls: false,
      cap: undefined,
      shape: undefined,
      eviction: false,
    });
    // The waiter is released so nothing hangs, but no reason is recorded:
    // there is no outcome to report about a backend that is no longer
    // configured.
    await expect(pending).resolves.toBe('failed');
    expect(leftBehind(id).reasons).toEqual([]);
  });

  it("leaves another server's entries alone", async () => {
    const {id} = await busyRouter();
    const other = addServer();
    runInAction(() => {
      serverStore.routerEvents[`${other}/alpha`] = {at: Date.now()};
    });

    serverStore.removeServer(id);

    expect(serverStore.routerEvents[`${other}/alpha`]).toBeDefined();
  });
});
