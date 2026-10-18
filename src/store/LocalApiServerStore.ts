import {AppState, AppStateStatus, Platform} from 'react-native';
import {makeAutoObservable, runInAction} from 'mobx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {makePersistable} from 'mobx-persist-store';
import * as Keychain from 'react-native-keychain';
import DeviceInfo from 'react-native-device-info';
import TcpSocket from 'react-native-tcp-socket';

import {LocalCompletionEngine} from '../api/completionEngines';
import {
  ConnectionContext,
  ConnectionSocket,
  handleConnection,
  MAX_ADMITTED_REQUESTS,
  OpenConnection,
  serveChatCompletion,
} from '../services/localApiServer';
import {modelStore} from './ModelStore';

const KEYCHAIN_SERVICE = 'local_api_server_key';
const LOOPBACK_HOST = '127.0.0.1';
const ALL_INTERFACES_HOST = '0.0.0.0';

export const DEFAULT_LOCAL_API_PORT = 8080;
export const MIN_LOCAL_API_PORT = 1024;
export const MAX_LOCAL_API_PORT = 65535;

export type LocalApiServerStatus =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'failed';

export type LocalApiServerError =
  | 'port_in_use'
  | 'listen_failed'
  | 'stopped_listening'
  | 'key_unavailable';

type Listener = ReturnType<typeof TcpSocket.createServer>;

type KeyRead = {kind: 'found'; key: string} | {kind: 'none'} | {kind: 'error'};

export const isValidLocalApiPort = (port: number) =>
  Number.isInteger(port) &&
  port >= MIN_LOCAL_API_PORT &&
  port <= MAX_LOCAL_API_PORT;

const toListenError = (error: unknown): LocalApiServerError => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  console.warn('[LocalApiServerStore] listen failed:', message);
  return /EADDRINUSE|address already in use/i.test(message)
    ? 'port_in_use'
    : 'listen_failed';
};

const usableAddress = (address: string) =>
  /^\d{1,3}(\.\d{1,3}){3}$/.test(address) && address !== ALL_INTERFACES_HOST
    ? address
    : undefined;

/**
 * Owns the local API listener. Every `start()` and `stop()` moves the epoch,
 * and a listener event or `start()` continuation from an older epoch changes
 * nothing, so a toggle race or a late native event cannot revive a stopped
 * server.
 */
class LocalApiServerStore {
  enabled = false;
  status: LocalApiServerStatus = 'stopped';
  lastError: LocalApiServerError | undefined = undefined;
  port = DEFAULT_LOCAL_API_PORT;
  lanEnabled = false;
  hasApiKey = false;
  lanAddress: string | undefined = undefined;
  activeRequests = 0;

  private apiKey: string | undefined = undefined;
  private epoch = 0;
  private wentToBackground = false;
  private listener: Listener | undefined = undefined;
  private readonly openConnections = new Set<OpenConnection>();

  constructor() {
    makeAutoObservable<
      LocalApiServerStore,
      'apiKey' | 'epoch' | 'wentToBackground' | 'listener' | 'openConnections'
    >(this, {
      apiKey: false,
      epoch: false,
      wentToBackground: false,
      listener: false,
      openConnections: false,
    });
    makePersistable(this, {
      name: 'LocalApiServerStore',
      properties: ['port', 'lanEnabled'],
      storage: AsyncStorage,
    });
    this.readApiKey().then(read => {
      if (read.kind !== 'error') {
        runInAction(() => {
          this.hasApiKey = read.kind === 'found';
        });
      }
    });
    AppState.addEventListener('change', this.handleAppStateChange);
  }

  get baseUrl(): string | undefined {
    if (this.status !== 'running') {
      return undefined;
    }
    const host =
      this.lanEnabled && this.lanAddress ? this.lanAddress : LOOPBACK_HOST;
    return `http://${host}:${this.port}/v1`;
  }

