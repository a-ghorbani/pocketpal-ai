import {AppState, AppStateStatus} from 'react-native';
import {
  makeAutoObservable,
  observable,
  runInAction,
  AnnotationsMap,
} from 'mobx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {makePersistable} from 'mobx-persist-store';
import * as Keychain from 'react-native-keychain';

import {
  fetchModelsWithHeaders,
  fetchServerProps,
  testConnection,
  PROPS_TIMEOUT_MS,
  RemoteModelInfo,
} from '../api/openai';
import {RemoteModelCaps, ServerConfig} from '../utils/types';
import {ReasoningCapability} from '../utils/reasoningCapability';
import {deriveListCapsMap} from '../utils/listCaps';
import type {ListDerivedCaps} from '../utils/listCaps';
import {
  applyLivePatch,
  mapRowStatus,
  reduceRouterEvent,
  rowMatchesKey,
  RouterLive,
  RouterOp,
  RouterRowState,
  RouterStreamCap,
} from '../utils/routerState';
import {
  openRouterEventStream,
  RouterStreamError,
  RouterStreamHandle,
} from '../api/router';

const KEYCHAIN_SERVICE_PREFIX = 'pocketpal-server-';

/** Minimum interval between auto-fetch cycles (ms) */
const FETCH_THROTTLE_MS = 60000;

/**
 * A long-lived XHR keeps the whole response in `responseText`, and a download
 * stream can run for an hour. Reopening is free: nothing depends on the stream
 * for an outcome.
 */
const ROUTER_STREAM_MAX_BYTES = 2 * 1024 * 1024;
const ROUTER_STREAM_MAX_MS = 10 * 60 * 1000;

/**
 * How often a server with work in flight and no stream is re-read. The only
 * other reconcile fires on a background-to-foreground transition and is
 * throttled to a minute, so a foregrounded app would otherwise never re-read
 * at all.
 */
const ROUTER_POLL_MS = 4000;
const ROUTER_TICK_MS = 1000;

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
function dropServerEntries<T>(
  map: Record<string, T>,
  serverId: string,
): Record<string, T> {
  const prefix = `${serverId}/`;
  return Object.fromEntries(
    Object.entries(map).filter(([k]) => !k.startsWith(prefix)),
  );
}

/**
 * What a `GET /v1/models` fetch found about the whole response rather than
 * about any row, plus when it ran. Live-only, like everything router-shaped:
 * a desktop's state belongs to that desktop, and a persisted copy of it is
 * only a stale claim.
 */
interface RouterListShape {
  hasModelsKey: boolean;
  startedAt: number;
  completedAt: number;
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

  // Router mode. None of the state below is persisted: it describes a desktop
  // this app may not reach next launch.
  routerEvents: Record<string, RouterLive> = {};
  routerOps: Record<string, RouterOp> = {};
  routerStream: {serverId: string; state: 'connecting' | 'open'} | null = null;
  routerPolls: Set<string> = new Set();
  routerStreamCap: Record<string, RouterStreamCap> = {};
  routerObservedEviction: Set<string> = new Set();
  routerListShape: Record<string, RouterListShape> = {};

  private lastFetchTime = 0;
  private appStateSubscription: any = null;
  private routerStreamHandle: RouterStreamHandle | null = null;
  private routerFocusedServerId: string | null = null;
  private routerForegrounded = true;
  private routerTicker: ReturnType<typeof setInterval> | null = null;
  private routerPollInFlight = new Set<string>();
  private routerLastPollAt: Record<string, number> = {};

