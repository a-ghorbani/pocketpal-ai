import {runInAction} from 'mobx';

import * as openaiModule from '../../api/openai';
import * as routerApi from '../../api/llamaServer/router';

jest.mock('mobx-persist-store', () => ({
  makePersistable: jest.fn().mockReturnValue(Promise.resolve()),
}));

jest.mock('../../api/openai', () => ({
  fetchModelsWithHeaders: jest.fn(),
  testConnection: jest.fn(),
}));

jest.mock('../../api/llamaServer/router', () => ({
  postLoad: jest.fn(),
  postUnload: jest.fn(),
  openRouterEvents: jest.fn(),
}));

import {serverStore} from '../ServerStore';
import {
  ROUTER_ACK_MS,
  ROUTER_EVIDENCE_MS,
  ROUTER_LOAD_MAX_MS,
  ROUTER_UNLOAD_SETTLE_MS,
  ROUTER_UNREACHABLE_MS,
  RouterStore,
} from '../RouterStore';
import {routerWireJson} from '../../../jest/fixtures/routerWire';
import type {RouterEventsHandlers} from '../../api/llamaServer/router';

const mockedFetch = openaiModule.fetchModelsWithHeaders as jest.Mock;
const mockedLoad = routerApi.postLoad as jest.Mock;
const mockedUnload = routerApi.postUnload as jest.Mock;
const mockedEvents = routerApi.openRouterEvents as jest.Mock;

const ALPHA = 'alpha';
const BETA = 'beta';

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

/** Advance the clock one tick at a time, letting promises settle between. */
const elapse = async (ms: number) => {
  for (let left = ms; left > 0; left -= 1000) {
    jest.advanceTimersByTime(Math.min(1000, left));
    await flush();
  }
};

interface FakeStream {
  handlers: RouterEventsHandlers;
  closed: boolean;
}

let streams: FakeStream[];
const live = () => streams.filter(stream => !stream.closed);
const openStream = () => live()[0].handlers.onOpen();

let store: RouterStore;
let serverId: string;
let calls: string[];

const read = async (models: any[]) => {
  mockedFetch.mockResolvedValueOnce(list(models));
  await serverStore.fetchModelsForServer(serverId);
};

beforeEach(async () => {
  jest.useFakeTimers({doNotFake: ['setImmediate']});
  jest.clearAllMocks();
  runInAction(() => {
    serverStore.servers = [];
    serverStore.serverModels.clear();
    serverStore.listReads = {};
    serverStore.appActive = true;
  });
  streams = [];
  calls = [];
  mockedEvents.mockImplementation((_target, handlers) => {
    calls.push('stream');
    const stream: FakeStream = {handlers, closed: false};
    streams.push(stream);
    return {
      close: () => {
        stream.closed = true;
      },
    };
  });
  mockedFetch.mockImplementation(async () => {
    calls.push('read');
    return list(rows());
  });
  mockedLoad.mockResolvedValue({status: 200, body: {success: true}});
  mockedUnload.mockResolvedValue({status: 200, body: {success: true}});
  store = new RouterStore();
  serverId = serverStore.addServer({
    name: 'desk',
    url: 'http://desk:8080',
    serverType: 'llama.cpp',
  });
  await read(rows());
  mockedFetch.mockClear();
  calls = [];
});

