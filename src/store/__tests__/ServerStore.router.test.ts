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
  openRouterEventStream: jest.fn(() => ({close: jest.fn()})),
}));

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
} from '../../../jest/fixtures/routerWire';
import type {RemoteModelInfo} from '../../api/openai';
import {openRouterEventStream, RouterStreamError} from '../../api/router';

const persistedProperties: string[] = (
  jest.requireMock('mobx-persist-store').makePersistable as jest.Mock
).mock.calls[0][1].properties;

const mockedFetch = openaiModule.fetchModelsWithHeaders as jest.Mock;
const mockedOpenStream = openRouterEventStream as jest.Mock;

const listResult = (models: any[], hasModelsKey: boolean) => ({
  models: models as RemoteModelInfo[],
  headers: {},
  hasModelsKey,
});

/** Let a detached reconcile reach its mocked fetch. */
const flush = () => new Promise(resolve => setImmediate(resolve));

const addServer = (serverType = 'llama.cpp') =>
  serverStore.addServer({
    name: 'desktop',
    url: 'http://desktop:8080',
    serverType,
  });

const resetStore = () =>
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
  });

describe('router detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  it('prefers an overlay entry written after the fetch started', async () => {
    const id = await withRouter();
    const target = routerModelsBody.data.find(
      row => row.status.value === 'unloaded',
    )!;

    runInAction(() => {
      serverStore.routerEvents[`${id}/${target.id}`] = {
        status: 'loading',
        at: Date.now() + 1000,
      };
    });

    expect(serverStore.routerRowState(id, target.id)).toBe('loading');
  });

  it('prefers the row over an overlay entry the fetch has overtaken', async () => {
    const id = addServer();
    runInAction(() => {
      serverStore.routerEvents[`${id}/gemma-4-e2b`] = {
        status: 'loading',
        at: 1,
      };
    });
    mockedFetch.mockResolvedValue(listResult(routerModelsBody.data, false));

    await serverStore.fetchModelsForServer(id);

    expect(serverStore.routerRowState(id, 'gemma-4-e2b')).toBe('loaded');
  });

  it('reports a model the server does not list as absent', async () => {
    const id = await withRouter();

    expect(serverStore.routerRowState(id, 'never-heard-of-it')).toBe('absent');
  });
});

describe('the router event stream', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStore();
  });

  const openOn = async (serverId: string) => {
    mockedOpenStream.mockClear();
    await serverStore.openRouterStream(serverId);
    return mockedOpenStream.mock.calls[0]?.[2];
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

    handlers.onClose(new RouterStreamError('File Not Found', 404));

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

      handlers.onClose(new RouterStreamError('Invalid API Key', status));

      expect(serverStore.routerStreamCapFor(id)).toBe('unknown');
    },
  );

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

  it('writes the overlay from the captured load stream', async () => {
    const id = await routerServer();

    for (const event of routerWireEvents('sse-load-sequence.txt')) {
      serverStore.applyRouterEvent(id, event);
    }

    expect(serverStore.routerLive(id, 'alpha')?.status).toBe('unloaded');
    expect(serverStore.routerLive(id, 'alpha')?.exitCode).toBe(0);
  });

  it('turns the eviction note on for an unload nobody asked for', async () => {
    const id = await routerServer();

    serverStore.applyRouterEvent(id, {
      model: 'gemma-4-e2b',
      event: 'status_change',
      data: {status: 'unloaded'},
    });

    expect(serverStore.routerObservedEviction.has(id)).toBe(true);
  });

  it('does not call our own unload an eviction', async () => {
    const id = await routerServer();
    runInAction(() => {
      serverStore.routerOps[`${id}/gemma-4-e2b`] = {
        kind: 'unload',
        phase: 'requested',
        serverId: id,
        key: `${id}/gemma-4-e2b`,
        startedAt: Date.now(),
        lastEvidenceAt: Date.now(),
      };
    });

    serverStore.applyRouterEvent(id, {
      model: 'gemma-4-e2b',
      event: 'status_change',
      data: {status: 'unloaded'},
    });

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

    serverStore.applyRouterEvent(id, {
      model: 'alpha',
      event: 'status_change',
      data: {status: 'loading', progress: {value: 0.0}},
    });
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