  constructor() {
    makeAutoObservable(this, {
      serverModels: observable,
      // Connection plumbing: nothing renders from it.
      routerStreamHandle: false,
      routerFocusedServerId: false,
      routerForegrounded: false,
      routerTicker: false,
      routerPollInFlight: false,
      routerLastPollAt: false,
    } as AnnotationsMap<ServerStore, string>);

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

  /**
   * What the fetched model lists say about each model, keyed by full model id.
   * A computed with no writer and no persistence: `serverModels` is already
   * replaced by every fetch, dropped when a server url or type changes and
   * dropped with the server, so these cannot outlive the url they came from.
   */
  get listCaps(): Record<string, ListDerivedCaps> {
    return deriveListCapsMap(this.servers, this.serverModels);
  }

  /**
   * The servers running in router mode. A computed with no writer: it refreshes
   * with the list it reads and costs no request, the evidence being in a body
   * already fetched.
   *
   * Two disjuncts, because they answer in different situations. A `status`
   * object on a row is direct evidence but can only classify a body that has
   * rows. The absent top-level `models` key is a property of the response, so
   * it still answers when the list is empty, filtered or truncated.
   */
  get routerServers(): Set<string> {
    const ids = new Set<string>();
    for (const server of this.servers) {
      if (server.serverType !== 'llama.cpp') {
        continue;
      }
      const rows = this.serverModels.get(server.id) ?? [];
      const shape = this.routerListShape[server.id];
      const carriesStatus = rows.some(
        row => row.status !== null && typeof row.status === 'object',
      );
      if (carriesStatus || shape?.hasModelsKey === false) {
        ids.add(server.id);
      }
    }
    return ids;
  }

  isRouterServer(serverId: string): boolean {
    return this.routerServers.has(serverId);
  }

  /**
   * What every consumer branches on, per model key. The live overlay wins while
   * it is newer than the start of the fetch that produced the row; otherwise
   * the row does, so a slow fetch cannot strand a finished load in `loading`.
   */
  get routerRowStates(): Record<string, RouterRowState> {
    const states: Record<string, RouterRowState> = {};
    for (const serverId of this.routerServers) {
      for (const key of this.routerKeysForServer(serverId)) {
        states[key] = this.resolveRouterRowState(serverId, key);
      }
    }
    return states;
  }

  routerRowState(serverId: string, remoteModelId: string): RouterRowState {
    return (
      this.routerRowStates[`${serverId}/${remoteModelId}`] ??
      this.resolveRouterRowState(serverId, `${serverId}/${remoteModelId}`)
    );
  }

  private routerKeysForServer(serverId: string): string[] {
    const prefix = `${serverId}/`;
    const keys = new Set<string>();
    for (const row of this.serverModels.get(serverId) ?? []) {
      keys.add(`${serverId}/${row.id}`);
    }
    for (const map of [this.routerEvents, this.routerOps]) {
      for (const key of Object.keys(map)) {
        if (key.startsWith(prefix)) {
          keys.add(key);
        }
      }
    }
    return [...keys];
  }

  private resolveRouterRowState(serverId: string, key: string): RouterRowState {
    const remoteModelId = key.slice(serverId.length + 1);
    const row = (this.serverModels.get(serverId) ?? []).find(candidate =>
      rowMatchesKey(candidate, remoteModelId),
    );
    const live = this.routerEvents[key];
    const fetchStartedAt = this.routerListShape[serverId]?.startedAt ?? 0;
    if (live?.status && live.at > fetchStartedAt) {
      return live.status;
    }
    const rowState = mapRowStatus(row);
    // A download has no row until it lands, so its own operation is what says
    // the model is on its way.
    if (rowState === 'absent' && this.routerOps[key]?.kind === 'download') {
      return 'downloading';
    }
    return rowState;
  }

  routerLive(serverId: string, remoteModelId: string): RouterLive | undefined {
    return this.routerEvents[`${serverId}/${remoteModelId}`];
  }

  routerOp(serverId: string, remoteModelId: string): RouterOp | undefined {
    return this.routerOps[`${serverId}/${remoteModelId}`];
  }

  /** Resident models on a server: a fact, shown without predicting anything. */
  routerResidentCount(serverId: string): number {
    return this.routerKeysForServer(serverId).filter(key => {
      const state = this.resolveRouterRowState(serverId, key);
      return state === 'loaded' || state === 'loading' || state === 'sleeping';
    }).length;
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

    const startedAt = Date.now();

    try {
      const apiKey = await this.getApiKey(serverId);
      const {models, hasModelsKey} = await fetchModelsWithHeaders(
        server.url,
        apiKey,
        server.requestTimeoutMs,
      );

      runInAction(() => {
        this.serverModels.set(serverId, models);
        this.isLoading = false;
        // Only the success branch, because this fetch leaves the previous rows
        // in place on a failure: without a stamp, a reconcile that never
        // happened is indistinguishable from one that found the old row, and
        // every bound below turns on that difference.
        this.routerListShape[serverId] = {
          hasModelsKey,
          startedAt,
          completedAt: Date.now(),
        };

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

  // Router event stream

  setRouterStream(stream: ServerStore['routerStream']): void {
    this.routerStream = stream;
  }

  /**
   * Only this request's own status may write the cap, and only a 404 may say
   * `absent`: an unregistered route is a fact about the build, whereas a 401 is
   * about credentials, a 400 about that one request and a 500 about that
   * moment. None of those is worth remembering.
   */
  setRouterStreamCap(serverId: string, cap: RouterStreamCap): void {
    this.routerStreamCap[serverId] = cap;
  }

  routerStreamCapFor(serverId: string): RouterStreamCap {
    return this.routerStreamCap[serverId] ?? 'unknown';
  }

  /**
   * At most one stream app-wide, against the server the user is looking at or
   * the one with the most recent operation. N sockets to N desktops is not a
   * thing to do on a phone.
   */
  async openRouterStream(serverId: string): Promise<void> {
    this.routerFocusedServerId = serverId;
    if (!this.isRouterServer(serverId) || !this.routerForegrounded) {
      return;
    }
    if (this.routerStreamCapFor(serverId) === 'absent') {
      return;
    }
    if (this.routerStream?.serverId === serverId) {
      return;
    }
    this.closeRouterStream();

    const server = this.servers.find(s => s.id === serverId);
    if (!server) {
      return;
    }
    const apiKey = await this.getApiKey(serverId);
    if (this.routerFocusedServerId !== serverId || !this.routerForegrounded) {
      return;
    }

    runInAction(() => this.setRouterStream({serverId, state: 'connecting'}));

    this.routerStreamHandle = openRouterEventStream(
      server.url,
      apiKey,
      {
        onOpen: () =>
          runInAction(() => {
            this.setRouterStreamCap(serverId, 'present');
            this.setRouterStream({serverId, state: 'open'});
            this.syncRouterTiers();
          }),
        onEvent: payload => this.applyRouterEvent(serverId, payload),
        onClose: error => this.handleRouterStreamClosed(serverId, error),
      },
      {
        connectTimeoutMs: server.requestTimeoutMs,
        maxBytes: ROUTER_STREAM_MAX_BYTES,
        maxDurationMs: ROUTER_STREAM_MAX_MS,
      },
    );
  }

  closeRouterStream(): void {
    this.routerStreamHandle?.close();
    this.routerStreamHandle = null;
    runInAction(() => this.setRouterStream(null));
    this.syncRouterTiers();
  }

  private handleRouterStreamClosed(
    serverId: string,
    error?: RouterStreamError,
  ): void {
    this.routerStreamHandle = null;
    runInAction(() => {
      this.setRouterStream(null);
      if (error?.status === 404) {
        this.setRouterStreamCap(serverId, 'absent');
      }
    });
    this.syncRouterTiers();
    // A stream that drops never settles anything: the model goes on loading on
    // the desktop, and only a reconciled row may say otherwise.
    if (
      !error &&
      this.routerForegrounded &&
      this.routerFocusedServerId === serverId
    ) {
      this.openRouterStream(serverId);
    }
  }

  /**
   * The only writer of `routerEvents`. An event says a model's situation may
   * have changed; what it is comes from the list.
   */
  applyRouterEvent(serverId: string, payload: unknown): void {
    const effect = reduceRouterEvent(payload);
    if (effect.kind === 'ignore') {
      return;
    }
    if (effect.kind === 'drop-server') {
      runInAction(() => {
        this.routerEvents = dropServerEntries(this.routerEvents, serverId);
      });
      this.requestRouterReconcile(serverId);
      return;
    }
    if (effect.kind === 'drop-model') {
      runInAction(() => {
        delete this.routerEvents[`${serverId}/${effect.model}`];
      });
      this.requestRouterReconcile(serverId);
      return;
    }

    const key = `${serverId}/${effect.model}`;
    runInAction(() => {
      this.routerEvents[key] = applyLivePatch(
        this.routerEvents[key],
        effect.patch,
        Date.now(),
      );
      if (
        effect.patch.status === 'unloaded' &&
        this.routerOps[key]?.kind !== 'unload'
      ) {
        this.routerObservedEviction.add(serverId);
      }
      const op = this.routerOps[key];
      if (op) {
        if (effect.attemptEnded) {
          op.attemptEnded = true;
        }
        op.phase = 'active';
        op.lastEvidenceAt = Date.now();
      }
    });

    if (effect.reconcile) {
      this.requestRouterReconcile(serverId);
    }
  }

  private requestRouterReconcile(serverId: string): void {
    this.fetchModelsForServer(serverId).catch(() => {});
  }

  // Poll tier

  setRouterPoll(serverId: string, active: boolean): void {
    if (active) {
      this.routerPolls.add(serverId);
    } else {
      this.routerPolls.delete(serverId);
      delete this.routerLastPollAt[serverId];
    }
  }

  /**
   * A server with work in flight and no stream is re-read on a timer. It reuses
   * the existing models fetch, so the model list keeps its two writers and the
   * poll can never disagree with the list the capabilities are derived from.
   */
  syncRouterTiers(): void {
    const busy = new Set(Object.values(this.routerOps).map(op => op.serverId));
    runInAction(() => {
      for (const serverId of [...this.routerPolls]) {
        if (!busy.has(serverId) || this.routerStream?.serverId === serverId) {
          this.setRouterPoll(serverId, false);
        }
      }
      for (const serverId of busy) {
        if (this.routerStream?.serverId !== serverId) {
          this.setRouterPoll(serverId, true);
        }
      }
    });
    this.syncRouterTicker();
  }

  private syncRouterTicker(): void {
    const wanted =
      this.routerForegrounded && Object.keys(this.routerOps).length > 0;
    if (wanted && !this.routerTicker) {
      this.routerTicker = setInterval(
        () => this.routerTick(),
        ROUTER_TICK_MS,
      ) as any;
    } else if (!wanted && this.routerTicker) {
      clearInterval(this.routerTicker);
      this.routerTicker = null;
    }
  }

  private routerTick(): void {
    if (!this.routerForegrounded) {
      return;
    }
    const now = Date.now();
    for (const serverId of this.routerPolls) {
      if (this.routerPollInFlight.has(serverId)) {
        continue;
      }
      if (now - (this.routerLastPollAt[serverId] ?? 0) < ROUTER_POLL_MS) {
        continue;
      }
      this.routerLastPollAt[serverId] = now;
      this.routerPollInFlight.add(serverId);
      this.fetchModelsForServer(serverId)
        .catch(() => {})
        .then(() => this.routerPollInFlight.delete(serverId));
    }
  }

  // Auto-fetch on foreground
  private setupAppStateListener(): void {
    this.appStateSubscription = AppState.addEventListener(
      'change',
      (nextAppState: AppStateStatus) => {
        if (nextAppState === 'active') {
          this.routerForegrounded = true;
          const now = Date.now();
          if (now - this.lastFetchTime > FETCH_THROTTLE_MS) {
            this.fetchAllRemoteModels();
          }
          this.handleRouterForeground();
        } else {
          this.routerForegrounded = false;
          this.closeRouterStream();
          this.syncRouterTicker();
        }
      },
    );
  }

  /**
   * The list is reconciled before anything reopens, because the event that
   * would have said a load finished may already have happened while the stream
   * was closed. Asking answers; waiting for a past event does not.
   */
  private async handleRouterForeground(): Promise<void> {
    const servers = new Set(
      Object.values(this.routerOps).map(op => op.serverId),
    );
    await Promise.all(
      [...servers].map(serverId =>
        this.fetchModelsForServer(serverId).catch(() => {}),
      ),
    );
    if (this.routerFocusedServerId) {
      await this.openRouterStream(this.routerFocusedServerId);
    }
    this.syncRouterTiers();
  }
}

export const serverStore = new ServerStore();
