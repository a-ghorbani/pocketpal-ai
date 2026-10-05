import {runInAction} from 'mobx';

import * as openaiModule from '../../api/openai';
import * as propsModule from '../../api/llamaServer/props';
import * as routerApi from '../../api/llamaServer/router';

jest.mock('mobx-persist-store', () => ({
  makePersistable: jest.fn().mockReturnValue(Promise.resolve()),
}));

jest.mock('../../api/openai', () => ({
  fetchModelsWithHeaders: jest.fn(),
  testConnection: jest.fn(),
}));

jest.mock('../../api/llamaServer/props', () => ({
  fetchServerProps: jest.fn(),
  PROPS_TIMEOUT_MS: 5000,
}));

jest.mock('../../api/llamaServer/router', () => ({
  postLoad: jest.fn(),
  postUnload: jest.fn(),
  openRouterEvents: jest.fn(),
}));

import {serverStore} from '../ServerStore';
import {ROUTER_POLL_MS, RouterStore} from '../RouterStore';
import {
  routerWireEvents,
  routerWireJson,
  routerWireResponse,
} from '../../../jest/fixtures/routerWire';
import type {RouterEventsHandlers} from '../../api/llamaServer/router';

const mockedFetch = openaiModule.fetchModelsWithHeaders as jest.Mock;
const mockedProps = propsModule.fetchServerProps as jest.Mock;
const mockedLoad = routerApi.postLoad as jest.Mock;
const mockedEvents = routerApi.openRouterEvents as jest.Mock;

const ALPHA = 'alpha';
const BETA = 'beta';
const loadStream = routerWireEvents('sse-load-sequence.txt');

const rows = (states: Record<string, string> = {}): any[] =>
  routerWireJson('router-v1-models.json').data.map((row: any) =>
    row.id in states
      ? {...row, status: {...row.status, value: states[row.id]}}
      : row,
  );

const list = (models: any[]) => ({models, headers: {}});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return {promise, resolve};
}

const flush = async () => {
  for (let i = 0; i < 10; i++) {
    await new Promise(resolve => setImmediate(resolve));
  }
};

interface FakeStream {
  url: string;
  handlers: RouterEventsHandlers;
  closed: boolean;
}

let streams: FakeStream[];
const live = () => streams.filter(stream => !stream.closed);
/** The stream ends by itself, the way the transport reports it. */
const endStream = (status?: number) => {
  const stream = live()[0];
  stream.closed = true;
  stream.handlers.onEnd(status);
};

let store: RouterStore;

const addServer = (url = 'http://desk:8080') =>
  serverStore.addServer({name: 'desk', url, serverType: 'llama.cpp'});

const read = async (serverId: string, models: any[]) => {
  mockedFetch.mockResolvedValueOnce(list(models));
  await serverStore.fetchModelsForServer(serverId);
};

beforeEach(() => {
  jest.useFakeTimers({doNotFake: ['setImmediate']});
  jest.clearAllMocks();
  runInAction(() => {
    serverStore.servers = [];
    serverStore.serverModels.clear();
    serverStore.listReads = {};
    serverStore.appActive = true;
  });
  streams = [];
  mockedEvents.mockImplementation((target, handlers) => {
    const stream: FakeStream = {url: target.url, handlers, closed: false};
    streams.push(stream);
    return {
      close: () => {
        stream.closed = true;
      },
    };
  });
  mockedFetch.mockResolvedValue(list(rows()));
  mockedLoad.mockResolvedValue({status: 200, body: {success: true}});
  store = new RouterStore();
});

