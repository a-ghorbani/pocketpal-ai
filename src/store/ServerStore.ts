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
import {deriveListCapsMap} from '../utils/listCaps';
import type {ListDerivedCaps} from '../utils/listCaps';
import type {
  GenerationParameterMode,
  OptionalGenerationParameter,
  RemoteGenerationSettings,
} from '../utils/completionTypes';
import {CURRENT_COMPLETION_SETTINGS_VERSION} from '../utils/completionSettingsVersions';
import {normalizeRemoteCatalogModel} from '../utils/remoteCatalog';
import {
  resolveRemoteProtocol as resolveProtocol,
  type NormalizedRemoteCatalogModel,
  type RemoteModelPreference,
  type RemoteProtocolResolution,
} from '../utils/remoteProtocol';
import {
  cloneRemoteGenerationSettings,
  credentialRevisionOf,
  dropEntry,
  dropServerEntries,
  normalizeServerUrl,
  type CachedRemoteCatalogModel,
  withoutGenerationSettings,
} from '../services/remote/remoteModelState';

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
 * Shared by every path that invalidates per-model state, so a new map cannot
 * be added to one and forgotten in the other.
 */
class ServerStore {
  servers: ServerConfig[] = [];
  // Remote reasoning capability keyed by full model id (`${serverId}/${remoteModelId}`).
  // Remote Models are rebuilt each launch and not persisted, so their capability
  // lives here and persists with the store.
  remoteReasoning: Record<string, ReasoningCapability> = {};
  // Server-reported capabilities keyed by the same full model id. /props
  // answers per model on a multi-model server, so caps cannot live per server.
  remoteCaps: Record<string, RemoteModelCaps> = {};
  remoteModelPreferences: Record<string, RemoteModelPreference> = {};
  remoteCatalogMetadata: Record<string, CachedRemoteCatalogModel> = {};
  serverModels: Map<string, RemoteModelInfo[]> = observable.map();
  userSelectedModels: Array<{serverId: string; remoteModelId: string}> = [];
  isLoading = false;
  error: string | null = null;
  privacyNoticeAcknowledged = false;
  initializationComplete = false;

