import {AppState} from 'react-native';
import {runInAction} from 'mobx';
import * as Keychain from 'react-native-keychain';
import DeviceInfo from 'react-native-device-info';
import {makePersistable} from 'mobx-persist-store';
import {LlamaContext} from 'llama.rn';

import {
  createdServers,
  createServer,
  FakeServer,
  FakeSocket,
} from '../../../__mocks__/external/react-native-tcp-socket';
import {mockModelStore} from '../../../__mocks__/stores/modelStore';
import {LocalCompletionEngine} from '../../api/completionEngines';

jest.mock('../ModelStore', () => ({
  modelStore: require('../../../__mocks__/stores/modelStore').mockModelStore,
}));

const appStateCallsBefore = (AppState.addEventListener as jest.Mock).mock.calls
  .length;
const {localApiServerStore: store} =
  require('../LocalApiServerStore') as typeof import('../LocalApiServerStore');
const appStateListener: (state: string) => void = (
  AppState.addEventListener as jest.Mock
).mock.calls
  .slice(appStateCallsBefore)
  .find(([event]) => event === 'change')[1];

const persistOptions = (makePersistable as jest.Mock).mock.calls.find(
  ([target]) => target === store,
)?.[1];

const getPassword = Keychain.getGenericPassword as jest.Mock;
const getIpAddress = DeviceInfo.getIpAddress as jest.Mock;

const flush = async () => {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
};

const lastServer = (): FakeServer => createdServers[createdServers.length - 1];

const startRunning = async () => {
  store.setEnabled(true);
  await flush();
  lastServer().emitListening();
  return lastServer();
};

const CHAT = (extraHeaders = '') => {
  const body = '{"messages":[{"role":"user","content":"hi"}],"stream":true}';
  return `POST /v1/chat/completions HTTP/1.1\r\nHost: 127.0.0.1:8080\r\n${extraHeaders}Content-Length: ${body.length}\r\n\r\n${body}`;
};

describe('LocalApiServerStore', () => {
  it('starts disabled and stopped every launch', () => {
    expect(store.enabled).toBe(false);
    expect(store.status).toBe('stopped');
    expect(store.baseUrl).toBeUndefined();
  });

  it('persists only the port and the LAN switch', () => {
    expect(persistOptions).toMatchObject({
      name: 'LocalApiServerStore',
      properties: ['port', 'lanEnabled'],
    });
  });

  it('learns whether a key exists from the Keychain at launch', () => {
    expect(store.hasApiKey).toBe(true);
  });

  it('assumes no key at launch when the Keychain read fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    let isolated!: typeof store;
    jest.isolateModules(() => {
      require('react-native-keychain').getGenericPassword.mockRejectedValueOnce(
        new Error('locked'),
      );
      isolated = require('../LocalApiServerStore').localApiServerStore;
    });
    await flush();
    expect(isolated.hasApiKey).toBe(false);
    warn.mockRestore();
  });
});

