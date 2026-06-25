import {AppState, AppStateStatus} from 'react-native';
import {makeAutoObservable, observable, runInAction} from 'mobx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {makePersistable} from 'mobx-persist-store';
import * as Keychain from 'react-native-keychain';

import {fetchModels, testConnection, RemoteModelInfo} from '../api/openai';
import {ServerConfig} from '../utils/types';
import {ReasoningCapability} from '../utils/reasoningCapability';

const KEYCHAIN_SERVICE_PREFIX = 'pocketpal-server-';

/** Minimum interval between auto-fetch cycles (ms) */
const FETCH_THROTTLE_MS = 60000;

class ServerStore {
  servers: ServerConfig[] = [];
  // Remote reasoning capability keyed by full model id (`${serverId}/${remoteModelId}`).
  // Remote Models are rebuilt each launch and not persisted, so their capability
  // lives here and persists with the store.
  remoteReasoning: Record<string, ReasoningCapability> = {};
  serverModels: Map<string, RemoteModelInfo[]> = observable.map();
  userSelectedModels: Array<{serverId: string; remoteModelId: string}> = [];
  isLoading = false;
  error: string | null = null;
  privacyNoticeAcknowledged = false;

  private lastFetchTime = 0;
  private appStateSubscription: any = null;

  constructor() {
    makeAutoObservable(this, {
      serverModels: observable,
    });

    makePersistable(this, {
      name: 'ServerStore',
      properties: [
        'servers',
        'privacyNoticeAcknowledged',
        'userSelectedModels',
        'remoteReasoning',
      ],
      storage: AsyncStorage,
    }).then(() => {
      // After hydration, fetch models for all servers
      this.fetchAllRemoteModels();
    });

    this.setupAppStateListener();
  }

