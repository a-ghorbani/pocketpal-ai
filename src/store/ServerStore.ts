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
  loadFailureFrom,
  pickerRowsFromList,
  rowStateFromList,
  unloadFailureFrom,
  unreachableFailureFrom,
  waitStoppedFailureFrom,
  downloadVerdict,
  loadVerdict,
  unloadVerdict,
  reduceRouterEvent,
  RouterFailure,
  RouterListState,
  RouterLive,
  RouterOp,
  RouterRowState,
  RouterStreamCap,
} from '../utils/routerState';
import {
  openRouterEventStream,
  capServerText,
  routerErrorMessage,
  routerDownload,
  routerLoad,
  routerUnload,
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
 * A peer that answers 200 and ends the stream immediately would otherwise be
 * reconnected to as fast as the round trip allows, each attempt costing a
 * Keychain read and a token-bearing request. Reopening after a healthy stream
 * ends is still wanted promptly, so the bound is on the rate rather than on
 * the total, and it lifts by itself once the window has passed.
 */
const ROUTER_RECONNECT_WINDOW_MS = 60 * 1000;
const ROUTER_RECONNECT_MAX = 6;
const ROUTER_RECONNECT_BACKOFF_MS = 1000;

/**
 * How often a server with work in flight and no stream is re-read. The only
 * other reconcile fires on a background-to-foreground transition and is
 * throttled to a minute, so a foregrounded app would otherwise never re-read
 * at all.
 */
const ROUTER_POLL_MS = 4000;
const ROUTER_TICK_MS = 1000;

/**
 * Both watchdogs bound the app's ignorance, never the server's work: expiry
 * asks the list and nothing else, so neither interval can change an outcome.
 * Too short costs a request; too long delays an answer.
 */
const ROUTER_ACK_MS = 20000;
const ROUTER_EVIDENCE_MS = 45000;

/**
 * How long an operation may go without the app managing to re-read the list
 * at all. Reaching it means the server could not be asked, which is a request
 * failure and not a claim about the model.
 */
const ROUTER_UNREACHABLE_MS = 90000;

/**
 * How long a load may stay in flight while the row goes on reading `loading`.
 * Nothing else bounds it: the reach bound needs the list to have stopped
 * answering, and a healthy list read that still says `loading` re-arms the
 * watchdog instead. The send path is waiting on the operation, so an
 * unbounded one is a chat that hangs with no error and no spinner — worse
 * than reporting that the load did not finish, which the user can retry.
 */
const ROUTER_LOAD_MAX_MS = 10 * 60 * 1000;

/**
 * How long an unload may take to converge. It must clear the wire's ten-second
 * stop timeout, or a child that is slow to stop reads as a server that refused
 * to release it.
 */
const ROUTER_UNLOAD_SETTLE_MS = 30000;

/**
 * A terminal download event can arrive fractionally before the list settles,
 * so the row is looked for again across a short window before the attempt is
 * called a failure. The ceiling is what bounds a download nothing corroborates
 * — generous, because too short false-fails a running download while too long
 * only delays an honest failure, and the row shows Downloading with a cancel
 * throughout either way.
 */
const ROUTER_DOWNLOAD_SETTLE_MS = 8000;
const ROUTER_DOWNLOAD_MAX_MS = 2 * 60 * 60 * 1000;

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
 * about any row. Live-only, like everything router-shaped: a desktop's state
 * belongs to that desktop, and a persisted copy of it is only a stale claim.
 */
interface RouterListShape {
  hasModelsKey: boolean;
  /**
   * Which fetch this was. A counter rather than a clock reading, so "the list
   * was re-read after that request" is exact however coarse the clock is.
   */
  seq: number;
  /** The last read of this list failed, and none has succeeded since. */
  stale: boolean;
}

export type RouterOpOutcome = 'ready' | 'failed' | 'withdrawn';

export type RouterLoadOutcome = RouterOpOutcome | 'not-router';

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
  /**
   * The whole of this store's commitment to one server's stream, a scheduled
   * reopen included. Nothing may hold a socket, or a timer that will open one,
   * without an entry here saying which server it is for.
   */
  routerStream: {
    serverId: string;
    state: 'connecting' | 'open' | 'reopening';
  } | null = null;
  routerPolls: Set<string> = new Set();
  routerStreamCap: Record<string, RouterStreamCap> = {};
  routerObservedEviction: Set<string> = new Set();
  routerListShape: Record<string, RouterListShape> = {};
  /** Why a model's last operation ended badly, until the user dismisses it. */
  routerReasons: Record<string, RouterFailure> = {};

  private lastFetchTime = 0;
  private appStateSubscription: any = null;
  private routerStreamHandle: RouterStreamHandle | null = null;
  /** Servers the UI is watching. A picker on screen is the only one there is. */
  private routerStreamViewers = new Set<string>();
  /** Derived from the reasons above; never latched. */
  private routerFocusedServerId: string | null = null;
  private routerStreamSeq = 0;
  private routerReconnectAt: Record<string, number[]> = {};
  /** Non-null exactly while `routerStream` reads `reopening`. */
  private routerReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private routerSuspendedAt: number | null = null;
  private routerReconcileInFlight = new Set<string>();
  private routerReconcilePending = new Set<string>();
  private routerForegrounded = true;
  private routerTicker: ReturnType<typeof setInterval> | null = null;
  private routerPollInFlight = new Set<string>();
  private routerLastPollAt: Record<string, number> = {};
  private routerFetchSeq = 0;
  private routerAttemptSeq = 0;
  private routerOpWaiters = new Map<
    string,
    (outcome: RouterOpOutcome) => void
  >();
  private routerLoadPromises = new Map<string, Promise<RouterLoadOutcome>>();

  constructor() {
    makeAutoObservable(this, {
      serverModels: observable,
      // Connection plumbing: nothing renders from it.
      routerStreamHandle: false,
      routerStreamViewers: false,
      routerFocusedServerId: false,
      routerStreamSeq: false,
      routerReconnectAt: false,
      routerReconnectTimer: false,
      routerSuspendedAt: false,
      routerReconcileInFlight: false,
      routerReconcilePending: false,
      routerForegrounded: false,
      routerTicker: false,
      routerPollInFlight: false,
      routerLastPollAt: false,
      routerFetchSeq: false,
      routerAttemptSeq: false,
      routerOpWaiters: false,
      routerLoadPromises: false,
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
      this.dropRouterState(id);
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
    this.dropRouterState(id);
    // Clean up API key from keychain
    this.removeApiKey(id);
  }

  /**
   * An operation against a server that has been removed or repointed is
   * abandoned rather than failed: it describes a backend that is no longer
   * configured, so there is no outcome left to report about it.
   */
  private dropRouterState(serverId: string): void {
    for (const key of Object.keys(this.routerOps)) {
      if (this.routerOps[key].serverId === serverId) {
        this.abandonRouterOp(key);
      }
    }
    this.routerEvents = dropServerEntries(this.routerEvents, serverId);
    this.routerOps = dropServerEntries(this.routerOps, serverId);
    this.routerReasons = dropServerEntries(this.routerReasons, serverId);
    this.routerPolls.delete(serverId);
    this.routerObservedEviction.delete(serverId);
    delete this.routerStreamCap[serverId];
    delete this.routerListShape[serverId];
    delete this.routerLastPollAt[serverId];
    delete this.routerReconnectAt[serverId];
    this.routerPollInFlight.delete(serverId);
    this.routerStreamViewers.delete(serverId);
    if (this.routerStream?.serverId === serverId) {
      this.closeRouterStream();
    }
    if (this.routerFocusedServerId === serverId) {
      this.routerFocusedServerId = null;
    }
    this.syncRouterTicker();
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
   * What the server's own list says about each model key. It is one half of
   * what a row shows: while an operation of ours is on a key that operation is
   * what presents the row, and this is not read for a label at all.
   */
  get routerRowStates(): Record<string, RouterRowState> {
    const states: Record<string, RouterRowState> = {};
    for (const serverId of this.routerServers) {
      for (const key of this.routerKeysForServer(serverId)) {
        states[key] = this.routerRowFromList(serverId, key);
      }
    }
    return states;
  }

  routerRowState(serverId: string, remoteModelId: string): RouterRowState {
    return (
      this.routerRowStates[`${serverId}/${remoteModelId}`] ??
      this.routerRowFromList(serverId, `${serverId}/${remoteModelId}`)
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

  private routerRowFromList(serverId: string, key: string): RouterListState {
    return rowStateFromList(
      this.serverModels.get(serverId) ?? [],
      key.slice(serverId.length + 1),
      this.routerListShape[serverId]?.stale === true,
    );
  }

  /**
   * Whether a later read of this server's list has already answered. Such a
   * read says nothing in either direction: its rows are older than the ones
   * installed, and its failure is not news about a list somebody has since
   * read successfully.
   */
  private listReadOvertaken(serverId: string, seq: number): boolean {
    const shape = this.routerListShape[serverId];
    return shape !== undefined && shape.seq > seq;
  }

  /**
   * An event names whatever model the server pleases, so the overlay would
   * otherwise grow for the life of the session. A row the list no longer
   * carries, with no operation of ours and nothing said about it since this
   * fetch began, describes a model that is gone.
   */
  private pruneRouterOverlay(serverId: string, startedAt: number): void {
    const listed = new Set(
      (this.serverModels.get(serverId) ?? []).map(
        row => `${serverId}/${row.id}`,
      ),
    );
    const prefix = `${serverId}/`;
    for (const key of Object.keys(this.routerEvents)) {
      if (!key.startsWith(prefix) || listed.has(key) || this.routerOps[key]) {
        continue;
      }
      if (this.routerEvents[key].at > startedAt) {
        continue;
      }
      delete this.routerEvents[key];
    }
  }

  routerLive(serverId: string, remoteModelId: string): RouterLive | undefined {
    return this.routerEvents[`${serverId}/${remoteModelId}`];
  }

  /**
   * What the picker lists. A download has no row on the server until the
   * weights land, so without the operations and the unread failures beside the
   * server's own rows an in-flight fetch is invisible, its Cancel unreachable,
   * and the copy for one that never arrived has nowhere to render.
   */
  routerPickerRows(serverId: string): RemoteModelInfo[] {
    return pickerRowsFromList(this.serverModels.get(serverId) ?? [], serverId, [
      ...Object.keys(this.routerOps),
      ...Object.keys(this.routerReasons),
    ]) as RemoteModelInfo[];
  }

  routerOp(serverId: string, remoteModelId: string): RouterOp | undefined {
    return this.routerOps[`${serverId}/${remoteModelId}`];
  }

  /** Resident models on a server: a fact, shown without predicting anything. */
  routerResidentCount(serverId: string): number {
    return this.routerKeysForServer(serverId).filter(key => {
      const state = this.routerRowFromList(serverId, key);
      return state === 'loaded' || state === 'sleeping';
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
  async fetchModelsForServer(
    serverId: string,
  ): Promise<{ok: boolean; error?: string}> {
    const server = this.servers.find(s => s.id === serverId);
    if (!server) {
      return {ok: false};
    }

    runInAction(() => {
      this.isLoading = true;
      this.error = null;
    });

    const startedAt = Date.now();
    const seq = ++this.routerFetchSeq;

    try {
      const apiKey = await this.getApiKey(serverId);
      const {models, hasModelsKey} = await fetchModelsWithHeaders(
        server.url,
        apiKey,
        server.requestTimeoutMs,
      );

      if (this.listReadOvertaken(serverId, seq)) {
        runInAction(() => {
          this.isLoading = false;
        });
        return {ok: true};
      }

      runInAction(() => {
        this.serverModels.set(serverId, models);
        this.isLoading = false;
        // The stamp is written only here, because this fetch leaves the
        // previous rows in place on a failure: without it, a reconcile that
        // never happened is indistinguishable from one that found the old row,
        // and every bound below turns on that difference.
        this.routerListShape[serverId] = {hasModelsKey, seq, stale: false};
        this.pruneRouterOverlay(serverId, startedAt);

        // Update lastConnected timestamp
        const s = this.servers.find(sv => sv.id === serverId);
        if (s) {
          s.lastConnected = Date.now();
        }
      });
      this.settleRouterOps(serverId);
      return {ok: true};
    } catch (error: any) {
      const message = error.message || 'Failed to fetch models';
      runInAction(() => {
        this.error = message;
        this.isLoading = false;
        const shape = this.routerListShape[serverId];
        if (shape && !this.listReadOvertaken(serverId, seq)) {
          shape.stale = true;
        }
      });
      return {ok: false, error: message};
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
   * The UI is watching this server. Only two things hold a stream — something
   * on screen showing it, and an operation waiting on it — and a stream nobody
   * holds is closed, so neither caller has to remember to.
   */
  openRouterStream(serverId: string): Promise<void> {
    this.routerStreamViewers.add(serverId);
    return this.syncRouterStream();
  }

  /**
   * Nothing is watching this server any more. The stream survives it if an
   * operation is still waiting on one, and ends if nothing else holds it.
   */
  releaseRouterStream(serverId: string): void {
    this.routerStreamViewers.delete(serverId);
    delete this.routerReconnectAt[serverId];
    this.syncRouterStream();
  }

  /**
   * Which server this store should hold its one stream against: what the user
   * is looking at, else the most recent operation's server. N sockets to N
   * desktops is not a thing to do on a phone.
   */
  private wantedRouterStreamServer(): string | null {
    const configured = (serverId: string) =>
      this.servers.some(server => server.id === serverId);
    for (const serverId of [...this.routerStreamViewers].reverse()) {
      if (configured(serverId)) {
        return serverId;
      }
    }
    let latest: RouterOp | undefined;
    for (const op of Object.values(this.routerOps)) {
      if (!latest || op.startedAt > latest.startedAt) {
        latest = op;
      }
    }
    return latest !== undefined && configured(latest.serverId)
      ? latest.serverId
      : null;
  }

  /** Read after every change to either reason, and after nothing else. */
  private syncRouterStream(): Promise<void> {
    const wanted = this.wantedRouterStreamServer();
    if (wanted === null) {
      this.routerFocusedServerId = null;
      this.closeRouterStream();
      return Promise.resolve();
    }
    return this.connectRouterStream(wanted);
  }

  private async connectRouterStream(serverId: string): Promise<void> {
    this.routerFocusedServerId = serverId;
    if (!this.isRouterServer(serverId) || !this.routerForegrounded) {
      return;
    }
    if (this.routerStreamCapFor(serverId) === 'absent') {
      return;
    }
    const held = this.routerStream;
    if (
      held?.serverId === serverId &&
      (held.state === 'connecting' || held.state === 'open')
    ) {
      return;
    }
    const server = this.servers.find(s => s.id === serverId);
    if (!server) {
      return;
    }
    this.closeRouterStream();
    const attempt = ++this.routerStreamSeq;
    // Claimed before the Keychain is read, because that await is long enough
    // for a second caller to reach the guard above and open a request this one
    // would then lose the handle to.
    runInAction(() => this.setRouterStream({serverId, state: 'connecting'}));

    const apiKey = await this.getApiKey(serverId);
    if (attempt !== this.routerStreamSeq) {
      return;
    }
    if (this.routerFocusedServerId !== serverId || !this.routerForegrounded) {
      this.closeRouterStream();
      return;
    }

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

  /**
   * Closing tells no handler: the stream ends here because this store said so,
   * and only an ending nobody asked for is a reason to open another.
   */
  closeRouterStream(): void {
    this.routerStreamSeq++;
    if (this.routerReconnectTimer) {
      clearTimeout(this.routerReconnectTimer);
      this.routerReconnectTimer = null;
    }
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
    this.reopenRouterStream(serverId, error);
  }

  /**
   * An HTTP status is a refusal — this build, or these credentials — and will
   * answer the same way again. Everything else is transport: React Native maps
   * `xhr.timeout = 0` onto Foundation's 60-second idle default on iOS, so a
   * stream that simply went quiet arrives as an error carrying no status, and
   * gating the reopen on `!error` would leave that platform never reconnecting.
   */
  private reopenRouterStream(
    serverId: string,
    error?: RouterStreamError,
  ): void {
    if (
      error?.status !== undefined ||
      !this.routerForegrounded ||
      this.routerFocusedServerId !== serverId
    ) {
      return;
    }
    const now = Date.now();
    const attempts = (this.routerReconnectAt[serverId] ?? []).filter(
      at => now - at < ROUTER_RECONNECT_WINDOW_MS,
    );
    this.routerReconnectAt[serverId] = attempts;
    if (attempts.length >= ROUTER_RECONNECT_MAX) {
      return;
    }
    attempts.push(now);
    const delay = attempts.length > 1 ? ROUTER_RECONNECT_BACKOFF_MS : 0;
    runInAction(() => {
      this.setRouterStream({serverId, state: 'reopening'});
      this.routerReconnectTimer = setTimeout(() => {
        runInAction(() => {
          this.routerReconnectTimer = null;
          this.setRouterStream(null);
        });
        this.syncRouterStream();
      }, delay);
    });
  }

  /**
   * An event says a model's situation may have changed; what it is comes from
   * the list. Nothing here reads an outcome out of one.
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

    const key = this.adoptRouterEventKey(serverId, effect.about, effect.model);
    runInAction(() => {
      this.routerEvents[key] = applyLivePatch(
        this.routerEvents[key],
        effect.patch,
        Date.now(),
      );
      if (this.isEvictionEvidence(serverId, key, effect.patch.status)) {
        this.routerObservedEviction.add(serverId);
      }
      const op = this.routerOps[key];
      if (op) {
        if (effect.attemptEnded) {
          op.attemptEndedAt = Date.now();
        }
        op.phase = 'active';
        op.lastEvidenceAt = Date.now();
      }
    });

    if (effect.reconcile) {
      this.requestRouterReconcile(serverId);
    }
  }

  /**
   * The server may normalise the reference that was typed, so a download with
   * no competitor adopts the id its first event carries. Everything else has
   * to be ruled out first, because a wrong adoption reads this download's
   * verdict off another model's row: it settles `ready` and disappears while
   * the fetch it was tracking goes on untracked.
   */
  private adoptRouterEventKey(
    serverId: string,
    about: 'status' | 'download',
    model: string,
  ): string {
    const exact = `${serverId}/${model}`;
    if (this.routerOps[exact]) {
      return exact;
    }
    if (about !== 'download') {
      return exact;
    }
    // A model the server already lists is not the one it is still fetching
    // for us, whatever it says about it.
    const listed: RouterRowState = this.routerRowFromList(serverId, exact);
    if (listed !== 'absent') {
      return exact;
    }
    const downloads = Object.entries(this.routerOps).filter(
      ([, op]) => op.serverId === serverId && op.kind === 'download',
    );
    if (downloads.length !== 1) {
      return exact;
    }
    const [previousKey, op] = downloads[0];
    // The id its *first* event carries: once anything has been heard about
    // this download, a later id belongs to some other fetch.
    if (op.phase !== 'requested') {
      return exact;
    }
    runInAction(() => {
      this.setRouterOp(previousKey, undefined);
      this.setRouterOp(exact, {...op, key: exact});
      // The adopted key may carry detail from an earlier attempt on it, and
      // this operation did not go through the clearing that starting one does.
      delete this.routerEvents[exact];
      const live = this.routerEvents[previousKey];
      if (live) {
        delete this.routerEvents[previousKey];
        this.routerEvents[exact] = live;
      }
    });
    const waiter = this.routerOpWaiters.get(previousKey);
    if (waiter) {
      this.routerOpWaiters.delete(previousKey);
      this.routerOpWaiters.set(exact, waiter);
    }
    return exact;
  }

  /**
   * The note tells the user this server drops models to make room, so it needs
   * both halves: nothing of ours was operating on the model that went away,
   * and something of ours was asking for room while it did. Without the first
   * it fires on our own failed load; without the second, on the ordinary
   * idle-timeout exit every one of these servers performs unprompted.
   */
  private isEvictionEvidence(
    serverId: string,
    key: string,
    status: RouterRowState | undefined,
  ): boolean {
    if (status !== 'unloaded' || this.routerOps[key]) {
      return false;
    }
    return Object.values(this.routerOps).some(
      op => op.serverId === serverId && op.kind !== 'unload',
    );
  }

  /**
   * Every event that may have settled something asks the list. A progress
   * stream can carry many of those a second, so a request made while one is
   * already running is collapsed into a single follow-up rather than issued:
   * the answer to all of them is whatever the next read returns.
   */
  private requestRouterReconcile(serverId: string): void {
    if (this.routerReconcileInFlight.has(serverId)) {
      this.routerReconcilePending.add(serverId);
      return;
    }
    this.routerReconcileInFlight.add(serverId);
    this.fetchModelsForServer(serverId)
      .catch(() => {})
      .then(() => {
        this.routerReconcileInFlight.delete(serverId);
        if (this.routerReconcilePending.delete(serverId)) {
          this.requestRouterReconcile(serverId);
        }
      });
  }

  // Operations

  setRouterOp(key: string, op: RouterOp | undefined): void {
    if (op) {
      this.routerOps[key] = op;
    } else {
      delete this.routerOps[key];
    }
  }

  dismissRouterReason(serverId: string, remoteModelId: string): void {
    delete this.routerReasons[`${serverId}/${remoteModelId}`];
  }

  routerReason(
    serverId: string,
    remoteModelId: string,
  ): RouterFailure | undefined {
    return this.routerReasons[`${serverId}/${remoteModelId}`];
  }

  /**
   * The only issuer of a load request. Idempotent per model: called again while
   * one is in flight it returns the same promise and posts nothing, so
   * activation, the picker, the send gate and the engine cannot double-post.
   */
  async ensureRouterModelLoaded(
    serverId: string,
    remoteModelId: string,
  ): Promise<RouterLoadOutcome> {
    if (!this.isRouterServer(serverId)) {
      return 'not-router';
    }
    const key = `${serverId}/${remoteModelId}`;
    const pending = this.routerLoadPromises.get(key);
    if (pending) {
      return pending;
    }
    const listed: RouterRowState = this.routerRowFromList(serverId, key);
    if (listed === 'loaded') {
      return 'ready';
    }
    const promise = this.runRouterLoad(serverId, remoteModelId, key);
    this.routerLoadPromises.set(key, promise);
    return promise;
  }

  private async runRouterLoad(
    serverId: string,
    remoteModelId: string,
    key: string,
  ): Promise<RouterLoadOutcome> {
    const server = this.servers.find(s => s.id === serverId);
    if (!server) {
      this.routerLoadPromises.delete(key);
      return 'not-router';
    }
    const attempt = this.nextRouterAttempt();
    const settled = this.startRouterOp(key, {
      kind: 'load',
      attempt,
      phase: 'requested',
      serverId,
      key,
      startedAt: Date.now(),
      requestSeq: this.routerFetchSeq,
      lastEvidenceAt: Date.now(),
    });

    try {
      const apiKey = await this.getApiKey(serverId);
      const {status, body} = await routerLoad(
        server.url,
        remoteModelId,
        apiKey,
        server.requestTimeoutMs,
      );
      if (status < 200 || status >= 300) {
        this.resolveRefusedLoad(serverId, key, attempt, body);
      }
      // A 2xx says the request was accepted, not that a load is under way: the
      // child can still fail to launch with nothing further on the wire.
    } catch (error: any) {
      // The request never reached the server, so nothing is known about the
      // model. Reporting that it did not load would be a claim this app is in
      // no position to make.
      const failed = this.routerOps[key];
      if (failed) {
        this.settleRouterAttempt(
          key,
          attempt,
          'failed',
          unreachableFailureFrom(
            failed,
            error?.message && capServerText(error.message),
          ),
        );
      }
    }
    return settled;
  }

  /**
   * A refusal is resolved by the model's reconciled row, never by the text of
   * the refusal and never by an event. A load posted at a model that is
   * already resident answers 400 and does not wake it — the end state the
   * caller wanted is already true, so it settles ready and shows nothing.
   */
  private resolveRefusedLoad(
    serverId: string,
    key: string,
    attempt: number,
    body: unknown,
  ): void {
    if (this.routerOps[key]?.attempt !== attempt) {
      return;
    }
    const reason = routerErrorMessage(body);
    const verdict = loadVerdict(this.routerRowFromList(serverId, key));
    if (verdict === 'ready') {
      this.settleRouterAttempt(key, attempt, 'ready');
      return;
    }
    if (verdict === 'in-flight') {
      return;
    }
    runInAction(() => {
      const op = this.routerOps[key];
      if (op) {
        op.reason = reason;
        op.verdictRequested = true;
      }
    });
    this.requestRouterReconcile(serverId);
  }

  /**
   * Unloads a resident model. The request is asynchronous: a 200 means the
   * server accepted it and the row goes on reading the old state until it
   * converges, so nothing is settled here and a verdict read off the response
   * would report a correct unload as a failure.
   */
  async unloadRouterModel(
    serverId: string,
    remoteModelId: string,
  ): Promise<RouterOpOutcome> {
    if (!this.isRouterServer(serverId)) {
      return 'failed';
    }
    const key = `${serverId}/${remoteModelId}`;
    if (this.routerOps[key]?.kind === 'unload') {
      return 'failed';
    }
    const server = this.servers.find(s => s.id === serverId);
    if (!server) {
      return 'failed';
    }
    const settled = this.startRouterOp(key, {
      kind: 'unload',
      attempt: this.nextRouterAttempt(),
      phase: 'requested',
      serverId,
      key,
      startedAt: Date.now(),
      requestSeq: this.routerFetchSeq,
      lastEvidenceAt: Date.now(),
    });

    try {
      const apiKey = await this.getApiKey(serverId);
      const {status, body} = await routerUnload(
        server.url,
        remoteModelId,
        apiKey,
        server.requestTimeoutMs,
      );
      if (status < 200 || status >= 300) {
        runInAction(() => {
          const op = this.routerOps[key];
          if (op) {
            op.reason = routerErrorMessage(body);
          }
        });
      }
    } catch {
      // The request may still have been acted on, so the row decides.
    }
    this.requestRouterReconcile(serverId);
    return settled as Promise<RouterOpOutcome>;
  }

  /**
   * Asks the server to fetch a model for itself. The reference goes on the
   * wire exactly as typed. A 200 is acceptance and not validation — a
   * repository that does not exist is accepted with the same shape — so the
   * only evidence the model arrived is its row appearing in the list.
   */
  async startRouterDownload(
    serverId: string,
    reference: string,
  ): Promise<{accepted: boolean; message?: string}> {
    const server = this.servers.find(s => s.id === serverId);
    if (!server || !this.isRouterServer(serverId)) {
      return {accepted: false};
    }
    const key = `${serverId}/${reference}`;
    try {
      const apiKey = await this.getApiKey(serverId);
      const {status, body} = await routerDownload(
        server.url,
        reference,
        apiKey,
        server.requestTimeoutMs,
      );
      if (status < 200 || status >= 300) {
        return {accepted: false, message: routerErrorMessage(body)};
      }
    } catch (error: any) {
      return {
        accepted: false,
        message: error?.message && capServerText(error.message),
      };
    }
    this.startRouterOp(key, {
      kind: 'download',
      attempt: this.nextRouterAttempt(),
      phase: 'requested',
      serverId,
      key,
      startedAt: Date.now(),
      requestSeq: this.routerFetchSeq,
      lastEvidenceAt: Date.now(),
    });
    return {accepted: true};
  }

  /**
   * Stopping either a load or a download is an unload of the model in
   * question, which is the wire's own contract and not derivable from the
   * endpoint's name.
   */
  async cancelRouterOp(serverId: string, remoteModelId: string): Promise<void> {
    const key = `${serverId}/${remoteModelId}`;
    const op = this.routerOps[key];
    if (!op || op.kind === 'unload') {
      return;
    }
    runInAction(() => {
      op.cancelled = true;
      op.attemptEndedAt = Date.now();
    });
    // The user has just said the request is over, so nobody waiting on it
    // needs the list to confirm that. Whether the model is loaded is a
    // separate question, and the operation goes on asking it below.
    this.releaseRouterWaiter(key, 'withdrawn');
    const server = this.servers.find(s => s.id === serverId);
    if (server) {
      const apiKey = await this.getApiKey(serverId);
      await routerUnload(
        server.url,
        remoteModelId,
        apiKey,
        server.requestTimeoutMs,
      ).catch(() => undefined);
    }
    this.requestRouterReconcile(serverId);
  }

  /** A number no other operation carries, so a late answer can be placed. */
  private nextRouterAttempt(): number {
    return ++this.routerAttemptSeq;
  }

  /**
   * Settles only if the attempt that is answering is still the one this key
   * carries. A request that has been replaced is reporting about something
   * nothing is tracking, and its answer would land on the replacement.
   */
  private settleRouterAttempt(
    key: string,
    attempt: number,
    outcome: RouterOpOutcome,
    failure?: RouterFailure,
  ): void {
    if (this.routerOps[key]?.attempt !== attempt) {
      return;
    }
    this.settleRouterOp(key, outcome, failure);
  }

  private startRouterOp(key: string, op: RouterOp): Promise<RouterLoadOutcome> {
    // Every operation settles, a superseded one included: the question it was
    // asking is no longer being tracked, and a caller left awaiting an answer
    // that can never come hangs with nothing to show for it.
    this.abandonRouterOp(key);
    const settled = new Promise<RouterLoadOutcome>(resolve =>
      this.routerOpWaiters.set(key, resolve),
    );
    runInAction(() => {
      this.setRouterOp(key, op);
      delete this.routerReasons[key];
      // Detail is keyed by model, not by attempt: left behind, the last
      // attempt's fraction opens this one part-way through and its exit code
      // is suffixed to this one's failure.
      delete this.routerEvents[key];
    });
    this.syncRouterTiers();
    this.syncRouterStream();
    return settled;
  }

  /**
   * Answers whoever is awaiting this key without settling the operation.
   *
   * Two different questions run through one key. Whether the model loaded is a
   * fact about the model, and needs a read of the list to corroborate it —
   * that is what settling an operation decides. Whether the request is still
   * being pursued is a fact about the request, and is sometimes known outright:
   * a caller left waiting for corroboration it does not need is a send
   * suspended for as long as the server stays quiet. Resolving a waiter is
   * once per key; a later settle finds none and says nothing to anybody.
   */
  private releaseRouterWaiter(key: string, outcome: RouterOpOutcome): void {
    const waiter = this.routerOpWaiters.get(key);
    if (!waiter) {
      return;
    }
    this.routerOpWaiters.delete(key);
    this.routerLoadPromises.delete(key);
    waiter(outcome);
  }

  /** The question this key was asking is no longer being tracked. */
  private abandonRouterOp(key: string): void {
    this.releaseRouterWaiter(key, 'failed');
  }

  private settleRouterOp(
    key: string,
    outcome: RouterOpOutcome,
    failure?: RouterFailure,
  ): void {
    if (!this.routerOps[key]) {
      return;
    }
    runInAction(() => {
      this.setRouterOp(key, undefined);
      if (outcome === 'failed' && failure) {
        this.routerReasons[key] = failure;
      }
    });
    const waiter = this.routerOpWaiters.get(key);
    this.routerOpWaiters.delete(key);
    this.routerLoadPromises.delete(key);
    waiter?.(outcome);
    this.syncRouterTiers();
    this.syncRouterStream();
  }

  /**
   * Read after every reconcile of this server. Each kind has its own verdict
   * and borrows no other's.
   */
  private settleRouterOps(serverId: string): void {
    for (const [key, op] of Object.entries({...this.routerOps})) {
      if (op.serverId !== serverId) {
        continue;
      }
      const state = this.routerRowFromList(serverId, key);
      if (op.kind === 'load') {
        this.settleLoadOp(key, op, state);
      } else if (op.kind === 'unload') {
        this.settleUnloadOp(key, op, state);
      } else {
        this.settleDownloadOp(key, op);
      }
    }
  }

  private settleLoadOp(
    key: string,
    op: RouterOp,
    state: RouterListState,
  ): void {
    const verdict = loadVerdict(state);
    if (verdict === 'ready' && this.hasReconciledSince(op)) {
      this.settleRouterOp(key, 'ready');
      return;
    }
    // A withdrawn request has no outcome left to report, whatever the row goes
    // on saying: what the caller is waiting on is the request, not the model.
    if (op.cancelled) {
      this.settleRouterOp(key, 'withdrawn');
      return;
    }
    // A read that began before the request reports the state from before it,
    // which settles this request in neither direction. An uncorroborated
    // success means keep waiting, never declare failure.
    if (!this.hasReconciledSince(op)) {
      return;
    }
    if (verdict === 'in-flight') {
      runInAction(() => {
        op.phase = 'active';
        op.lastEvidenceAt = Date.now();
        op.verdictRequested = false;
      });
      return;
    }
    // A request that has not been acknowledged yet is not a failure: the server
    // may simply not have started.
    if (op.phase === 'active' || op.verdictRequested) {
      this.settleRouterOp(key, 'failed', this.loadFailure(op, key));
    }
  }

  private loadFailure(op: RouterOp, key: string): RouterFailure | undefined {
    return loadFailureFrom(
      this.routerRowFromList(op.serverId, key),
      op,
      op.reason ?? this.rowReason(key),
    );
  }

  /**
   * Read the other way round from a load: what the caller asked for is that
   * the model be gone. A model the server had already dropped answers 400 and
   * settles success, because the end state is already true.
   */
  private settleUnloadOp(
    key: string,
    op: RouterOp,
    state: RouterListState,
  ): void {
    if (!this.hasReconciledSince(op)) {
      return;
    }
    if (unloadVerdict(state) === 'released') {
      this.settleRouterOp(key, 'ready');
    }
  }

  /**
   * A download settles on the model's presence in the list. Neither terminal
   * event says which outcome happened: the same one fires for a download that
   * succeeded and for one of a repository that does not exist, and the other
   * fires on cancel. Absence is not failure while the ceiling is unspent —
   * a model being fetched need not be listed until it lands.
   */
  private settleDownloadOp(key: string, op: RouterOp): void {
    const now = Date.now();
    const verdict = downloadVerdict({
      rowState: this.routerRowFromList(op.serverId, key),
      // The terminal event stamps `lastEvidenceAt` as well, so without it in
      // the baseline every download would corroborate its own ending and the
      // grace below could never be spent.
      freshCorroboration:
        op.lastEvidenceAt >
        Math.max(op.armedAt ?? op.startedAt, op.attemptEndedAt ?? 0),
      attemptEnded: op.attemptEndedAt !== undefined,
      graceElapsed:
        op.attemptEndedAt !== undefined &&
        now - op.attemptEndedAt > ROUTER_DOWNLOAD_SETTLE_MS,
      ceilingElapsed: now - op.startedAt > ROUTER_DOWNLOAD_MAX_MS,
    });
    if (verdict === 'arrived') {
      this.settleRouterOp(key, 'ready');
      return;
    }
    if (verdict === 'never-arrived') {
      if (op.cancelled) {
        this.settleRouterOp(key, 'withdrawn');
      } else {
        this.settleRouterOp(key, 'failed', {cause: 'download-not-fetched'});
      }
      return;
    }
    runInAction(() => {
      if (verdict === 'downloading') {
        op.phase = 'active';
        op.lastEvidenceAt = now;
      }
      op.verdictRequested = false;
    });
  }

  private rowReason(key: string): string | undefined {
    const exitCode = this.routerEvents[key]?.exitCode;
    return typeof exitCode === 'number' && exitCode !== 0
      ? `exit code ${exitCode}`
      : undefined;
  }

  /**
   * Whether a models fetch that began after this request has since succeeded.
   * A fetch already in flight when the request went out can only report the
   * state from before it, so its completion says nothing about the request.
   */
  private hasReconciledSince(op: RouterOp): boolean {
    const shape = this.routerListShape[op.serverId];
    return shape !== undefined && shape.seq > op.requestSeq;
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
   * the existing models fetch rather than adding a second source, so the poll
   * can never disagree with the list the capabilities are derived from.
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
    this.armRouterWatchdogs(now);
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

  /** Expiry asks the list. It never reads an outcome out of the silence. */
  private armRouterWatchdogs(now: number): void {
    for (const [key, op] of Object.entries({...this.routerOps})) {
      if (
        op.verdictRequested &&
        !this.hasReconciledSince(op) &&
        now - op.startedAt > ROUTER_UNREACHABLE_MS
      ) {
        this.settleRouterOp(
          key,
          'failed',
          unreachableFailureFrom(op, op.reason),
        );
        continue;
      }
      if (op.kind === 'unload') {
        this.applyUnloadBound(key, op, now);
        continue;
      }
      // Ten minutes is a fact about how long this app waited, so the row is
      // still what says whether the model loaded — but the wait ending is news
      // in itself, because a message is on screen waiting for it.
      if (op.kind === 'load' && now - op.startedAt > ROUTER_LOAD_MAX_MS) {
        this.settleRouterOp(
          key,
          'failed',
          waitStoppedFailureFrom(
            this.routerRowFromList(op.serverId, key),
            op,
            op.reason ?? this.rowReason(key),
          ),
        );
        continue;
      }
      const interval =
        op.phase === 'requested' ? ROUTER_ACK_MS : ROUTER_EVIDENCE_MS;
      if (now - op.lastEvidenceAt <= interval) {
        continue;
      }
      runInAction(() => {
        op.lastEvidenceAt = now;
        op.armedAt = now;
        op.verdictRequested = true;
      });
      this.requestRouterReconcile(op.serverId);
    }
  }

  /**
   * An unload arms no watchdog: there is no acknowledgement to wait for and no
   * evidence to re-arm from, only convergence. A row nobody managed to re-read
   * is not an unconverged one, so the bound applies only against a reconcile
   * that ran after the request.
   */
  private applyUnloadBound(key: string, op: RouterOp, now: number): void {
    if (now - op.startedAt <= ROUTER_UNLOAD_SETTLE_MS) {
      return;
    }
    if (!this.hasReconciledSince(op)) {
      runInAction(() => {
        op.verdictRequested = true;
      });
      this.requestRouterReconcile(op.serverId);
      return;
    }
    // A fetch having succeeded since the request says nothing about what it
    // found, so the bound reads the row the same way the reconcile does. A row
    // that has released the model cannot reach here: the fetch that made it so
    // settled the operation ready on its way past.
    this.settleRouterOp(
      key,
      'failed',
      unloadFailureFrom(this.routerRowFromList(op.serverId, key)),
    );
  }

  // Auto-fetch on foreground
  private setupAppStateListener(): void {
    this.appStateSubscription = AppState.addEventListener(
      'change',
      (nextAppState: AppStateStatus) => {
        if (nextAppState === 'active') {
          this.routerForegrounded = true;
          this.resumeRouterOps();
          const now = Date.now();
          if (now - this.lastFetchTime > FETCH_THROTTLE_MS) {
            this.fetchAllRemoteModels();
          }
          this.handleRouterForeground();
        } else {
          this.routerForegrounded = false;
          this.routerSuspendedAt = Date.now();
          this.closeRouterStream();
          this.syncRouterTicker();
        }
      },
    );
  }

  /**
   * Every bound on an operation measures how long this app has gone without
   * being able to ask, and a backgrounded app was not failing to ask — it was
   * not running. Charging that time would settle a model still loading as
   * failed the moment the user came back. Each stamp moves forward by the
   * interval instead, so every bound resumes exactly where it was suspended.
   */
  private resumeRouterOps(): void {
    const suspendedAt = this.routerSuspendedAt;
    this.routerSuspendedAt = null;
    if (suspendedAt === null) {
      return;
    }
    const suspended = Date.now() - suspendedAt;
    if (suspended <= 0) {
      return;
    }
    runInAction(() => {
      for (const op of Object.values(this.routerOps)) {
        op.startedAt += suspended;
        op.lastEvidenceAt += suspended;
        if (op.armedAt !== undefined) {
          op.armedAt += suspended;
        }
        if (op.attemptEndedAt !== undefined) {
          op.attemptEndedAt += suspended;
        }
      }
    });
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
    await this.syncRouterStream();
    this.syncRouterTiers();
  }
}

export const serverStore = new ServerStore();