describe('LocalApiServerStore lifecycle', () => {
  let warn: jest.SpyInstance;

  beforeAll(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterAll(() => {
    warn.mockRestore();
  });

  beforeEach(() => {
    store.setEnabled(false);
    runInAction(() => {
      store.port = 8080;
      store.lanEnabled = false;
      store.lastError = undefined;
      store.lanAddress = undefined;
    });
    createdServers.length = 0;
    getPassword.mockClear();
    getIpAddress.mockClear();
    mockModelStore.resetGenerationSlot();
    mockModelStore.engine = undefined;
  });

  it('binds loopback by default and shows the loopback URL', async () => {
    store.setEnabled(true);
    expect(store.status).toBe('starting');
    await flush();
    const server = lastServer();
    expect(server.listen).toHaveBeenCalledWith({
      port: 8080,
      host: '127.0.0.1',
    });
    expect(getIpAddress).not.toHaveBeenCalled();

    server.emitListening();
    expect(store.status).toBe('running');
    expect(store.baseUrl).toBe('http://127.0.0.1:8080/v1');
    expect(server.options.allowHalfOpen).toBe(true);
  });

  it('binds all interfaces with LAN on and shows the Wi-Fi address', async () => {
    store.setLanEnabled(true);
    store.setPort(9090);
    const server = await startRunning();
    expect(server.listen).toHaveBeenCalledWith({port: 9090, host: '0.0.0.0'});
    expect(store.baseUrl).toBe('http://192.168.1.23:9090/v1');
  });

  it('falls back to the loopback URL when not on Wi-Fi', async () => {
    store.setLanEnabled(true);
    getIpAddress.mockResolvedValueOnce('0.0.0.0');
    await startRunning();
    expect(store.lanAddress).toBeUndefined();
    expect(store.baseUrl).toBe('http://127.0.0.1:8080/v1');
  });

  it('fails with port_in_use when the port is taken, and stops on toggle off', async () => {
    store.setEnabled(true);
    await flush();
    lastServer().emitError(new Error('EADDRINUSE: address already in use'));
    expect(store.status).toBe('failed');
    expect(store.lastError).toBe('port_in_use');
    expect(store.baseUrl).toBeUndefined();

    store.setEnabled(false);
    expect(store.status).toBe('stopped');
  });

  it.each([
    ['bind failed: EADDRINUSE (Address already in use)', 'port_in_use'],
    [new Error('Address already in use'), 'port_in_use'],
    ['permission denied', 'listen_failed'],
    [new Error('permission denied'), 'listen_failed'],
    ['', 'listen_failed'],
  ])('maps the native error %p to %s', async (error, kind) => {
    store.setEnabled(true);
    await flush();
    lastServer().emit('error', error);
    expect(store.lastError).toBe(kind);
  });

  it('fails with stopped_listening when a running listener closes', async () => {
    await startRunning();
    lastServer().emit('close');
    expect(store.status).toBe('failed');
    expect(store.lastError).toBe('stopped_listening');
  });

  it('never listens when toggled off before the Keychain read resolves', async () => {
    let resolveKey!: (value: false) => void;
    getPassword.mockImplementationOnce(
      () => new Promise(resolve => (resolveKey = resolve)),
    );
    store.setEnabled(true);
    store.setEnabled(false);
    resolveKey(false);
    await flush();

    expect(createdServers).toHaveLength(0);
    expect(store.status).toBe('stopped');
  });

  it('closes a half-open listener and ignores its late events', async () => {
    store.setEnabled(true);
    await flush();
    const server = lastServer();
    store.setEnabled(false);
    expect(server.close).toHaveBeenCalledTimes(1);

    server.emitListening();
    expect(server.close).toHaveBeenCalledTimes(2);
    server.emitError(new Error('late'));
    expect(store.status).toBe('stopped');
    expect(store.lastError).toBeUndefined();
  });

  it('ignores a second start while starting', async () => {
    store.setEnabled(true);
    store.start();
    await flush();
    expect(createdServers).toHaveLength(1);
  });

  it('ignores events from a listener replaced by a restart', async () => {
    store.setEnabled(true);
    await flush();
    const old = lastServer();
    old.emitError(new Error('first'));
    store.start();
    await flush();
    old.emit('close');
    old.emitError(new Error('stale'));
    expect(store.status).toBe('starting');
    lastServer().emitListening();
    expect(store.status).toBe('running');
  });

  it('refuses config changes unless stopped', async () => {
    await startRunning();
    expect(store.setPort(9000)).toBe(false);
    expect(store.setLanEnabled(true)).toBe(false);
    await expect(store.setApiKey('k')).resolves.toBe(false);
    await expect(store.clearApiKey()).resolves.toBe(false);
    expect(store.port).toBe(8080);
    expect(store.lanEnabled).toBe(false);
  });

  it.each([1023, 65536, 80.5, NaN])('rejects port %p', port => {
    expect(store.setPort(port)).toBe(false);
    expect(store.port).toBe(8080);
  });

  it.each([1024, 65535])('accepts port %p', port => {
    expect(store.setPort(port)).toBe(true);
    expect(store.port).toBe(port);
  });

  it('stores and clears the key in its own Keychain service', async () => {
    await expect(store.setApiKey('secret')).resolves.toBe(true);
    expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
      'apiKey',
      'secret',
      {service: 'local_api_server_key'},
    );
    expect(store.hasApiKey).toBe(true);

    await expect(store.clearApiKey()).resolves.toBe(true);
    expect(Keychain.resetGenericPassword).toHaveBeenCalledWith({
      service: 'local_api_server_key',
    });
    expect(store.hasApiKey).toBe(false);
  });

  it('restarts a failed listener on foreground while enabled', async () => {
    store.setEnabled(true);
    await flush();
    lastServer().emitError(new Error('gone'));
    appStateListener('active');
    expect(store.status).toBe('starting');
    await flush();
    lastServer().emitListening();
    expect(store.status).toBe('running');
  });

  it('does not start on foreground while disabled', async () => {
    appStateListener('active');
    await flush();
    expect(createdServers).toHaveLength(0);
  });

  it('refreshes the LAN address on foreground while running', async () => {
    store.setLanEnabled(true);
    await startRunning();
    getIpAddress.mockResolvedValueOnce('10.0.0.7');
    appStateListener('active');
    await flush();
    expect(store.baseUrl).toBe('http://10.0.0.7:8080/v1');
  });

  it('keeps serving in the background', async () => {
    await startRunning();
    appStateListener('background');
    expect(store.status).toBe('running');
  });

  it('destroys a connection that arrives for a stopped listener', async () => {
    const server = await startRunning();
    store.setEnabled(false);
    const socket = server.connect();
    expect(socket.destroyed).toBe(true);
  });

  it('guards requests with the Keychain key', async () => {
    getPassword.mockResolvedValueOnce({username: 'apiKey', password: 'k1'});
    const server = await startRunning();
    const socket = server.connect();
    socket.receive(CHAT());
    await flush();
    expect(socket.output).toMatch(/^HTTP\/1\.1 401 /);
  });

  it('aborts and ends a streaming lease when stopped mid-stream', async () => {
    getPassword.mockResolvedValueOnce(false);
    const context = {
      completion: jest.fn(
        (_params: unknown, onData: (data: {content: string}) => void) =>
          new Promise(resolve => {
            onData({content: 'a'});
            context.stopCompletion.mockImplementation(async () =>
              resolve({text: '', content: '', interrupted: true}),
            );
          }),
      ),
      stopCompletion: jest.fn(),
    };
    mockModelStore.engine = new LocalCompletionEngine(
      context as unknown as LlamaContext,
    );
    const server = await startRunning();
    const socket: FakeSocket = server.connect();
    socket.receive(CHAT());
    await flush();
    expect(socket.output).toContain('data: ');
    expect(store.activeRequests).toBe(1);
    expect(mockModelStore.isGenerationBusy).toBe(true);

    store.setEnabled(false);
    await flush();

    expect(socket.destroyed).toBe(true);
    expect(context.stopCompletion).toHaveBeenCalledTimes(1);
    expect(mockModelStore.isGenerationBusy).toBe(false);
    expect(store.activeRequests).toBe(0);
    expect(server.close).toHaveBeenCalled();
    expect(store.status).toBe('stopped');
  });

  it('never logs the key', async () => {
    const spies = (['log', 'warn', 'error', 'info'] as const).map(level =>
      jest.spyOn(console, level),
    );
    getPassword.mockResolvedValueOnce({username: 'apiKey', password: 'k1'});
    const server = await startRunning();
    const socket = server.connect();
    socket.receive(CHAT('Authorization: Bearer nope\r\n'));
    await flush();
    store.setEnabled(false);

    for (const spy of spies) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain('k1');
      spy.mockRestore();
    }
  });
});