  // Actions
  addServer(config: Omit<ServerConfig, 'id'>): string {
    const id = `server-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newServer: ServerConfig = {
      ...config,
      id,
    };
    this.servers.push(newServer);
    return id;
  }

  updateServer(id: string, updates: Partial<ServerConfig>): void {
    const server = this.servers.find(s => s.id === id);
    if (server) {
      Object.assign(server, updates);
    }
  }

  removeServer(id: string): void {
    this.servers = this.servers.filter(s => s.id !== id);
    this.serverModels.delete(id);
    // Remove all user-selected models for this server
    this.userSelectedModels = this.userSelectedModels.filter(
      m => m.serverId !== id,
    );
    // Drop remote reasoning entries keyed by this server's model ids.
    const prefix = `${id}/`;
    this.remoteReasoning = Object.fromEntries(
      Object.entries(this.remoteReasoning).filter(
        ([k]) => !k.startsWith(prefix),
      ),
    );
    // Clean up API key from keychain
    this.removeApiKey(id);
  }

  addUserSelectedModel(serverId: string, remoteModelId: string): void {
    const exists = this.userSelectedModels.some(
      m => m.serverId === serverId && m.remoteModelId === remoteModelId,
    );
    if (!exists) {
      this.userSelectedModels.push({serverId, remoteModelId});
    }
  }

  removeUserSelectedModel(serverId: string, remoteModelId: string): void {
    this.userSelectedModels = this.userSelectedModels.filter(
      m => !(m.serverId === serverId && m.remoteModelId === remoteModelId),
    );
  }

  /**
   * Learn-from-stream writer for a remote model. Flips axis-1 to learned 'yes'
   * the first time the model actually emits reasoning. Idempotent and monotonic:
   * a no-op once axis-1 is already 'yes', and never overrides a user declaration.
   */
  recordRemoteReasoningObserved(modelId: string): void {
    const existing = this.remoteReasoning[modelId];
    if (existing?.source === 'user' || existing?.isReasoning === 'yes') {
      return;
    }
    this.remoteReasoning[modelId] = {
      isReasoning: 'yes',
      source: 'learned',
      supportsEffort: existing?.supportsEffort ?? false,
      effortValues: existing?.effortValues ?? [],
      effortSource: existing?.effortSource ?? 'none',
    };
  }

  /** Manual model-card override for a remote model. Top of precedence. */
  setRemoteReasoningOverride(modelId: string, cap: ReasoningCapability): void {
    this.remoteReasoning[modelId] = cap;
  }

  removeServerIfOrphaned(serverId: string): void {
    const hasModels = this.userSelectedModels.some(
      m => m.serverId === serverId,
    );
    if (!hasModels) {
      this.removeServer(serverId);
    }
  }

  getModelsNotYetAdded(serverId: string): RemoteModelInfo[] {
    const allModels = this.serverModels.get(serverId) || [];
    return allModels.filter(
      m =>
        !this.userSelectedModels.some(
          sel => sel.serverId === serverId && sel.remoteModelId === m.id,
        ),
    );
  }

  getUserSelectedModelsForServer(
    serverId: string,
  ): Array<{serverId: string; remoteModelId: string}> {
    return this.userSelectedModels.filter(m => m.serverId === serverId);
  }

  // API key management (Keychain)
  async setApiKey(serverId: string, apiKey: string): Promise<void> {
    try {
      await Keychain.setGenericPassword('apiKey', apiKey, {
        service: `${KEYCHAIN_SERVICE_PREFIX}${serverId}`,
      });
    } catch (error) {
      console.error('Failed to save API key:', error);
    }
  }

  async getApiKey(serverId: string): Promise<string | undefined> {
    try {
      const credentials = await Keychain.getGenericPassword({
        service: `${KEYCHAIN_SERVICE_PREFIX}${serverId}`,
      });
      if (credentials) {
        return credentials.password;
      }
      return undefined;
    } catch (error) {
      console.error('Failed to load API key:', error);
      return undefined;
    }
  }

  async removeApiKey(serverId: string): Promise<void> {
    try {
      await Keychain.resetGenericPassword({
        service: `${KEYCHAIN_SERVICE_PREFIX}${serverId}`,
      });
    } catch (error) {
      console.error('Failed to remove API key:', error);
    }
  }

  // Remote model fetching
  async fetchModelsForServer(serverId: string): Promise<void> {
    const server = this.servers.find(s => s.id === serverId);
    if (!server) {
      return;
    }

    runInAction(() => {
      this.isLoading = true;
      this.error = null;
    });

    try {
      const apiKey = await this.getApiKey(serverId);
      const models = await fetchModels(
        server.url,
        apiKey,
        server.requestTimeoutMs,
      );

      runInAction(() => {
        this.serverModels.set(serverId, models);
        this.isLoading = false;

        // Update lastConnected timestamp
        const s = this.servers.find(sv => sv.id === serverId);
        if (s) {
          s.lastConnected = Date.now();
        }
      });
    } catch (error: any) {
      runInAction(() => {
        this.error = error.message || 'Failed to fetch models';
        this.isLoading = false;
      });
    }
  }

  async fetchAllRemoteModels(): Promise<void> {
    if (this.servers.length === 0) {
      return;
    }

    this.lastFetchTime = Date.now();

    await Promise.all(
      this.servers.map(server => this.fetchModelsForServer(server.id)),
    );
  }

  async testServerConnection(
    serverId: string,
  ): Promise<{ok: boolean; modelCount: number; error?: string}> {
    const server = this.servers.find(s => s.id === serverId);
    if (!server) {
      return {ok: false, modelCount: 0, error: 'Server not found'};
    }

    const apiKey = await this.getApiKey(serverId);
    return testConnection(server.url, apiKey, server.requestTimeoutMs);
  }

  acknowledgePrivacyNotice(): void {
    this.privacyNoticeAcknowledged = true;
  }

  // Auto-fetch on foreground
  private setupAppStateListener(): void {
    this.appStateSubscription = AppState.addEventListener(
      'change',
      (nextAppState: AppStateStatus) => {
        if (nextAppState === 'active') {
          const now = Date.now();
          if (now - this.lastFetchTime > FETCH_THROTTLE_MS) {
            this.fetchAllRemoteModels();
          }
        }
      },
    );
  }
}

export const serverStore = new ServerStore();