afterEach(() => {
  store.dispose();
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('watchdogs', () => {
  it('asks the list when a request is not acknowledged, and ends nothing', async () => {
    store.ensureLoaded(serverId, ALPHA);
    await flush();
    openStream();
    const pending = deferred<ReturnType<typeof list>>();
    mockedFetch.mockReturnValueOnce(pending.promise);
    const record = store.recordFor(serverId, ALPHA)!;

    await elapse(ROUTER_ACK_MS - 1000);
    expect(record.verdictRequested).toBe(false);
    expect(mockedFetch).not.toHaveBeenCalled();

    await elapse(1000);
    expect(record.verdictRequested).toBe(true);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(store.owns(record)).toBe(true);
  });

  it('asks the list when an active load goes quiet, again each window', async () => {
    store.ensureLoaded(serverId, ALPHA);
    await flush();
    openStream();
    live()[0].handlers.onEvent({
      model: ALPHA,
      event: 'status_change',
      data: {status: 'loading'},
    });
    mockedFetch.mockImplementation(() => new Promise(() => {}));
    const record = store.recordFor(serverId, ALPHA)!;
    expect(record.phase).toBe('active');

    await elapse(ROUTER_EVIDENCE_MS);
    expect(record.verdictRequested).toBe(true);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(store.owns(record)).toBe(true);
  });
});

describe('bounds', () => {
  it('ends unreachable after reads fail for the whole window', async () => {
    const waiting = store.ensureLoaded(serverId, ALPHA);
    await flush();
    streams[0].closed = true;
    streams[0].handlers.onEnd();
    mockedFetch.mockRejectedValue(new Error('Network error'));

    await elapse(ROUTER_UNREACHABLE_MS - 1000);
    expect(store.owns(store.recordFor(serverId, ALPHA)!)).toBe(true);
    await elapse(1000);

    await expect(waiting).resolves.toBe('failed');
    expect(store.recordFor(serverId, ALPHA)!.failure).toEqual({
      cause: 'server-unreachable',
    });
    expect(store.rowState(serverId, ALPHA)).toBe('unknown');
  });

  it('keeps a load hearing progress events alive past the unreachable window', async () => {
    store.ensureLoaded(serverId, ALPHA);
    await flush();
    openStream();
    const record = store.recordFor(serverId, ALPHA)!;

    for (let second = 0; second < ROUTER_UNREACHABLE_MS * 2; second += 5000) {
      live()[0].handlers.onEvent({
        model: ALPHA,
        event: 'status_change',
        data: {status: 'loading', progress: {value: second / 1e6}},
      });
      await elapse(5000);
    }

    expect(store.owns(record)).toBe(true);
  });

  it('stops waiting at the load bound when nothing decided it', async () => {
    mockedFetch.mockImplementation(async () =>
      list(rows({[ALPHA]: 'loading'})),
    );
    const waiting = store.ensureLoaded(serverId, ALPHA);
    await flush();
    streams[0].closed = true;
    streams[0].handlers.onEnd();

    await elapse(ROUTER_LOAD_MAX_MS);

    await expect(waiting).resolves.toBe('failed');
    expect(store.recordFor(serverId, ALPHA)!.failure).toEqual({
      cause: 'wait-stopped',
    });
  });

  it('reports the row at the load bound when a later read shows the model down', async () => {
    mockedFetch.mockImplementation(async () =>
      list(rows({[ALPHA]: 'loading'})),
    );
    const waiting = store.ensureLoaded(serverId, ALPHA);
    await flush();
    openStream();
    const record = store.recordFor(serverId, ALPHA)!;
    await elapse(ROUTER_LOAD_MAX_MS - 2000);
    runInAction(() => {
      record.phase = 'requested';
      record.verdictRequested = false;
      record.lastEventAt = Date.now();
      record.lastEvidenceAt = Date.now();
    });
    await read(rows());
    expect(store.owns(record)).toBe(true);

    await elapse(2000);

    await expect(waiting).resolves.toBe('failed');
    expect(record.failure).toEqual({cause: 'load-failed'});
  });

  it('fails an unload the server still holds at the settle bound', async () => {
    await read(rows({[ALPHA]: 'loaded'}));
    mockedFetch.mockImplementation(async () => list(rows({[ALPHA]: 'loaded'})));

    store.unload(serverId, ALPHA);
    await elapse(ROUTER_UNLOAD_SETTLE_MS);

    expect(store.recordFor(serverId, ALPHA)!.failure).toEqual({
      cause: 'unload-not-released',
    });
  });

  it('judges an unload at the settle bound only on a read that started after it', async () => {
    await read(rows({[ALPHA]: 'loaded'}));
    mockedFetch.mockImplementation(() => new Promise(() => {}));

    store.unload(serverId, ALPHA);
    await elapse(ROUTER_UNLOAD_SETTLE_MS + 5000);

    const record = store.recordFor(serverId, ALPHA)!;
    expect(record.failure).toBeUndefined();
    expect(store.owns(record)).toBe(true);
  });

  it('ends an unload with no claim when the list cannot say', async () => {
    await read(rows({[ALPHA]: 'loaded'}));
    mockedFetch.mockImplementation(async () =>
      list(rows({[ALPHA]: 'hibernating'})),
    );

    store.unload(serverId, ALPHA);
    await elapse(ROUTER_UNLOAD_SETTLE_MS);

    expect(store.recordFor(serverId, ALPHA)).toBeUndefined();
  });
});

describe('backgrounding', () => {
  it('freezes bounds, stops every timer and reads before the stream reopens', async () => {
    const waiting = store.ensureLoaded(serverId, ALPHA);
    await flush();
    openStream();
    const record = store.recordFor(serverId, ALPHA)!;

    runInAction(() => {
      serverStore.appActive = false;
    });
    expect(live()).toHaveLength(0);
    calls = [];
    mockedFetch.mockImplementation(async () => {
      calls.push('read');
      return list(rows({[ALPHA]: 'loaded'}));
    });

    await elapse(20 * 60 * 1000);
    expect(calls).toEqual([]);
    expect(jest.getTimerCount()).toBe(0);
    expect(store.owns(record)).toBe(true);

    runInAction(() => {
      serverStore.appActive = true;
    });
    await flush();

    await expect(waiting).resolves.toBe('ready');
    expect(calls[0]).toBe('read');
  });

  it('does not count time in the background against any bound', async () => {
    mockedFetch.mockImplementation(async () =>
      list(rows({[ALPHA]: 'loading'})),
    );
    store.ensureLoaded(serverId, ALPHA);
    await flush();
    const record = store.recordFor(serverId, ALPHA)!;

    runInAction(() => {
      serverStore.appActive = false;
    });
    await elapse(ROUTER_LOAD_MAX_MS * 2);
    runInAction(() => {
      serverStore.appActive = true;
    });
    await elapse(5000);

    expect(store.owns(record)).toBe(true);
  });

  it('reopens the stream only after the foreground read settles', async () => {
    store.ensureLoaded(serverId, ALPHA);
    await flush();
    runInAction(() => {
      serverStore.appActive = false;
    });
    const pending = deferred<ReturnType<typeof list>>();
    mockedFetch.mockReturnValueOnce(pending.promise);
    calls = [];

    runInAction(() => {
      serverStore.appActive = true;
    });
    await flush();
    expect(live()).toHaveLength(0);

    pending.resolve(list(rows({[ALPHA]: 'loading'})));
    await flush();

    expect(live()).toHaveLength(1);
  });
});

describe('eviction', () => {
  it('notes a model another load pushed out, and counts what stays', async () => {
    await read(rows({[ALPHA]: 'loaded'}));
    expect(store.residentCount(serverId)).toBe(1);

    store.ensureLoaded(serverId, BETA);
    await flush();
    await read(rows({[BETA]: 'loaded'}));

    expect(store.observedEviction.has(serverId)).toBe(true);
    expect(store.residentCount(serverId)).toBe(1);
  });

  it('does not note an unload of our own', async () => {
    store.ensureLoaded(serverId, BETA);
    await flush();
    await read(rows({[ALPHA]: 'loaded'}));

    store.unload(serverId, ALPHA);
    await flush();
    await read(rows());

    expect(store.recordFor(serverId, ALPHA)).toBeUndefined();
    expect(store.observedEviction.has(serverId)).toBe(false);
  });

  it('does not note a cancelled load', async () => {
    store.ensureLoaded(serverId, ALPHA);
    await flush();

    store.cancel(serverId, ALPHA);
    await read(rows({[ALPHA]: 'loaded'}));
    expect(store.recordFor(serverId, ALPHA)!.kind).toBe('unload');
    await read(rows());

    expect(store.recordFor(serverId, ALPHA)).toBeUndefined();
    expect(store.observedEviction.has(serverId)).toBe(false);
  });

  it('notes a clean exit on the stream with no operation of ours', async () => {
    store.setPickerServer(serverId);
    await flush();
    openStream();

    live()[0].handlers.onEvent({
      model: ALPHA,
      event: 'status_change',
      data: {status: 'unloaded', exit_code: 1},
    });
    expect(store.observedEviction.has(serverId)).toBe(false);

    live()[0].handlers.onEvent({
      model: ALPHA,
      event: 'status_change',
      data: {status: 'unloaded', exit_code: 0},
    });
    expect(store.observedEviction.has(serverId)).toBe(true);
  });

  it('does not note the exit of a model whose unload just settled', async () => {
    await read(rows({[ALPHA]: 'loaded'}));
    store.setPickerServer(serverId);
    await flush();
    openStream();

    store.unload(serverId, ALPHA);
    await flush();
    await read(rows());
    expect(store.recordFor(serverId, ALPHA)).toBeUndefined();
    live()[0].handlers.onEvent({
      model: ALPHA,
      event: 'status_change',
      data: {status: 'unloaded', exit_code: 0},
    });

    expect(store.observedEviction.has(serverId)).toBe(false);
  });
});

describe('server edits', () => {
  it('forgets a settled unload when the server is repointed', async () => {
    await read(rows({[ALPHA]: 'loaded'}));
    store.setPickerServer(serverId);
    await flush();
    openStream();
    store.unload(serverId, ALPHA);
    await flush();
    await read(rows());
    expect(store.recordFor(serverId, ALPHA)).toBeUndefined();

    runInAction(() => {
      serverStore.updateServer(serverId, {url: 'http://other:8080'});
    });
    await read(rows({[ALPHA]: 'loaded'}));
    store.setPickerServer(serverId);
    await flush();
    live()[0].handlers.onOpen();
    live()[0].handlers.onEvent({
      model: ALPHA,
      event: 'status_change',
      data: {status: 'unloaded', exit_code: 0},
    });

    expect(store.observedEviction.has(serverId)).toBe(true);
  });
});