describe('LocalApiServerStore races and requests', () => {
  let warn: jest.SpyInstance;

  beforeAll(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterAll(() => {
    warn.mockRestore();
  });

  const MODELS = 'GET /v1/models HTTP/1.1\r\nHost: 127.0.0.1:8080\r\n\r\n';

  /** A llama context whose completions the test settles one at a time. */
  const heldContext = () => {
    const settlers: ((value: unknown) => void)[] = [];
    const context = {
      completion: jest.fn(() => new Promise(resolve => settlers.push(resolve))),
      stopCompletion: jest.fn(async () => undefined),
    };
    mockModelStore.engine = new LocalCompletionEngine(
      context as unknown as LlamaContext,
    );
    return {
      context,
      settle: (i: number) => settlers[i]({text: 'ok', content: 'ok'}),
    };
  };

  const startWithoutKey = async () => {
    getPassword.mockResolvedValueOnce(false);
    return startRunning();
  };

  beforeEach(() => {
    store.setEnabled(false);
    runInAction(() => {
      store.port = 8080;
      store.lanEnabled = false;
      store.lastError = undefined;
      store.lanAddress = undefined;
    });
    createdServers.length = 0;
    getPassword.mockClear();
    getIpAddress.mockClear();
    mockModelStore.resetGenerationSlot();
    mockModelStore.engine = undefined;
    runInAction(() => {
      mockModelStore.activeModelId = 'model-1';
    });
  });

  afterEach(() => {
    runInAction(() => {
      mockModelStore.activeModelId = undefined;
    });
  });

  it('never listens when toggled off while reading the Wi-Fi address', async () => {
    store.setLanEnabled(true);
    let resolveIp!: (value: string) => void;
    getIpAddress.mockImplementationOnce(
      () => new Promise(resolve => (resolveIp = resolve)),
    );
    store.setEnabled(true);
    await flush();
    expect(getIpAddress).toHaveBeenCalled();
    store.setEnabled(false);
    resolveIp('192.168.1.23');
    await flush();

    expect(createdServers).toHaveLength(0);
    expect(store.status).toBe('stopped');
    expect(store.lanAddress).toBeUndefined();
  });

  it('stays running when the old listener closes late after a restart', async () => {
    const old = await startRunning();
    store.setEnabled(false);
    const current = await startRunning();
    expect(current).not.toBe(old);
    old.emit('close');
    old.emitError(new Error('late'));

    expect(store.status).toBe('running');
    expect(store.lastError).toBeUndefined();
  });

  it('ignores a late listening from a listener that already failed', async () => {
    store.setEnabled(true);
    await flush();
    const first = lastServer();
    first.emitError(new Error('EADDRINUSE'));
    store.setEnabled(false);
    first.emitListening();

    expect(store.status).toBe('stopped');
    expect(first.close).toHaveBeenCalled();
  });

  it.each([
    ['error then close', ['error', 'close']],
    ['close then error', ['close', 'error']],
  ])('keeps the bind error when the listener reports %s', async (_, order) => {
    store.setEnabled(true);
    await flush();
    const server = lastServer();
    for (const event of order) {
      if (event === 'error') {
        server.emit(
          'error',
          'bind failed: EADDRINUSE (Address already in use)',
        );
      } else {
        server.emit('close');
      }
    }

    expect(store.status).toBe('failed');
    expect(store.lastError).toBe('port_in_use');
  });

  it('fails with listen_failed when listen throws', async () => {
    createServer.mockImplementationOnce((options: object) => {
      const server = new FakeServer(options);
      server.listen.mockImplementation(() => {
        throw new Error('permission denied');
      });
      createdServers.push(server);
      return server;
    });
    store.setEnabled(true);
    await flush();

    expect(store.status).toBe('failed');
    expect(store.lastError).toBe('listen_failed');
  });

  it('answers 503 server_busy to a third concurrent chat request', async () => {
    const held = heldContext();
    const server = await startWithoutKey();
    const body = '{"messages":[{"role":"user","content":"hi"}]}';
    const post = `POST /v1/chat/completions HTTP/1.1\r\nHost: 127.0.0.1:8080\r\nContent-Length: ${body.length}\r\n\r\n${body}`;
    const sockets = [server.connect(), server.connect(), server.connect()];
    sockets.forEach(socket => socket.receive(post));
    await flush();

    expect(store.activeRequests).toBe(2);
    expect(sockets[2].output).toMatch(/^HTTP\/1\.1 503 /);
    expect(sockets[2].output).toContain('"code":"server_busy"');
    expect(held.context.completion).toHaveBeenCalledTimes(1);

    held.settle(0);
    await flush();
    held.settle(1);
    await flush();
    expect(store.activeRequests).toBe(0);
    expect(mockModelStore.isGenerationBusy).toBe(false);
  });

  it('ends at once the lease of a client that left while waiting', async () => {
    const held = heldContext();
    const server = await startWithoutKey();
    const chatLease = (await mockModelStore.acquireGeneration())!;
    const socket = server.connect();
    socket.receive(CHAT());
    await flush();
    expect(store.activeRequests).toBe(1);

    socket.peerClose();
    await flush();
    expect(store.activeRequests).toBe(1);

    chatLease.end();
    await flush();
    expect(held.context.completion).not.toHaveBeenCalled();
    expect(store.activeRequests).toBe(0);
    expect(mockModelStore.isGenerationBusy).toBe(false);
  });

  it('drops a waiting request when stopped, without a completion', async () => {
    const held = heldContext();
    const server = await startWithoutKey();
    const chatLease = (await mockModelStore.acquireGeneration())!;
    const socket = server.connect();
    socket.receive(CHAT());
    await flush();

    store.setEnabled(false);
    expect(socket.destroyed).toBe(true);
    chatLease.end();
    await flush();

    expect(held.context.completion).not.toHaveBeenCalled();
    expect(store.activeRequests).toBe(0);
    expect(mockModelStore.isGenerationBusy).toBe(false);
  });

  it('lists the local model, and none while a remote model is active', async () => {
    heldContext();
    const server = await startWithoutKey();
    const local = server.connect();
    local.receive(MODELS);
    await flush();
    expect(local.output).toContain('"id":"model-1"');

    mockModelStore.engine = {
      completion: jest.fn(),
      stopCompletion: jest.fn(),
    } as never;
    const remote = server.connect();
    remote.receive(MODELS);
    await flush();
    expect(remote.output).toContain('"data":[]');
    expect(store.servedModelId).toBeUndefined();
  });

  it('reads the key again on every start', async () => {
    getPassword.mockResolvedValueOnce({username: 'apiKey', password: 'k1'});
    const first = await startRunning();
    const guarded = first.connect();
    guarded.receive(MODELS);
    await flush();
    expect(guarded.output).toMatch(/^HTTP\/1\.1 401 /);

    store.setEnabled(false);
    const second = await startWithoutKey();
    const open = second.connect();
    open.receive(MODELS);
    await flush();
    expect(open.output).toMatch(/^HTTP\/1\.1 200 /);
    expect(store.hasApiKey).toBe(false);
  });

  it('fails without listening when the Keychain read fails', async () => {
    runInAction(() => {
      store.hasApiKey = true;
    });
    getPassword.mockRejectedValueOnce(new Error('locked'));
    store.setEnabled(true);
    await flush();

    expect(store.status).toBe('failed');
    expect(store.lastError).toBe('key_unavailable');
    expect(createdServers).toHaveLength(0);
    expect(getIpAddress).not.toHaveBeenCalled();
    expect(store.hasApiKey).toBe(true);
  });

  it('starts open after a failed read once the key is cleared', async () => {
    getPassword.mockRejectedValueOnce(new Error('locked'));
    store.setEnabled(true);
    await flush();
    expect(store.status).toBe('failed');

    store.setEnabled(false);
    await expect(store.clearApiKey()).resolves.toBe(true);
    await startWithoutKey();
    expect(store.status).toBe('running');
    expect(store.hasApiKey).toBe(false);
  });

  it('reports a failed Keychain write or removal and keeps hasApiKey', async () => {
    runInAction(() => {
      store.hasApiKey = false;
    });
    (Keychain.setGenericPassword as jest.Mock).mockRejectedValueOnce(
      new Error('no'),
    );
    await expect(store.setApiKey('secret')).resolves.toBe(false);
    expect(store.hasApiKey).toBe(false);

    runInAction(() => {
      store.hasApiKey = true;
    });
    (Keychain.resetGenericPassword as jest.Mock).mockRejectedValueOnce(
      new Error('no'),
    );
    await expect(store.clearApiKey()).resolves.toBe(false);
    expect(store.hasApiKey).toBe(true);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret');
  });

  it('refuses an empty key', async () => {
    await expect(store.setApiKey('')).resolves.toBe(false);
  });

  it('shows the loopback URL when the Wi-Fi address cannot be read', async () => {
    store.setLanEnabled(true);
    getIpAddress.mockRejectedValueOnce(new Error('no wifi'));
    await startRunning();
    expect(store.lanAddress).toBeUndefined();
    expect(store.baseUrl).toBe('http://127.0.0.1:8080/v1');
  });
});