afterEach(() => {
  store.dispose();
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('stream tier', () => {
  let serverId: string;

  beforeEach(async () => {
    serverId = addServer();
    await read(serverId, rows());
    mockedFetch.mockClear();
  });

  it('opens one stream for a load in flight', async () => {
    store.ensureLoaded(serverId, ALPHA);
    await flush();

    expect(live()).toHaveLength(1);
    expect(live()[0].url).toBe('http://desk:8080');
    expect(store.stream).toEqual({serverId, state: 'connecting'});

    live()[0].handlers.onOpen();
    expect(store.stream).toEqual({serverId, state: 'open'});
    expect(store.streamCap[serverId]).toBe('present');
  });

  it('remembers a 404 for the session and settles the load by polling', async () => {
    const waiting = store.ensureLoaded(serverId, ALPHA);
    await flush();

    endStream(routerWireResponse('sse-unregistered-404.txt').status);
    expect(store.streamCap[serverId]).toBe('absent');

    store.setPickerServer(serverId);
    await flush();
    expect(mockedEvents).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(ROUTER_POLL_MS + 1000);
    await flush();
    expect(mockedFetch).toHaveBeenCalledTimes(1);

    mockedFetch.mockResolvedValueOnce(list(rows({[ALPHA]: 'loaded'})));
    jest.advanceTimersByTime(ROUTER_POLL_MS);
    await flush();

    await expect(waiting).resolves.toBe('ready');
    expect(mockedEvents).toHaveBeenCalledTimes(1);
  });

  it('keeps a 401 unknown and does not reopen until the picker opens there', async () => {
    store.ensureLoaded(serverId, ALPHA);
    await flush();

    endStream(routerWireResponse('sse-unauthorized-401.txt').status);
    expect(store.streamCap[serverId] ?? 'unknown').toBe('unknown');
    jest.advanceTimersByTime(60000);
    await flush();
    expect(mockedEvents).toHaveBeenCalledTimes(1);

    store.setPickerServer(serverId);
    await flush();
    expect(mockedEvents).toHaveBeenCalledTimes(2);
  });

  it('reopens a dropped stream when a new record starts there', async () => {
    store.ensureLoaded(serverId, ALPHA);
    await flush();
    endStream();
    await flush();
    expect(live()).toHaveLength(0);

    store.ensureLoaded(serverId, BETA);
    await flush();

    expect(live()).toHaveLength(1);
  });

  it('never takes a stream ending as an outcome', async () => {
    store.ensureLoaded(serverId, ALPHA);
    await flush();
    const record = store.recordFor(serverId, ALPHA)!;

    endStream();
    await flush();

    expect(store.owns(record)).toBe(true);
  });

  it('applies load progress and corroborates, but never ends a record', async () => {
    store.ensureLoaded(serverId, ALPHA);
    await flush();
    const pendingRead = deferred<ReturnType<typeof list>>();
    mockedFetch.mockReturnValue(pendingRead.promise);
    const record = store.recordFor(serverId, ALPHA)!;
    const stream = live()[0];
    stream.handlers.onOpen();

    stream.handlers.onEvent(loadStream[1]);
    expect(record.detail?.progress?.value).toBe(0);
    expect(record.phase).toBe('active');

    for (const event of loadStream) {
      stream.handlers.onEvent(event);
    }
    await flush();

    expect(store.owns(record)).toBe(true);
    expect(record.detail?.progress?.value).toBe(1);
  });

  it('asks for reads through the scheduler', async () => {
    store.ensureLoaded(serverId, ALPHA);
    await flush();
    const firstRead = deferred<ReturnType<typeof list>>();
    mockedFetch.mockReturnValueOnce(firstRead.promise);
    const stream = live()[0];
    stream.handlers.onOpen();

    stream.handlers.onEvent({
      model: ALPHA,
      event: 'status_change',
      data: {status: 'loaded'},
    });
    await flush();
    stream.handlers.onEvent({
      model: BETA,
      event: 'status_change',
      data: {status: 'unloaded', exit_code: 0},
    });
    stream.handlers.onEvent({model: '*', event: 'models_reload'});
    await flush();
    expect(mockedFetch).toHaveBeenCalledTimes(1);

    firstRead.resolve(list(rows()));
    await flush();

    expect(mockedFetch).toHaveBeenCalledTimes(2);
  });

  it('ignores download events', async () => {
    store.ensureLoaded(serverId, ALPHA);
    await flush();
    const stream = live()[0];

    for (const event of routerWireEvents('sse-download-sequence.txt')) {
      if (String(event.event).startsWith('download_')) {
        stream.handlers.onEvent(event);
      }
    }
    await flush();

    expect(mockedFetch).not.toHaveBeenCalled();
  });
});

describe('which server gets the stream', () => {
  it('streams one server and polls the other when both load', async () => {
    const first = addServer('http://one:8080');
    const second = addServer('http://two:8080');
    await read(first, rows());
    await read(second, rows());
    mockedFetch.mockClear();

    store.ensureLoaded(first, ALPHA);
    await flush();
    store.ensureLoaded(second, ALPHA);
    await flush();
    live()[0].handlers.onOpen();

    expect(live()).toHaveLength(1);
    expect(live()[0].url).toBe('http://two:8080');

    jest.advanceTimersByTime(ROUTER_POLL_MS * 2);
    await flush();
    const polled = mockedFetch.mock.calls.map(call => call[0]);
    expect(polled).toContain('http://one:8080');
    expect(polled).not.toContain('http://two:8080');
  });

  it('opens one stream for an idle picker and asks nothing else', async () => {
    const serverId = addServer();
    const twelve = Array.from({length: 12}, (_, i) => ({
      id: `model-${i}`,
      object: 'model',
      status: {value: i === 0 ? 'loaded' : 'unloaded'},
    }));
    await read(serverId, twelve);
    mockedFetch.mockClear();

    store.setPickerServer(serverId);
    await flush();
    jest.advanceTimersByTime(60000);
    await flush();

    expect(mockedEvents).toHaveBeenCalledTimes(1);
    expect(mockedProps).not.toHaveBeenCalled();
    expect(mockedLoad).not.toHaveBeenCalled();
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('moves the stream to a load in flight when the picker closes', async () => {
    const picked = addServer('http://picked:8080');
    const loading = addServer('http://loading:8080');
    await read(picked, rows());
    await read(loading, rows());
    store.ensureLoaded(loading, ALPHA);
    store.setPickerServer(picked);
    await flush();
    expect(live().map(stream => stream.url)).toEqual(['http://picked:8080']);

    store.setPickerServer(null);
    await flush();

    expect(live().map(stream => stream.url)).toEqual(['http://loading:8080']);
  });

  it('streams nothing for a picker on a server that is not a router', async () => {
    const serverId = addServer();
    await read(serverId, [{id: 'm', object: 'model'}]);

    store.setPickerServer(serverId);
    await flush();

    expect(mockedEvents).not.toHaveBeenCalled();
  });

  it('closes the stream while the app is in the background', async () => {
    const serverId = addServer();
    await read(serverId, rows());
    store.setPickerServer(serverId);
    await flush();
    expect(live()).toHaveLength(1);

    runInAction(() => {
      serverStore.appActive = false;
    });

    expect(live()).toHaveLength(0);
    expect(store.stream).toBeNull();
  });
});
