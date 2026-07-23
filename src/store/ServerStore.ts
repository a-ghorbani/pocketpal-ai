import {AppState, AppStateStatus} from 'react-native';
import {makeAutoObservable, observable, runInAction} from 'mobx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {makePersistable} from 'mobx-persist-store';
import * as Keychain from 'react-native-keychain';

import {
  fetchModels,
  fetchServerProps,
  testConnection,
  PROPS_TIMEOUT_MS,
  RemoteModelInfo,
} from '../api/openai';
import {RemoteModelCaps, ServerConfig} from '../utils/types';
import {ReasoningCapability} from '../utils/reasoningCapability';

const KEYCHAIN_SERVICE_PREFIX = 'pocketpal-server-';

/** Minimum interval between auto-fetch cycles (ms) */
const FETCH_THROTTLE_MS = 60000;

/**
 * The capability fields of a `RemoteModelCaps` entry — everything except the
 * provenance the entry carries. Enumerated once so the usability check and the
 * no-op write check cannot drift apart when a field is added.
 */
const CAPS_FIELDS = ['contextLength', 'supportsVision'] as const;

/**
 * Drop every entry of a per-model map (keyed `${serverId}/${remoteModelId}`)
 * that belongs to one server. Shared by every path that invalidates per-model
 * state, so a new map cannot be added to one and forgotten in the other.
 */
function dropServerEntries<T>(
  map: Record<string, T>,
  serverId: string,
): Record<string, T> {
  const prefix = `${serverId}/`;
  return Object.fromEntries(
    Object.entries(map).filter(([k]) => !k.startsWith(prefix)),
  );
}

class ServerStore {
  servers: ServerConfig[] = [];
  // Remote reasoning capability keyed by full model id (`${serverId}/${remoteModelId}`).
  // Remote Models are rebuilt each launch and not persisted, so their capability
  // lives here and persists with the store.
  remoteReasoning: Record<string, ReasoningCapability> = {};
  // Server-reported capabilities keyed by the same full model id. /props
  // answers per model on a multi-model server, so caps cannot live per server.
  remoteCaps: Record<string, RemoteModelCaps> = {};
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
        'remoteCaps',
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
    if (!server) {
      return;
    }
    // Caps and the model list are both what the configured backend reported.
    // Repointing the url or switching the server type makes them describe
    // something else: resolveRemoteCaps has no way to tell, and a stale
    // single-entry list would let servesOnlyModel clear the bare-retry gate
    // against a router. Drop both and let the next probe / fetch repopulate.
    // Reasoning state survives: it carries user declarations, and it is not
    // server-reported.
    const invalidatesDiscovery =
      (updates.url !== undefined && updates.url !== server.url) ||
      (updates.serverType !== undefined &&
        updates.serverType !== server.serverType);

    Object.assign(server, updates);

    if (invalidatesDiscovery) {
      this.remoteCaps = dropServerEntries(this.remoteCaps, id);
      this.serverModels.delete(id);
    }
  }

  removeServer(id: string): void {
    this.servers = this.servers.filter(s => s.id !== id);
    this.serverModels.delete(id);
    // Remove all user-selected models for this server
    this.userSelectedModels = this.userSelectedModels.filter(
      m => m.serverId !== id,
    );
    // Drop per-model state keyed by this server's model ids.
    this.remoteReasoning = dropServerEntries(this.remoteReasoning, id);
    this.remoteCaps = dropServerEntries(this.remoteCaps, id);
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

  /**
   * Probe GET /props for one remote model and merge what it reports into
   * remoteCaps. llama.cpp only; callers invoke it detached, and it never
   * throws or rejects.
   *
   * At most two requests: the scoped one, and — only when the server is
   * provably serving this one model — a bare retry, which is what a
   * single-model llama-server has always answered correctly. On a multi-model
   * server the bare form describes whichever model happens to be resident, so
   * it is never issued there and the caps simply stay unknown.
   *
   * Merges field-wise within one backend: a response that resolves only one
   * field must not blank a known other, and a probe that resolves nothing
   * writes nothing. Across backends there is nothing to merge — an entry
   * probed against another url is replaced, not blended.
   *
   * The written entry carries the url it was probed against, so a reader can
   * tell whether it describes the backend a live session is bound to.
   *
   * A shorter server timeout is honoured, a longer one is not:
   * `requestTimeoutMs` is a free numeric input, and detached work must stay
   * bounded by `PROPS_TIMEOUT_MS` per request.
   */
  async fetchRemoteModelCaps(
    serverId: string,
    remoteModelId: string,
    resolvedApiKey?: string,
  ): Promise<void> {
    const server = this.servers.find(s => s.id === serverId);
    if (!server || server.serverType !== 'llama.cpp') {
      return;
    }

    const isUnusable = (caps: RemoteModelCaps) =>
      CAPS_FIELDS.every(f => caps[f] === undefined);

    // Snapshot: `server` is the live observable, so updateServer mutates it
    // in place while the probe is in flight.
    const probedUrl = server.url;
    const probedType = server.serverType;

    const timeoutMs = Math.min(
      server.requestTimeoutMs ?? PROPS_TIMEOUT_MS,
      PROPS_TIMEOUT_MS,
    );

    const apiKey = resolvedApiKey ?? (await this.getApiKey(serverId));
    let caps = await fetchServerProps(
      probedUrl,
      apiKey,
      timeoutMs,
      remoteModelId,
    );

    if (isUnusable(caps) && this.servesOnlyModel(serverId, remoteModelId)) {
      caps = await fetchServerProps(probedUrl, apiKey, timeoutMs);
    }

    if (isUnusable(caps)) {
      return;
    }

    runInAction(() => {
      // The probe is detached, so the server may have been removed or
      // repointed while it was in flight. Both prune this key, and both make
      // the answer describe a backend that is no longer configured — writing
      // now would resurrect it.
      const current = this.servers.find(s => s.id === serverId);
      if (
        !current ||
        current.url !== probedUrl ||
        current.serverType !== probedType
      ) {
        return;
      }
      const key = `${serverId}/${remoteModelId}`;
      const prior = this.remoteCaps[key];
      const sameBackend = prior?.probedUrl === probedUrl;
      const merged: RemoteModelCaps = {
        ...(sameBackend ? prior : undefined),
        ...caps,
        probedUrl,
      };
      if (
        prior &&
        prior.probedUrl === merged.probedUrl &&
        CAPS_FIELDS.every(f => prior[f] === merged[f])
      ) {
        return;
      }
      this.remoteCaps[key] = merged;
    });
  }

  /**
   * True only when the server's model list is known and holds exactly this one
   * model. The list is not persisted, so an absent one means unknown, and
   * unknown does not pass: a genuine single-model server that was offline
   * during the post-hydration fetch is skipped here too. Losing a bare retry
   * costs nothing but an unknown capability; taking one on a multi-model
   * server would attribute the resident model's props to this one.
   */
  private servesOnlyModel(serverId: string, remoteModelId: string): boolean {
    const models = this.serverModels.get(serverId);
    return models?.length === 1 && models[0].id === remoteModelId;
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