  get servedModelId(): string | undefined {
    return modelStore.engine instanceof LocalCompletionEngine
      ? modelStore.activeModelId
      : undefined;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) {
      this.start();
    } else {
      this.stop();
    }
  }

  setPort(port: number): boolean {
    if (this.status !== 'stopped' || !isValidLocalApiPort(port)) {
      return false;
    }
    this.port = port;
    return true;
  }

  setLanEnabled(lanEnabled: boolean): boolean {
    if (this.status !== 'stopped') {
      return false;
    }
    this.lanEnabled = lanEnabled;
    return true;
  }

  async setApiKey(apiKey: string): Promise<boolean> {
    if (this.status !== 'stopped' || apiKey.length === 0) {
      return false;
    }
    try {
      await Keychain.setGenericPassword('apiKey', apiKey, {
        service: KEYCHAIN_SERVICE,
      });
    } catch {
      console.warn('[LocalApiServerStore] could not save the API key');
      return false;
    }
    runInAction(() => {
      this.hasApiKey = true;
    });
    return true;
  }

  async clearApiKey(): Promise<boolean> {
    if (this.status !== 'stopped') {
      return false;
    }
    try {
      await Keychain.resetGenericPassword({service: KEYCHAIN_SERVICE});
    } catch {
      console.warn('[LocalApiServerStore] could not remove the API key');
      return false;
    }
    runInAction(() => {
      this.hasApiKey = false;
    });
    return true;
  }

  async start(): Promise<void> {
    if (this.status !== 'stopped' && this.status !== 'failed') {
      return;
    }
    this.epoch += 1;
    const epoch = this.epoch;
    this.status = 'starting';
    this.lastError = undefined;

    const keyRead = await this.readApiKey();
    if (epoch !== this.epoch) {
      return;
    }
    if (keyRead.kind === 'error') {
      this.fail(epoch, 'key_unavailable');
      return;
    }
    const apiKey = keyRead.kind === 'found' ? keyRead.key : undefined;
    const lanAddress = this.lanEnabled
      ? await this.readLanAddress()
      : undefined;
    if (epoch !== this.epoch) {
      return;
    }
    runInAction(() => {
      this.apiKey = apiKey;
      this.hasApiKey = apiKey !== undefined;
      this.lanAddress = lanAddress;
      this.listen(epoch);
    });
  }

  stop(): void {
    this.epoch += 1;
    this.status = 'stopped';
    this.apiKey = undefined;
    const listener = this.listener;
    this.listener = undefined;
    listener?.close();
    [...this.openConnections].forEach(connection => connection.destroy());
  }

  private listen(epoch: number): void {
    const context = this.connectionContext();
    const listener = TcpSocket.createServer({allowHalfOpen: true}, socket =>
      this.acceptConnection(socket, epoch, context),
    );
    this.listener = listener;

    listener.on('listening', () => {
      if (epoch !== this.epoch) {
        listener.close();
        return;
      }
      runInAction(() => {
        this.status = 'running';
      });
    });
    listener.on('error', (error: Error | string) =>
      this.fail(epoch, toListenError(error)),
    );
    listener.on('close', () => {
      if (this.status === 'running') {
        this.fail(epoch, 'stopped_listening');
      }
    });
    try {
      listener.listen({
        port: this.port,
        host: this.lanEnabled ? ALL_INTERFACES_HOST : LOOPBACK_HOST,
      });
    } catch (error) {
      this.fail(epoch, toListenError(error));
    }
  }

  private fail(epoch: number, error: LocalApiServerError): void {
    if (epoch !== this.epoch) {
      return;
    }
    runInAction(() => {
      this.status = 'failed';
      this.lastError = error;
      this.listener = undefined;
    });
  }

  private acceptConnection(
    socket: ConnectionSocket,
    epoch: number,
    context: ConnectionContext,
  ): void {
    if (epoch !== this.epoch) {
      socket.destroy();
      return;
    }
    handleConnection(socket, context);
  }

  private connectionContext(): ConnectionContext {
    return {
      openConnections: this.openConnections,
      admit: this.admitRequest,
      release: this.releaseRequest,
      routerDeps: {
        getApiKey: () => this.apiKey,
        getServedModelId: () => this.servedModelId,
        listenerStartedAt: Math.floor(Date.now() / 1000),
      },
      handleChat: serveChatCompletion,
    };
  }

  private admitRequest = (): boolean => {
    if (this.activeRequests >= MAX_ADMITTED_REQUESTS) {
      return false;
    }
    this.activeRequests += 1;
    return true;
  };

  private releaseRequest = (): void => {
    this.activeRequests -= 1;
  };

  private async readApiKey(): Promise<KeyRead> {
    try {
      const credentials = await Keychain.getGenericPassword({
        service: KEYCHAIN_SERVICE,
      });
      return credentials
        ? {kind: 'found', key: credentials.password}
        : {kind: 'none'};
    } catch {
      console.warn('[LocalApiServerStore] could not read the API key');
      return {kind: 'error'};
    }
  }

  private async readLanAddress(): Promise<string | undefined> {
    try {
      return usableAddress(await DeviceInfo.getIpAddress());
    } catch {
      return undefined;
    }
  }

  private handleAppStateChange = async (state: AppStateStatus) => {
    if (Platform.OS === 'ios' && state === 'background') {
      this.wentToBackground = true;
      return;
    }
    if (state !== 'active') {
      return;
    }
    if (Platform.OS === 'ios' && this.wentToBackground) {
      this.wentToBackground = false;
      if (this.enabled) {
        this.stop();
        this.start();
        return;
      }
    }
    if (
      this.enabled &&
      (this.status === 'stopped' || this.status === 'failed')
    ) {
      this.start();
      return;
    }
    if (this.lanEnabled && this.status === 'running') {
      const lanAddress = await this.readLanAddress();
      runInAction(() => {
        this.lanAddress = lanAddress;
      });
    }
  };
}

export const localApiServerStore = new LocalApiServerStore();
