import {runInAction} from 'mobx';

import * as openaiModule from '../../api/openai';
import * as routerApi from '../../api/llamaServer/router';
import * as Keychain from 'react-native-keychain';

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
  openRouterEvents: jest.fn(() => ({close: jest.fn()})),
}));

import {serverStore} from '../ServerStore';
import {RouterStore} from '../RouterStore';
import {
  RemoteModelNotReadyError,
  RemoteModelRequestWithdrawnError,
} from '../../utils/errors';
import {
  directTextModelsBody,
  routerModelsBody,
} from '../../../jest/fixtures/remoteModelList';
import {routerWireJson} from '../../../jest/fixtures/routerWire';
import type {ServerType} from '../../utils/serverTypes';

const mockedFetch = openaiModule.fetchModelsWithHeaders as jest.Mock;
const mockedLoad = routerApi.postLoad as jest.Mock;
const mockedUnload = routerApi.postUnload as jest.Mock;
const mockedEvents = routerApi.openRouterEvents as jest.Mock;

const LOADED = 'gemma-4-e2b';
const TARGET = 'ggml-org/gemma-4-31B-it-GGUF:Q8_0';
const OTHER = 'bartowski/Qwen_Qwen3-1.7B-GGUF:Q4_K_M';

type Rows = any[];

const routerRows = (states: Record<string, string> = {}): Rows =>
  routerModelsBody.data.map(row =>
    row.id in states
      ? {...row, status: {...row.status, value: states[row.id]}}
      : row,
  );