  private lastFetchTime = 0;
  private appStateSubscription: any = null;
  private fetchGenerations: Record<string, number> = {};

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
        'remoteModelPreferences',
        'remoteCatalogMetadata',
      ],
      storage: AsyncStorage,
    })
      .then(async () => {
        // After hydration, fetch models for all servers
        await this.fetchAllRemoteModels();
      })
      .catch(error => {
        console.error('Failed to initialize ServerStore:', error);
      })
      .finally(() => {
        runInAction(() => {
          this.initializationComplete = true;
        });
      });

    this.setupAppStateListener();
  }

  // Actions
  addServer(config: Omit<ServerConfig, 'id'>): string {
    const id = `server-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newServer: ServerConfig = {
      ...config,
      id,
      credentialRevision: credentialRevisionOf(config as ServerConfig),
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
      (updates.url !== undefined &&
        normalizeServerUrl(updates.url) !== normalizeServerUrl(server.url)) ||
      (updates.serverType !== undefined &&
        updates.serverType !== server.serverType) ||
      (updates.credentialRevision !== undefined &&
        updates.credentialRevision !== server.credentialRevision);

    Object.assign(server, updates);

    if (invalidatesDiscovery) {
      this.invalidateServerDiscovery(id);
    }
  }

  removeServer(id: string): void {
    this.servers = this.servers.filter(s => s.id !== id);
    this.serverModels.delete(id);
    // Remove all user-selected models for this server
    this.userSelectedModels = this.userSelectedModels.filter(
      m => m.serverId !== id,
    );
    this.remoteReasoning = dropServerEntries(this.remoteReasoning, id);
    this.remoteCaps = dropServerEntries(this.remoteCaps, id);
    this.remoteModelPreferences = dropServerEntries(
      this.remoteModelPreferences,
      id,
    );
    this.remoteCatalogMetadata = dropServerEntries(
      this.remoteCatalogMetadata,
      id,
    );
    this.bumpFetchGeneration(id);
    this.isLoading = false;
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
    const modelId = `${serverId}/${remoteModelId}`;
    this.remoteModelPreferences = dropEntry(
      this.remoteModelPreferences,
      modelId,
    );
    this.remoteCatalogMetadata = dropEntry(this.remoteCatalogMetadata, modelId);
  }

  getRemoteModelPreference(modelId: string): RemoteModelPreference | undefined {
    return this.remoteModelPreferences[modelId];
  }

  setRemoteModelPreference(
    modelId: string,
    preference: RemoteModelPreference,
  ): void {
    const existing = this.remoteModelPreferences[modelId];
    this.remoteModelPreferences = {
      ...this.remoteModelPreferences,
      [modelId]: {
        ...existing,
        ...preference,
        generationSettings: preference.generationSettings
          ? cloneRemoteGenerationSettings({
              ...preference.generationSettings,
              version: CURRENT_COMPLETION_SETTINGS_VERSION,
            })
          : existing?.generationSettings,
      },
    };
  }

  clearRemoteModelPreference(modelId: string): void {
    this.remoteModelPreferences = dropEntry(
      this.remoteModelPreferences,
      modelId,
    );
  }

  getRemoteModelGenerationSettings(
    modelId: string,
  ): RemoteGenerationSettings | undefined {
    const settings = this.remoteModelPreferences[modelId]?.generationSettings;
    return settings ? cloneRemoteGenerationSettings(settings) : undefined;
  }

  setRemoteModelGenerationSettings(
    modelId: string,
    settings: RemoteGenerationSettings,
  ): void {
    const existing = this.remoteModelPreferences[modelId];
    this.remoteModelPreferences = {
      ...this.remoteModelPreferences,
      [modelId]: {
        ...existing,
        generationSettings: cloneRemoteGenerationSettings({
          ...settings,
          version: CURRENT_COMPLETION_SETTINGS_VERSION,
        }),
      },
    };
  }

  setRemoteModelGenerationMode(
    modelId: string,
    parameter: OptionalGenerationParameter,
    mode: GenerationParameterMode,
  ): void {
    const settings = this.getRemoteModelGenerationSettings(modelId) ?? {};
    this.setRemoteModelGenerationSettings(modelId, {
      ...settings,
      generationParameterModes: {
        ...settings.generationParameterModes,
        [parameter]: mode,
      },
    });
  }

  clearRemoteModelGenerationSettings(modelId: string): void {
    const existing = this.remoteModelPreferences[modelId];
    if (!existing?.generationSettings) {
      return;
    }
    const remaining = withoutGenerationSettings(existing);
    if (!remaining) {
      this.remoteModelPreferences = dropEntry(
        this.remoteModelPreferences,
        modelId,
      );
      return;
    }
    this.remoteModelPreferences = {
      ...this.remoteModelPreferences,
      [modelId]: remaining,
    };
  }

  getRemoteCatalogModel(
    modelId: string,
  ): NormalizedRemoteCatalogModel | undefined {
    const slash = modelId.indexOf('/');
    if (slash <= 0) {
      return undefined;
    }
    const serverId = modelId.slice(0, slash);
    const remoteModelId = modelId.slice(slash + 1);
    const server = this.servers.find(candidate => candidate.id === serverId);
    if (!server) {
      return undefined;
    }

    const liveRow = this.serverModels
      .get(serverId)
      ?.find(row => row.id === remoteModelId);
    if (liveRow) {
      return normalizeRemoteCatalogModel(liveRow, 'live');
    }

    const cached = this.remoteCatalogMetadata[modelId];
    if (
      !cached ||
      cached.serverId !== serverId ||
      cached.normalizedUrl !== normalizeServerUrl(server.url) ||
      cached.serverType !== server.serverType ||
      cached.credentialRevision !== credentialRevisionOf(server)
    ) {
      return undefined;
    }
    return {
      capabilities: cached.capabilities,
      endpointSupport: cached.endpointSupport,
      provenance: 'cached',
    };
  }

  resolveRemoteModelProtocol(modelId: string): RemoteProtocolResolution {
    const serverId = modelId.slice(0, modelId.indexOf('/'));
    const server = this.servers.find(candidate => candidate.id === serverId);
    return resolveProtocol({
      modelPreference: this.getRemoteModelPreference(modelId),
      apiMode: server?.apiMode,
      catalog: this.getRemoteCatalogModel(modelId),
    });
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

  /**
   * What the fetched model lists say about each model, keyed by full model id.
   * A computed with no writer and no persistence: `serverModels` is already
   * replaced by every fetch, dropped when a server url or type changes and
   * dropped with the server, so these cannot outlive the url they came from.
   */
  get listCaps(): Record<string, ListDerivedCaps> {
    return deriveListCapsMap(this.servers, this.serverModels);
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
      runInAction(() => {
        this.advanceCredentialRevision(serverId);
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
      runInAction(() => {
        this.advanceCredentialRevision(serverId);
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

    const generation = this.bumpFetchGeneration(serverId);
    const requestUrl = server.url;
    const requestTimeoutMs = server.requestTimeoutMs;
    const snapshot = {
      normalizedUrl: normalizeServerUrl(requestUrl),
      serverType: server.serverType,
      credentialRevision: credentialRevisionOf(server),
    };

    runInAction(() => {
      this.isLoading = true;
      this.error = null;
    });

    try {
      const apiKey = await this.getApiKey(serverId);
      if (!this.isCurrentFetch(serverId, generation, snapshot)) {
        return;
      }
      const models = await fetchModels(
        requestUrl,
        apiKey,
        requestTimeoutMs,
        snapshot.serverType,
      );

      runInAction(() => {
        if (!this.isCurrentFetch(serverId, generation, snapshot)) {
          return;
        }
        this.serverModels.set(serverId, models);
        this.remoteCatalogMetadata = {
          ...dropServerEntries(this.remoteCatalogMetadata, serverId),
          ...Object.fromEntries(
            models.map(row => {
              const modelId = `${serverId}/${row.id}`;
              return [
                modelId,
                {
                  ...normalizeRemoteCatalogModel(row, 'cached'),
                  serverId,
                  ...snapshot,
                },
              ];
            }),
          ),
        };
        this.isLoading = false;

        // Update lastConnected timestamp
        const s = this.servers.find(sv => sv.id === serverId);
        if (s) {
          s.lastConnected = Date.now();
        }
      });
    } catch (error: any) {
      runInAction(() => {
        if (!this.isCurrentFetch(serverId, generation, snapshot)) {
          return;
        }
        this.error = error.message || 'Failed to fetch models';
        this.isLoading = false;
      });
    }
  }

  private bumpFetchGeneration(serverId: string): number {
    const next = (this.fetchGenerations[serverId] ?? 0) + 1;
    this.fetchGenerations[serverId] = next;
    return next;
  }

  private invalidateServerDiscovery(serverId: string): void {
    this.remoteCaps = dropServerEntries(this.remoteCaps, serverId);
    this.remoteCatalogMetadata = dropServerEntries(
      this.remoteCatalogMetadata,
      serverId,
    );
    this.serverModels.delete(serverId);
    this.bumpFetchGeneration(serverId);
    this.isLoading = false;
  }

  private advanceCredentialRevision(serverId: string): void {
    const server = this.servers.find(candidate => candidate.id === serverId);
    if (!server) {
      return;
    }
    server.credentialRevision = credentialRevisionOf(server) + 1;
    this.invalidateServerDiscovery(serverId);
  }

  private isCurrentFetch(
    serverId: string,
    generation: number,
    snapshot: {
      normalizedUrl: string;
      serverType?: string;
      credentialRevision: number;
    },
  ): boolean {
    const current = this.servers.find(server => server.id === serverId);
    return (
      this.fetchGenerations[serverId] === generation &&
      !!current &&
      normalizeServerUrl(current.url) === snapshot.normalizedUrl &&
      current.serverType === snapshot.serverType &&
      credentialRevisionOf(current) === snapshot.credentialRevision
    );
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
   *
   * `resolvedApiKey` undefined is indistinguishable from a keyless server, so
   * the probe re-reads the Keychain in that case.
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
    const probedCredentialRevision = credentialRevisionOf(server);

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
        current.serverType !== probedType ||
        credentialRevisionOf(current) !== probedCredentialRevision
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

    const requestUrl = server.url;
    const requestTimeoutMs = server.requestTimeoutMs;
    const requestServerType = server.serverType;
    const requestCredentialRevision = credentialRevisionOf(server);
    const apiKey = await this.getApiKey(serverId);
    const current = this.servers.find(candidate => candidate.id === serverId);
    if (
      !current ||
      current.url !== requestUrl ||
      current.serverType !== requestServerType ||
      credentialRevisionOf(current) !== requestCredentialRevision
    ) {
      return {
        ok: false,
        modelCount: 0,
        error: 'Server configuration changed',
      };
    }
    return testConnection(
      requestUrl,
      apiKey,
      requestTimeoutMs,
      requestServerType,
    );
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
