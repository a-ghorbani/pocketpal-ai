import {AppState} from 'react-native';
import {runInAction} from 'mobx';
import * as Keychain from 'react-native-keychain';
import DeviceInfo from 'react-native-device-info';
import {makePersistable} from 'mobx-persist-store';
import {LlamaContext} from 'llama.rn';

import {
  createdServers,
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
});

describe('LocalApiServerStore lifecycle', () => {
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

  it('fails with the reason when the port is in use, and stops on toggle off', async () => {
    store.setEnabled(true);
    await flush();
    lastServer().emitError(new Error('EADDRINUSE: address already in use'));
    expect(store.status).toBe('failed');
    expect(store.lastError).toBe('EADDRINUSE: address already in use');
    expect(store.baseUrl).toBeUndefined();

    store.setEnabled(false);
    expect(store.status).toBe('stopped');
  });

  it('shows a native error delivered as a string', async () => {
    store.setEnabled(true);
    await flush();
    lastServer().emit(
      'error',
      'bind failed: EADDRINUSE (Address already in use)',
    );
    expect(store.lastError).toBe(
      'bind failed: EADDRINUSE (Address already in use)',
    );
  });

  it('fails when a running listener closes', async () => {
    await startRunning();
    lastServer().emit('close');
    expect(store.status).toBe('failed');
    expect(store.lastError).toBeDefined();
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