const list = (models: Rows, hasModelsKey = false) => ({
  models,
  headers: {},
  ...(hasModelsKey && {hasModelsKey: true}),
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
}

const flush = async () => {
  for (let i = 0; i < 10; i++) {
    await new Promise(resolve => setImmediate(resolve));
  }
};

const accepted = {status: 200, body: {success: true}};

let store: RouterStore;
let serverId: string;

const addServer = (serverType: ServerType | string = 'llama.cpp') =>
  serverStore.addServer({
    name: 'desk',
    url: 'http://desk:8080',
    serverType: serverType as ServerType,
  });

/** A successful read of the given rows, through the store's one writer. */
const read = async (rows: Rows, id = serverId, hasModelsKey = false) => {
  mockedFetch.mockResolvedValueOnce(list(rows, hasModelsKey));
  await serverStore.fetchModelsForServer(id);
};

beforeEach(() => {
  jest.clearAllMocks();
  runInAction(() => {
    serverStore.servers = [];
    serverStore.serverModels.clear();
    serverStore.listReads = {};
    serverStore.appActive = true;
  });
  mockedFetch.mockResolvedValue(list(routerRows()));
  mockedLoad.mockResolvedValue(accepted);
  mockedUnload.mockResolvedValue(accepted);
  store = new RouterStore();
  serverId = addServer();
});

afterEach(() => {
  store.dispose();
});

describe('router evidence gate', () => {
  it.each([
    'LM Studio',
    'Ollama',
    'OpenAI',
    'vLLM',
    'unknown',
    '',
    'my server',
  ])(
    'makes no router request for a %p server with a router-shaped list',
    async serverType => {
      runInAction(() => {
        serverStore.servers = [];
      });
      serverId = addServer(serverType);
      await read(routerRows());

      await expect(store.ensureLoaded(serverId, TARGET)).resolves.toBe(
        'not-router',
      );
      store.unload(serverId, LOADED);
      await flush();

      expect(store.isRouter(serverId)).toBe(false);
      expect(mockedLoad).not.toHaveBeenCalled();
      expect(mockedUnload).not.toHaveBeenCalled();
      expect(mockedEvents).not.toHaveBeenCalled();
    },
  );

  it('treats a single-model llama.cpp server as no router', async () => {
    await read(directTextModelsBody.data, serverId, true);

    await expect(store.ensureLoaded(serverId, LOADED)).resolves.toBe(
      'not-router',
    );
    expect(mockedLoad).not.toHaveBeenCalled();
  });

  it('treats statusless rows without a models key as no router', async () => {
    await read(directTextModelsBody.data, serverId, false);

    await expect(store.ensureLoaded(serverId, LOADED)).resolves.toBe(
      'not-router',
    );
    expect(mockedLoad).not.toHaveBeenCalled();
  });

  it('detects a router with no models from the missing models key', async () => {
    await read([], serverId, false);
    expect(store.isRouter(serverId)).toBe(true);

    await read([], serverId, true);
    expect(store.isRouter(serverId)).toBe(false);
  });

  it("detects a second build's router list", async () => {
    await read(routerWireJson('router-v1-models.json').data);

    expect(store.isRouter(serverId)).toBe(true);
    store.ensureLoaded(serverId, 'alpha');
    await flush();
    expect(mockedLoad).toHaveBeenCalledTimes(1);
  });

  it('reads the list once before deciding when it has never been read', async () => {
    const order: string[] = [];
    mockedFetch.mockImplementationOnce(async () => {
      order.push('read');
      return list(routerRows());
    });
    mockedLoad.mockImplementationOnce(async () => {
      order.push('load');
      return accepted;
    });

    store.ensureLoaded(serverId, TARGET);
    await flush();

    expect(order).toEqual(['read', 'load']);
  });

  it('lets Stop end the wait for that first read, and posts nothing after it', async () => {
    const firstRead = deferred<ReturnType<typeof list>>();
    mockedFetch.mockReturnValueOnce(firstRead.promise);
    const caller = new AbortController();
    let settled = false;
    const ready = store
      .ensureReady(
        {
          modelId: `${serverId}/${TARGET}`,
          serverId,
          remoteModelId: TARGET,
          url: 'http://desk:8080',
          serverType: 'llama.cpp',
        },
        caller.signal,
      )
      .then(() => {
        settled = true;
      });
    await flush();

    caller.abort();
    await flush();
    expect(settled).toBe(true);
    await ready;

    firstRead.resolve(list(routerRows()));
    await flush();
    expect(mockedLoad).not.toHaveBeenCalled();
    expect(store.recordFor(serverId, TARGET)).toBeUndefined();
  });

  it('shares one first read between select and a send that follows it', async () => {
    const firstRead = deferred<ReturnType<typeof list>>();
    mockedFetch.mockReturnValueOnce(firstRead.promise);

    store.ensureLoaded(serverId, TARGET);
    await flush();
    store.ensureLoaded(serverId, TARGET, new AbortController().signal);
    await flush();
    firstRead.resolve(list(routerRows()));
    await flush();

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(mockedLoad).toHaveBeenCalledTimes(1);
  });

  it('gives up as no router when that first read fails', async () => {
    mockedFetch.mockRejectedValueOnce(new Error('Network error'));

    await expect(store.ensureLoaded(serverId, TARGET)).resolves.toBe(
      'not-router',
    );
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(mockedLoad).not.toHaveBeenCalled();
  });
});

describe('ensureLoaded', () => {
  beforeEach(async () => {
    await read(routerRows());
    jest.clearAllMocks();
    mockedFetch.mockResolvedValue(list(routerRows()));
    mockedLoad.mockResolvedValue(accepted);
    mockedUnload.mockResolvedValue(accepted);
  });

  it('posts the model it was asked for with the record signal', async () => {
    store.ensureLoaded(serverId, TARGET);
    await flush();

    expect(mockedLoad).toHaveBeenCalledWith(
      {url: 'http://desk:8080', apiKey: 'mockPass', timeoutMs: undefined},
      TARGET,
      store.recordFor(serverId, TARGET)!.controller.signal,
    );
  });

  it('joins a load in flight instead of posting again', async () => {
    const first = store.ensureLoaded(serverId, TARGET);
    const second = store.ensureLoaded(serverId, TARGET);
    await flush();

    expect(mockedLoad).toHaveBeenCalledTimes(1);
    await read(routerRows({[TARGET]: 'loaded'}));
    await expect(Promise.all([first, second])).resolves.toEqual([
      'ready',
      'ready',
    ]);
  });

  it('keeps one load running while another model starts loading', async () => {
    store.ensureLoaded(serverId, TARGET);
    await flush();
    const targetRecord = store.recordFor(serverId, TARGET)!;

    store.ensureLoaded(serverId, OTHER);
    await flush();

    expect(store.records.size).toBe(2);
    expect(targetRecord.controller.signal.aborted).toBe(false);
    expect(store.owns(targetRecord)).toBe(true);
    expect(mockedLoad.mock.calls[0][2].aborted).toBe(false);
    expect(mockedLoad.mock.calls.map(call => call[1])).toEqual([TARGET, OTHER]);
  });

  it('posts once for two callers waiting out an unload', async () => {
    const unloadAnswer = deferred<typeof accepted>();
    mockedUnload.mockReturnValueOnce(unloadAnswer.promise);
    await read(routerRows({[TARGET]: 'loaded'}));
    store.unload(serverId, TARGET);
    await flush();

    const select = store.ensureLoaded(serverId, TARGET);
    const send = store.ensureLoaded(
      serverId,
      TARGET,
      new AbortController().signal,
    );
    await flush();
    expect(mockedLoad).not.toHaveBeenCalled();

    unloadAnswer.resolve(accepted);
    await flush();
    await read(routerRows({[TARGET]: 'unloaded'}));
    await flush();

    expect(mockedLoad).toHaveBeenCalledTimes(1);
    const record = store.recordFor(serverId, TARGET)!;
    expect(record.kind).toBe('load');
    await read(routerRows({[TARGET]: 'loaded'}));
    await expect(Promise.all([select, send])).resolves.toEqual([
      'ready',
      'ready',
    ]);
  });

  it('is ready without a request when a fresh list shows it resident', async () => {
    await read(routerRows({[TARGET]: 'sleeping'}));

    await expect(store.ensureLoaded(serverId, TARGET)).resolves.toBe('ready');
    await expect(store.ensureLoaded(serverId, LOADED)).resolves.toBe('ready');
    expect(mockedLoad).not.toHaveBeenCalled();
  });

  it('never takes a stale list as ready', async () => {
    mockedFetch.mockRejectedValueOnce(new Error('Network error'));
    await serverStore.fetchModelsForServer(serverId);
    expect(serverStore.listReads[serverId].stale).toBe(true);

    store.ensureLoaded(serverId, LOADED);
    await flush();

    expect(mockedLoad).toHaveBeenCalledTimes(1);
  });

  it('ends ready on a read that started after the request', async () => {
    const waiting = store.ensureLoaded(serverId, TARGET);
    await flush();

    await read(routerRows({[TARGET]: 'loaded'}));

    await expect(waiting).resolves.toBe('ready');
    expect(store.recordFor(serverId, TARGET)).toBeUndefined();
  });

  it('settles nothing on a read that started before the request', async () => {
    const early = deferred<ReturnType<typeof list>>();
    mockedFetch.mockReturnValueOnce(early.promise);
    const earlyRead = serverStore.fetchModelsForServer(serverId);

    store.ensureLoaded(serverId, TARGET);
    await flush();
    early.resolve(list(routerRows({[TARGET]: 'loaded'})));
    await earlyRead;

    const record = store.recordFor(serverId, TARGET)!;
    expect(store.owns(record)).toBe(true);
  });

  it('counts a read made by someone else', async () => {
    const waiting = store.ensureLoaded(serverId, TARGET);
    await flush();

    await serverStore.fetchModelsForServer(serverId);
    expect(store.owns(store.recordFor(serverId, TARGET)!)).toBe(true);
    mockedFetch.mockResolvedValueOnce(list(routerRows({[TARGET]: 'loaded'})));
    await serverStore.fetchModelsForServer(serverId);

    await expect(waiting).resolves.toBe('ready');
  });

  it('corroborates a loading row without settling', async () => {
    store.ensureLoaded(serverId, TARGET);
    await flush();

    await read(routerRows({[TARGET]: 'loading'}));

    const record = store.recordFor(serverId, TARGET)!;
    expect(record.phase).toBe('active');
    expect(store.owns(record)).toBe(true);
  });

  it('stays requested when the server has not started on it yet', async () => {
    store.ensureLoaded(serverId, TARGET);
    await flush();

    await read(routerRows());

    const record = store.recordFor(serverId, TARGET)!;
    expect(record.phase).toBe('requested');
    expect(store.owns(record)).toBe(true);
  });

  it('fails a load the server took up and then dropped', async () => {
    const waiting = store.ensureLoaded(serverId, TARGET);
    await flush();
    await read(routerRows({[TARGET]: 'loading'}));

    await read(
      routerRows().map(row =>
        row.id === TARGET
          ? {...row, status: {value: 'unloaded', failed: true, exit_code: 1}}
          : row,
      ),
    );

    await expect(waiting).resolves.toBe('failed');
    expect(store.recordFor(serverId, TARGET)!.failure).toEqual({
      cause: 'load-failed',
      message: 'exit code 1',
    });
  });

  it('ends unreachable when the request cannot be made', async () => {
    mockedLoad.mockRejectedValueOnce(new Error('Network request failed'));

    await expect(store.ensureLoaded(serverId, TARGET)).resolves.toBe('failed');
    expect(store.recordFor(serverId, TARGET)!.failure).toEqual({
      cause: 'server-unreachable',
    });
  });

  it('replaces an ended failure with a new attempt', async () => {
    mockedLoad.mockRejectedValueOnce(new Error('Network request failed'));
    await store.ensureLoaded(serverId, TARGET);
    const failed = store.recordFor(serverId, TARGET)!;

    store.ensureLoaded(serverId, TARGET);
    await flush();

    const next = store.recordFor(serverId, TARGET)!;
    expect(next).not.toBe(failed);
    expect(next.failure).toBeUndefined();
    expect(mockedLoad).toHaveBeenCalledTimes(2);
  });
});

describe('a refused load', () => {
  beforeEach(async () => {
    await read(routerRows());
    jest.clearAllMocks();
    mockedFetch.mockResolvedValue(list(routerRows()));
  });

  it('ends ready and silent when the row is already resident', async () => {
    const early = deferred<ReturnType<typeof list>>();
    mockedFetch.mockReturnValueOnce(early.promise);
    const earlyRead = serverStore.fetchModelsForServer(serverId);
    const answer = deferred<{status: number; body: unknown}>();
    mockedLoad.mockReturnValueOnce(answer.promise);

    const waiting = store.ensureLoaded(serverId, TARGET);
    await flush();
    early.resolve(list(routerRows({[TARGET]: 'loaded'})));
    await earlyRead;
    answer.resolve({
      status: 400,
      body: {error: {code: 400, message: 'model is already running'}},
    });

    await expect(waiting).resolves.toBe('ready');
    expect(store.recordFor(serverId, TARGET)).toBeUndefined();
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it('asks the list, and fails with the bounded reason when it shows the model down', async () => {
    mockedLoad.mockResolvedValueOnce({
      status: 500,
      body: {error: {message: `  out of\n memory ${'x'.repeat(300)}`}},
    });
    mockedFetch.mockResolvedValueOnce(list(routerRows()));

    const waiting = store.ensureLoaded(serverId, TARGET);

    await expect(waiting).resolves.toBe('failed');
    const failure = store.recordFor(serverId, TARGET)!.failure!;
    expect(failure.cause).toBe('load-failed');
    expect(failure.message!.startsWith('out of memory xxx')).toBe(true);
    expect(Array.from(failure.message!)).toHaveLength(200);
  });

  it('keeps waiting when the row is loading', async () => {
    await read(routerRows({[TARGET]: 'loading'}));
    jest.clearAllMocks();
    mockedLoad.mockResolvedValueOnce({status: 400, body: null});

    store.ensureLoaded(serverId, TARGET);
    await flush();

    const record = store.recordFor(serverId, TARGET)!;
    expect(store.owns(record)).toBe(true);
    expect(record.verdictRequested).toBe(false);
    expect(mockedFetch).not.toHaveBeenCalled();
  });
});

describe('cancel and stop', () => {
  beforeEach(async () => {
    await read(routerRows());
    jest.clearAllMocks();
    mockedFetch.mockResolvedValue(list(routerRows()));
    mockedUnload.mockResolvedValue(accepted);
  });

  it('withdraws every waiter, aborts the request and unloads', async () => {
    const answer = deferred<typeof accepted>();
    mockedLoad.mockReturnValueOnce(answer.promise);
    const waiting = store.ensureLoaded(serverId, TARGET);
    await flush();
    const record = store.recordFor(serverId, TARGET)!;

    store.cancel(serverId, TARGET);

    await expect(waiting).resolves.toBe('withdrawn');
    expect(record.controller.signal.aborted).toBe(true);
    expect(mockedLoad.mock.calls[0][2].aborted).toBe(true);
    expect(store.recordFor(serverId, TARGET)!.kind).toBe('unload');
  });

  it('writes nothing when the request answers after a cancel', async () => {
    const answer = deferred<{status: number; body: unknown}>();
    mockedLoad.mockReturnValueOnce(answer.promise);
    store.ensureLoaded(serverId, TARGET);
    await flush();
    const record = store.recordFor(serverId, TARGET)!;
    store.cancel(serverId, TARGET);

    answer.resolve({status: 500, body: {error: 'late'}});
    await flush();

    expect(record.failure).toBeUndefined();
    expect(record.reason).toBeUndefined();
    expect(store.recordFor(serverId, TARGET)?.failure).toBeUndefined();
  });

  it('releases only the caller whose signal aborts', async () => {
    const caller = new AbortController();
    const send = store.ensureLoaded(serverId, TARGET, caller.signal);
    const select = store.ensureLoaded(serverId, TARGET);
    await flush();
    const record = store.recordFor(serverId, TARGET)!;

    caller.abort();

    await expect(send).resolves.toBe('stopped');
    expect(store.owns(record)).toBe(true);
    expect(record.controller.signal.aborted).toBe(false);
    expect(record.droppedTurn).toBe(true);

    store.ensureLoaded(serverId, TARGET);
    expect(record.droppedTurn).toBe(false);
    await read(routerRows({[TARGET]: 'loaded'}));
    await expect(select).resolves.toBe('ready');
  });

  it('settles an unload of a model already gone silently', async () => {
    await read(routerRows({[TARGET]: 'loaded'}));
    mockedUnload.mockResolvedValueOnce({
      status: 400,
      body: routerWireJson('unload-not-running-400.json'),
    });

    store.unload(serverId, TARGET);
    await flush();

    expect(store.recordFor(serverId, TARGET)).toBeUndefined();
  });

  it('posts no load when it is cancelled while the key is read', async () => {
    const key = deferred<{password: string; username: string}>();
    (Keychain.getGenericPassword as jest.Mock).mockReturnValueOnce(key.promise);
    const waiting = store.ensureLoaded(serverId, TARGET);
    await flush();

    store.cancel(serverId, TARGET);
    key.resolve({password: 'mockPass', username: 'mockUser'});
    await flush();

    await expect(waiting).resolves.toBe('withdrawn');
    expect(mockedLoad).not.toHaveBeenCalled();
  });

  it('keeps the unload a cancel started when the aborted request rejects', async () => {
    const answer = deferred<{status: number; body: unknown}>();
    mockedLoad.mockReturnValueOnce(answer.promise);
    const unloadAnswer = deferred<typeof accepted>();
    mockedUnload.mockReturnValueOnce(unloadAnswer.promise);
    store.ensureLoaded(serverId, TARGET);
    await flush();
    const load = store.recordFor(serverId, TARGET)!;

    store.cancel(serverId, TARGET);
    await flush();
    const unload = store.recordFor(serverId, TARGET)!;
    answer.reject(new Error('Aborted'));
    await flush();

    expect(load.failure).toBeUndefined();
    expect(store.recordFor(serverId, TARGET)).toBe(unload);
    expect(store.owns(unload)).toBe(true);
  });

  it('posts no unload for a server repointed while the key is read', async () => {
    await read(routerRows({[TARGET]: 'loaded'}));
    const key = deferred<{password: string; username: string}>();
    (Keychain.getGenericPassword as jest.Mock).mockReturnValueOnce(key.promise);
    store.unload(serverId, TARGET);
    await flush();

    runInAction(() =>
      serverStore.updateServer(serverId, {url: 'http://other:8080'}),
    );
    key.resolve({password: 'mockPass', username: 'mockUser'});
    await flush();

    expect(mockedUnload).not.toHaveBeenCalled();
  });

  it('asks for no read when an unload answers after its server was repointed', async () => {
    await read(routerRows({[TARGET]: 'loaded'}));
    const unloadAnswer = deferred<typeof accepted>();
    mockedUnload.mockReturnValueOnce(unloadAnswer.promise);
    store.unload(serverId, TARGET);
    await flush();
    mockedFetch.mockClear();

    runInAction(() =>
      serverStore.updateServer(serverId, {url: 'http://other:8080'}),
    );
    unloadAnswer.resolve(accepted);
    await flush();

    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('refuses an unload while a record is in flight on the key', async () => {
    store.ensureLoaded(serverId, TARGET);
    await flush();

    store.unload(serverId, TARGET);
    await flush();

    expect(mockedUnload).not.toHaveBeenCalled();
  });
});

describe('read scheduler', () => {
  beforeEach(async () => {
    await read(routerRows());
    jest.clearAllMocks();
  });

  it('runs one follow-up for any number of requests during a read', async () => {
    const first = deferred<ReturnType<typeof list>>();
    mockedFetch.mockReturnValueOnce(first.promise);
    mockedFetch.mockResolvedValue(list(routerRows()));
    const requestRead = (store as any).requestRead.bind(store);

    requestRead(serverId);
    requestRead(serverId);
    requestRead(serverId);
    await flush();
    expect(mockedFetch).toHaveBeenCalledTimes(1);

    first.resolve(list(routerRows()));
    await flush();

    expect(mockedFetch).toHaveBeenCalledTimes(2);
  });
});

describe('evidence lost and server edits', () => {
  beforeEach(async () => {
    await read(routerRows());
    jest.clearAllMocks();
    mockedLoad.mockResolvedValue(accepted);
  });

  it('ends not-router when a read shows the router gone', async () => {
    const waiting = store.ensureLoaded(serverId, TARGET);
    await flush();

    await read(directTextModelsBody.data, serverId, true);

    await expect(waiting).resolves.toBe('not-router');
    expect(store.recordFor(serverId, TARGET)).toBeUndefined();
  });

  it.each([
    [
      'the url is edited',
      () => serverStore.updateServer(serverId, {url: 'http://other:8080'}),
    ],
    ['the server is removed', () => serverStore.removeServer(serverId)],
  ])('withdraws silently when %s', async (_label, edit) => {
    const waiting = store.ensureLoaded(serverId, TARGET);
    await flush();
    const onRead = jest.spyOn(store as any, 'onRead');

    runInAction(edit);

    await expect(waiting).resolves.toBe('withdrawn');
    expect(store.recordFor(serverId, TARGET)).toBeUndefined();
    expect(serverStore.listReads[serverId]).toBeUndefined();
    expect(onRead).not.toHaveBeenCalled();
  });

  it('drops an ended failure when the server type changes', async () => {
    mockedLoad.mockRejectedValueOnce(new Error('Network request failed'));
    await store.ensureLoaded(serverId, TARGET);
    expect(store.recordFor(serverId, TARGET)!.failure).toBeDefined();

    runInAction(() =>
      serverStore.updateServer(serverId, {serverType: 'Ollama'}),
    );

    expect(store.recordFor(serverId, TARGET)).toBeUndefined();
  });
});

describe('ensureReady', () => {
  const binding = () => ({
    modelId: `${serverId}/${TARGET}`,
    serverId,
    remoteModelId: TARGET,
    url: 'http://desk:8080',
    serverType: 'llama.cpp' as ServerType,
  });

  beforeEach(async () => {
    await read(routerRows());
    jest.clearAllMocks();
  });

  it.each([
    ['withdrawn', RemoteModelRequestWithdrawnError],
    ['failed', RemoteModelNotReadyError],
  ])('rejects a %s load', async (outcome, ErrorClass) => {
    jest.spyOn(store as any, 'acquire').mockResolvedValueOnce({
      outcome,
      record: {failure: {cause: 'server-unreachable', message: 'secret words'}},
    });

    const error = await store
      .ensureReady(binding(), new AbortController().signal)
      .catch(e => e);

    expect(error).toBeInstanceOf(ErrorClass);
    if (outcome === 'failed') {
      expect(error.cause).toBe('server-unreachable');
      expect(error.message).not.toContain('secret words');
    }
  });

  it.each(['ready', 'not-router', 'stopped'])(
    'resolves a %s wait',
    async outcome => {
      jest.spyOn(store as any, 'acquire').mockResolvedValueOnce({outcome});

      await expect(
        store.ensureReady(binding(), new AbortController().signal),
      ).resolves.toBeUndefined();
    },
  );

  it('leaves a session bound to another url alone', async () => {
    const acquire = jest.spyOn(store as any, 'acquire');

    await store.ensureReady(
      {...binding(), url: 'http://elsewhere:8080'},
      new AbortController().signal,
    );

    expect(acquire).not.toHaveBeenCalled();
    expect(mockedLoad).not.toHaveBeenCalled();
    expect(mockedFetch).not.toHaveBeenCalled();
  });
});
