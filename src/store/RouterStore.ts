import {
  IReactionDisposer,
  comparer,
  makeAutoObservable,
  makeObservable,
  observable,
  reaction,
  runInAction,
} from 'mobx';

import {serverStore} from './ServerStore';
import {profileFor} from '../api/servers';
import {
  openRouterEvents,
  postLoad,
  postUnload,
} from '../api/llamaServer/router';
import type {RouterEventsHandle, RouterTarget} from '../api/llamaServer/router';
import {
  hasRouterStatus,
  reduceRouterEvent,
  rowExitCode,
  rowStateFromList,
  serverReason,
} from '../api/llamaServer/routerWire';
import type {ListRowState, LoadProgress} from '../api/llamaServer/routerWire';
import {
  loadFailure,
  loadMaxFailure,
  loadVerdict,
  unloadReleased,
  unloadSettleFailure,
  unreachableFailure,
} from './routerVerdicts';
import type {RecordKind, RecordPhase, RouterFailure} from './routerVerdicts';
import {
  RemoteModelNotReadyError,
  RemoteModelRequestWithdrawnError,
} from '../utils/errors';
import type {RemoteSessionBinding, ServerConfig} from '../utils/types';

export type RecordOutcome = 'ready' | 'failed' | 'withdrawn' | 'not-router';
/** `stopped` is per caller: its own signal ended its wait, not the record. */
export type WaitOutcome = RecordOutcome | 'stopped';

export type StreamCap = 'unknown' | 'present' | 'absent';

export const ROUTER_POLL_MS = 4000;
export const ROUTER_TICK_MS = 1000;
export const ROUTER_ACK_MS = 20000;
export const ROUTER_EVIDENCE_MS = 45000;
export const ROUTER_UNREACHABLE_MS = 90000;
export const ROUTER_LOAD_MAX_MS = 10 * 60 * 1000;
/** Longer than the 10 s the server allows a child to stop. */
export const ROUTER_UNLOAD_SETTLE_MS = 30000;

export interface RecordDetail {
  progress?: LoadProgress;
  exitCode?: number;
}

interface Joined {
  outcome: WaitOutcome;
  record?: RouterRecord;
}

const keyOf = (serverId: string, remoteModelId: string) =>
  `${serverId}/${remoteModelId}`;

const isSuccess = (status: number) => status >= 200 && status < 300;

const noop = () => {};

/**
 * One router operation on one model. It owns its abort controller and its
 * promise, so withdrawing it and proving a late answer still belongs to it
 * are the same check.
 */
export class RouterRecord {
  readonly key: string;
  readonly serverId: string;
  readonly remoteModelId: string;
  readonly url: string;
  readonly serverType: ServerConfig['serverType'];
  readonly controller = new AbortController();
  readonly done: Promise<RecordOutcome>;
  readonly startedAt: number;
  phase: RecordPhase = 'requested';
  /**
   * The read counter just before the request went out; only a read that
   * started later may settle this record. Infinite until then.
   */
  postedAfterSeq = Number.POSITIVE_INFINITY;
  lastEvidenceAt: number;
  lastReadOkAt?: number;
  /** An event for this model arrived: the server was reachable then. */
  lastEventAt?: number;
  verdictRequested = false;
  detail?: RecordDetail = undefined;
  droppedTurn = false;
  failure?: RouterFailure = undefined;
  /** Bounded words from a refused request, kept for a later failure. */
  reason?: string;
  settle!: (outcome: RecordOutcome) => void;

  constructor(
    readonly kind: RecordKind,
    server: ServerConfig,
    remoteModelId: string,
    now: number,
  ) {
    this.key = keyOf(server.id, remoteModelId);
    this.serverId = server.id;
    this.remoteModelId = remoteModelId;
    this.url = server.url;
    this.serverType = server.serverType;
    this.startedAt = now;
    this.lastEvidenceAt = now;
    this.done = new Promise(resolve => {
      this.settle = resolve;
    });
    makeObservable(this, {
      phase: observable,
      verdictRequested: observable,
      detail: observable.ref,
      droppedTurn: observable,
      failure: observable.ref,
    });
  }
}

/**
 * llama-server router mode: loads and unloads one model at a time on a
 * server whose list says it is a router. Reads `ServerStore` and never writes
 * it; the list `ServerStore` fetches is the only verdict source.
 */
export class RouterStore {
  records = observable.map<string, RouterRecord>({}, {deep: false});
  /** Whether a server's build has `/models/sse`; only a 404 says it has not. */
  streamCap: Record<string, StreamCap> = {};
  stream: {serverId: string; state: 'connecting' | 'open'} | null = null;
  pickerServerId: string | null = null;
  /** Servers where a model left without this app asking. */
  observedEviction = new Set<string>();

  /**
   * Follows the app state, but only flips back to true together with the
   * foreground reads it starts, so the stream reopens after them.
   */
  private foreground = true;
  private foregroundReadsPending = 0;
  /** Wall time minus the time spent in the background this session. */
  private clock = {
    backgroundedTotalMs: 0,
    backgroundedAt: undefined as number | undefined,
  };
  private prevResident = new Map<string, Set<string>>();
  /** Keys whose unload this app just saw settle; their exit is not news. */
  private released = new Set<string>();
  /** Servers whose stream ended on its own; polled, not reopened. */
  private streamDropped = new Set<string>();
  private streamHandle: RouterEventsHandle | null = null;
  private streamToken = 0;
  private lastPollAt = new Map<string, number>();
  private ticker: ReturnType<typeof setInterval> | null = null;
  private reads = new Map<
    string,
    {current: Promise<void>; next?: Promise<void>}
  >();
  private seenSeq = new Map<string, number>();
  private disposers: IReactionDisposer[] = [];

  constructor() {
    makeAutoObservable<
      this,
      | 'foreground'
      | 'foregroundReadsPending'
      | 'clock'
      | 'prevResident'
      | 'released'
      | 'streamDropped'
      | 'streamHandle'
      | 'streamToken'
      | 'lastPollAt'
      | 'ticker'
      | 'reads'
      | 'seenSeq'
      | 'disposers'
    >(this, {
      records: false,
      stream: observable.ref,
      foreground: observable,
      foregroundReadsPending: observable,
      clock: false,
      prevResident: false,
      released: false,
      streamDropped: observable,
      streamHandle: false,
      streamToken: false,
      lastPollAt: false,
      ticker: false,
      reads: false,
      seenSeq: false,
      disposers: false,
    });
  }

  /**
   * At most one stream app-wide: to the server the picker shows, else to the
   * server of the most recent load or unload in flight. None while
   * backgrounded, and never to one whose stream is absent or has dropped.
   */
  get desiredStreamServer(): string | null {
    if (!this.foreground || this.foregroundReadsPending > 0) {
      return null;
    }
    const candidates: string[] = [];
    if (this.pickerServerId && this.isRouter(this.pickerServerId)) {
      candidates.push(this.pickerServerId);
    }
    const latest = this.allInFlight.at(-1);
    if (latest) {
      candidates.push(latest.serverId);
    }
    return (
      candidates.find(
        id => this.streamCap[id] !== 'absent' && !this.streamDropped.has(id),
      ) ?? null
    );
  }

  get hasInFlight(): boolean {
    return this.allInFlight.length > 0;
  }

  private get allInFlight(): RouterRecord[] {
    return Array.from<RouterRecord>(this.records.values()).filter(record =>
      this.owns(record),
    );
  }

  /** Router evidence: the type can be one, and its list says it is one. */
  isRouter(serverId: string): boolean {
    const server = serverStore.servers.find(s => s.id === serverId);
    if (!server || !profileFor(server.serverType).hasRouter) {
      return false;
    }
    const rows = serverStore.serverModels.get(serverId) ?? [];
    if (rows.length > 0) {
      return rows.some(hasRouterStatus);
    }
    return serverStore.listReads[serverId]?.hasModelsKey === false;
  }

  /** The list's word on one model; a stale or missing read claims nothing. */
  rowState(serverId: string, remoteModelId: string): ListRowState {
    return rowStateFromList(
      serverStore.serverModels.get(serverId) ?? [],
      remoteModelId,
      serverStore.listReads[serverId]?.stale !== false,
    );
  }

  /** Rows the list shows loaded or sleeping, minus any this app is unloading. */
  residentCount(serverId: string): number {
    return (serverStore.serverModels.get(serverId) ?? []).filter(row => {
      const record = this.recordFor(serverId, row.id);
      if (record?.kind === 'unload' && this.owns(record)) {
        return false;
      }
      const state = this.rowState(serverId, row.id);
      return state === 'loaded' || state === 'sleeping';
    }).length;
  }

  recordFor(serverId: string, remoteModelId: string): RouterRecord | undefined {
    return this.records.get(keyOf(serverId, remoteModelId));
  }

  owns(record: RouterRecord): boolean {
    return (
      this.records.get(record.key) === record &&
      !record.controller.signal.aborted &&
      record.failure === undefined
    );
  }

  /**
   * The only issuer of a load. Resolves when the model is ready, the load
   * ended, the server turned out not to be a router, or the caller's signal
   * ended this caller's wait.
   */
  async ensureLoaded(
    serverId: string,
    remoteModelId: string,
    signal?: AbortSignal,
  ): Promise<WaitOutcome> {
    return (await this.acquire(serverId, remoteModelId, signal)).outcome;
  }

  /**
   * Readiness for the completion engine. A session whose url no longer
   * matches the server it was bound to stays on its own backend untouched.
   */
  async ensureReady(
    binding: RemoteSessionBinding,
    signal: AbortSignal,
  ): Promise<void> {
    const server = serverStore.servers.find(s => s.id === binding.serverId);
    if (!server || server.url !== binding.url) {
      return;
    }
    const {outcome, record} = await this.acquire(
      binding.serverId,
      binding.remoteModelId,
      signal,
    );
    if (outcome === 'withdrawn') {
      throw new RemoteModelRequestWithdrawnError();
    }
    if (outcome === 'failed') {
      throw new RemoteModelNotReadyError(
        record?.failure?.cause ?? 'load-failed',
      );
    }
  }

  unload(serverId: string, remoteModelId: string): void {
    this.activate();
    const existing = this.recordFor(serverId, remoteModelId);
    if (existing && this.owns(existing)) {
      return;
    }
    const server = serverStore.servers.find(s => s.id === serverId);
    if (!server || !this.isRouter(serverId)) {
      return;
    }
    if (existing) {
      this.records.delete(existing.key);
    }
    this.issueUnload(this.start('unload', server, remoteModelId));
  }

  /** Ends an in-flight load and unloads whatever it may have started. */
  cancel(serverId: string, remoteModelId: string): void {
    const record = this.recordFor(serverId, remoteModelId);
    if (!record || record.kind !== 'load' || !this.owns(record)) {
      return;
    }
    this.end(record, 'withdrawn');
    this.unload(serverId, remoteModelId);
  }

  /** The picker shows this server; a dropped stream there may reopen. */
  setPickerServer(serverId: string | null): void {
    this.activate();
    this.pickerServerId = serverId;
    if (serverId) {
      this.streamDropped.delete(serverId);
    }
  }

  dismiss(serverId: string, remoteModelId: string): void {
    const record = this.recordFor(serverId, remoteModelId);
    if (record?.failure) {
      this.records.delete(record.key);
    }
  }

  /** Tears down every reaction; the store is inert until its next call. */
  dispose(): void {
    for (const dispose of this.disposers) {
      dispose();
    }
    this.disposers = [];
    this.stopTicker();
    this.closeStream();
  }

  /** The foreground clock: frozen while backgrounded. */
  private now(): number {
    const wall = Date.now();
    const {backgroundedTotalMs, backgroundedAt} = this.clock;
    return (
      wall -
      backgroundedTotalMs -
      (backgroundedAt === undefined ? 0 : wall - backgroundedAt)
    );
  }

  private inFlight(serverId: string): RouterRecord[] {
    return this.allInFlight.filter(record => record.serverId === serverId);
  }

  private async acquire(
    serverId: string,
    remoteModelId: string,
    signal?: AbortSignal,
  ): Promise<Joined> {
    this.activate();
    let listRead = false;
    for (;;) {
      const step = this.decide(serverId, remoteModelId, signal, listRead);
      listRead = true;
      if (step.kind === 'done') {
        return step.result;
      }
      if (step.kind === 'read') {
        await this.requestRead(serverId);
      } else if ((await step.unload).outcome === 'stopped') {
        return {outcome: 'stopped'};
      }
    }
  }

  /**
   * One synchronous pass: no await between finding the key free and claiming
   * it, so concurrent callers resuming here find the first one's record.
   */
  private decide(
    serverId: string,
    remoteModelId: string,
    signal: AbortSignal | undefined,
    listRead: boolean,
  ):
    | {kind: 'done'; result: Joined | Promise<Joined>}
    | {kind: 'read'}
    | {kind: 'unload'; unload: Promise<Joined>} {
    const server = serverStore.servers.find(s => s.id === serverId);
    if (!server || !profileFor(server.serverType).hasRouter) {
      return {kind: 'done', result: {outcome: 'not-router'}};
    }
    if (!listRead && !serverStore.listReads[serverId]) {
      return {kind: 'read'};
    }
    if (!this.isRouter(serverId)) {
      return {kind: 'done', result: {outcome: 'not-router'}};
    }
    const existing = this.recordFor(serverId, remoteModelId);
    if (existing && this.owns(existing)) {
      return existing.kind === 'load'
        ? {kind: 'done', result: this.join(existing, signal)}
        : {kind: 'unload', unload: this.join(existing, signal)};
    }
    if (existing) {
      this.records.delete(existing.key);
    }
    const row = this.rowState(serverId, remoteModelId);
    if (row === 'loaded' || row === 'sleeping') {
      return {kind: 'done', result: {outcome: 'ready'}};
    }
    const record = this.start('load', server, remoteModelId);
    this.issueLoad(record);
    return {kind: 'done', result: this.join(record, signal)};
  }

  /** The record's outcome, or `stopped` if the caller's signal ends first. */
  private join(record: RouterRecord, signal?: AbortSignal): Promise<Joined> {
    if (record.kind === 'load') {
      record.droppedTurn = false;
    }
    const settled = record.done.then(outcome => ({outcome, record}));
    if (!signal) {
      return settled;
    }
    return new Promise(resolve => {
      const onAbort = () => {
        runInAction(() => {
          if (record.kind === 'load' && this.owns(record)) {
            record.droppedTurn = true;
          }
        });
        resolve({outcome: 'stopped', record});
      };
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, {once: true});
      settled.then(result => {
        signal.removeEventListener('abort', onAbort);
        resolve(result);
      });
    });
  }

  private start(
    kind: RecordKind,
    server: ServerConfig,
    remoteModelId: string,
  ): RouterRecord {
    const record = new RouterRecord(kind, server, remoteModelId, this.now());
    this.records.set(record.key, record);
    this.released.delete(record.key);
    this.streamDropped.delete(server.id);
    return record;
  }

  /**
   * The only exit. A failure is kept on the record so a surface can show it;
   * any other ending removes the record. Aborting last cancels whatever
   * request the record still has out.
   */
  private end(
    record: RouterRecord,
    outcome: RecordOutcome,
    failure?: RouterFailure,
  ): void {
    if (!this.owns(record)) {
      return;
    }
    if (outcome === 'failed' && failure) {
      record.failure = failure;
    } else {
      this.records.delete(record.key);
    }
    if (record.kind === 'unload' && outcome === 'ready') {
      this.released.add(record.key);
    }
    record.settle(outcome);
    record.controller.abort();
  }

  private corroborate(record: RouterRecord): void {
    record.phase = 'active';
    record.lastEvidenceAt = this.now();
    record.verdictRequested = false;
  }

  private askList(record: RouterRecord): void {
    record.verdictRequested = true;
    record.lastEvidenceAt = this.now();
    this.requestRead(record.serverId);
  }

  private async target(record: RouterRecord): Promise<RouterTarget> {
    const apiKey = await serverStore.getApiKey(record.serverId);
    const server = serverStore.servers.find(s => s.id === record.serverId);
    return {url: record.url, apiKey, timeoutMs: server?.requestTimeoutMs};
  }

  private async issueLoad(record: RouterRecord): Promise<void> {
    const target = await this.target(record);
    if (!this.owns(record)) {
      return;
    }
    record.postedAfterSeq = serverStore.readSeq;
    let status: number;
    let body: unknown;
    try {
      ({status, body} = await postLoad(
        target,
        record.remoteModelId,
        record.controller.signal,
      ));
    } catch {
      runInAction(() => this.end(record, 'failed', unreachableFailure()));
      return;
    }
    runInAction(() => {
      if (!this.owns(record) || isSuccess(status)) {
        return;
      }
      record.reason = serverReason(body);
      const row = this.rowState(record.serverId, record.remoteModelId);
      if (row === 'loaded' || row === 'sleeping') {
        this.end(record, 'ready');
      } else if (row !== 'loading' && row !== 'downloading') {
        this.askList(record);
      }
    });
  }

  private async issueUnload(record: RouterRecord): Promise<void> {
    const target = await this.target(record);
    if (!this.owns(record)) {
      return;
    }
    record.postedAfterSeq = serverStore.readSeq;
    await postUnload(
      target,
      record.remoteModelId,
      record.controller.signal,
    ).catch(noop);
    if (this.owns(record)) {
      this.requestRead(record.serverId);
    }
  }

  /**
   * Every read this store asks for: at most one in flight per server, and a
   * request made during one runs once after it.
   */
  private requestRead(serverId: string): Promise<void> {
    const slot = this.reads.get(serverId);
    if (!slot) {
      return this.startRead(serverId);
    }
    if (!slot.next) {
      slot.next = slot.current.then(
        () => this.reads.get(serverId)?.current ?? this.startRead(serverId),
      );
    }
    return slot.next;
  }

  private startRead(serverId: string): Promise<void> {
    const slot: {current: Promise<void>; next?: Promise<void>} = {
      current: Promise.resolve(),
    };
    slot.current = serverStore
      .fetchModelsForServer(serverId)
      .then(noop, noop)
      .then(() => {
        if (this.reads.get(serverId) === slot) {
          this.reads.delete(serverId);
        }
      });
    this.reads.set(serverId, slot);
    return slot.current;
  }

  /** Runs once per successful read that installed a new sequence number. */
  private onRead(serverId: string, seq: number): void {
    const records = this.inFlight(serverId);
    if (!this.isRouter(serverId)) {
      for (const record of records) {
        this.end(record, 'not-router');
      }
      this.prevResident.delete(serverId);
      return;
    }
    this.checkEviction(serverId);
    const rows = serverStore.serverModels.get(serverId) ?? [];
    const now = this.now();
    for (const record of records) {
      record.lastReadOkAt = now;
      if (record.postedAfterSeq >= seq) {
        continue;
      }
      const row = this.rowState(serverId, record.remoteModelId);
      if (record.kind === 'unload') {
        if (unloadReleased(row)) {
          this.end(record, 'ready');
        }
        continue;
      }
      switch (loadVerdict(row, record.phase, record.verdictRequested)) {
        case 'ready':
          this.end(record, 'ready');
          break;
        case 'corroborate':
          this.corroborate(record);
          break;
        case 'failed':
          this.end(
            record,
            'failed',
            loadFailure(
              record.reason,
              record.detail?.exitCode ??
                rowExitCode(rows, record.remoteModelId),
            ),
          );
          break;
      }
    }
    this.prevResident.set(serverId, this.residentIds(serverId));
  }

  private residentIds(serverId: string): Set<string> {
    const ids = (serverStore.serverModels.get(serverId) ?? [])
      .map(row => row.id)
      .filter(id => {
        const state = this.rowState(serverId, id);
        return state === 'loaded' || state === 'sleeping';
      });
    return new Set(ids);
  }

  /**
   * A model resident at the last read and gone now, with no unload of ours
   * in flight, was evicted. Runs before the verdicts of the same read, so an
   * unload of ours is still in flight when its model goes.
   */
  private checkEviction(serverId: string): void {
    for (const id of this.prevResident.get(serverId) ?? []) {
      const state = this.rowState(serverId, id);
      const record = this.recordFor(serverId, id);
      const ownUnload = record?.kind === 'unload' && this.owns(record);
      if ((state === 'unloaded' || state === 'absent') && !ownUnload) {
        this.observedEviction.add(serverId);
        return;
      }
    }
  }

  /** A server removed, repointed or retyped: what this store held for it goes. */
  private onServerChanged(serverId: string): void {
    for (const record of Array.from<RouterRecord>(this.records.values())) {
      if (record.serverId !== serverId) {
        continue;
      }
      if (this.owns(record)) {
        this.end(record, 'withdrawn');
      } else {
        this.records.delete(record.key);
      }
    }
    this.seenSeq.delete(serverId);
    this.prevResident.delete(serverId);
    this.observedEviction.delete(serverId);
    for (const key of Array.from(this.released)) {
      if (key.startsWith(`${serverId}/`)) {
        this.released.delete(key);
      }
    }
    delete this.streamCap[serverId];
    this.streamDropped.delete(serverId);
    this.lastPollAt.delete(serverId);
    if (this.stream?.serverId === serverId) {
      this.closeStream();
    }
  }

  private followStream(serverId: string | null): void {
    if (this.stream?.serverId === serverId) {
      return;
    }
    this.closeStream();
    if (serverId) {
      this.openStream(serverId);
    }
  }

  private closeStream(): void {
    const handle = this.streamHandle;
    this.streamToken++;
    this.streamHandle = null;
    this.stream = null;
    handle?.close();
  }

  private async openStream(serverId: string): Promise<void> {
    const server = serverStore.servers.find(s => s.id === serverId);
    if (!server) {
      return;
    }
    const token = ++this.streamToken;
    const current = () => token === this.streamToken;
    this.stream = {serverId, state: 'connecting'};
    const apiKey = await serverStore.getApiKey(serverId);
    if (!current()) {
      return;
    }
    const handle = openRouterEvents(
      {url: server.url, apiKey, timeoutMs: server.requestTimeoutMs},
      {
        onOpen: () =>
          runInAction(() => {
            if (current()) {
              this.streamCap[serverId] = 'present';
              this.stream = {serverId, state: 'open'};
            }
          }),
        onEvent: payload => {
          if (current()) {
            this.applyEvent(serverId, payload);
          }
        },
        onEnd: status =>
          runInAction(() => {
            if (!current()) {
              return;
            }
            this.streamToken++;
            this.streamHandle = null;
            this.stream = null;
            if (status === 404) {
              this.streamCap[serverId] = 'absent';
            }
            this.streamDropped.add(serverId);
          }),
      },
    );
    if (current()) {
      this.streamHandle = handle;
    }
  }

  /**
   * The only writer of a record's detail. An event corroborates or asks for
   * a read; it never ends a record.
   */
  private applyEvent(serverId: string, payload: object): void {
    const effect = reduceRouterEvent(payload);
    if (effect.kind === 'ignore') {
      return;
    }
    if (effect.kind === 'read') {
      this.requestRead(serverId);
      return;
    }
    const record = this.recordFor(serverId, effect.model);
    const inFlight = record !== undefined && this.owns(record);
    if (inFlight) {
      record.lastEventAt = this.now();
    }
    if (
      !inFlight &&
      effect.status === 'unloaded' &&
      (effect.exitCode === undefined || effect.exitCode === 0) &&
      !this.released.delete(`${serverId}/${effect.model}`)
    ) {
      this.observedEviction.add(serverId);
    }
    if (record?.kind === 'load' && inFlight) {
      if (effect.status === 'loading') {
        this.corroborate(record);
      }
      if (effect.progress || effect.exitCode !== undefined) {
        record.detail = {
          ...record.detail,
          ...(effect.progress && {progress: effect.progress}),
          ...(effect.exitCode !== undefined && {exitCode: effect.exitCode}),
        };
      }
    }
    if (effect.status !== undefined && effect.status !== 'loading') {
      this.requestRead(serverId);
    }
  }

  private startTicker(): void {
    if (!this.ticker) {
      this.ticker = setInterval(() => this.tick(), ROUTER_TICK_MS);
    }
  }

  private stopTicker(): void {
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }

  private tick(): void {
    this.runPolls();
    this.runBounds();
  }

  /** A watchdog only asks the list; the list answers. */
  private runBounds(): void {
    const now = this.now();
    for (const record of this.allInFlight) {
      const heardAt = Math.max(
        record.startedAt,
        record.lastReadOkAt ?? 0,
        record.lastEventAt ?? 0,
      );
      if (now - heardAt >= ROUTER_UNREACHABLE_MS) {
        this.end(record, 'failed', unreachableFailure());
      } else if (record.kind === 'load') {
        this.boundLoad(record, now);
      } else if (now - record.startedAt >= ROUTER_UNLOAD_SETTLE_MS) {
        this.settleUnload(record);
      }
    }
  }

  private boundLoad(record: RouterRecord, now: number): void {
    if (now - record.startedAt >= ROUTER_LOAD_MAX_MS) {
      this.end(
        record,
        'failed',
        loadMaxFailure(
          this.postRequestRow(record),
          record.reason,
          record.detail?.exitCode,
        ),
      );
      return;
    }
    const window =
      record.phase === 'requested' ? ROUTER_ACK_MS : ROUTER_EVIDENCE_MS;
    if (now - record.lastEvidenceAt >= window) {
      this.askList(record);
    }
  }

  private settleUnload(record: RouterRecord): void {
    const row = this.postRequestRow(record);
    if (row === undefined) {
      if (!this.reads.has(record.serverId)) {
        this.requestRead(record.serverId);
      }
      return;
    }
    if (unloadReleased(row)) {
      this.end(record, 'ready');
    } else {
      this.end(record, 'failed', unloadSettleFailure(row));
    }
  }

  /** The row as of the latest read, if that read started after the request. */
  private postRequestRow(record: RouterRecord): ListRowState | undefined {
    const read = serverStore.listReads[record.serverId];
    return read && read.seq > record.postedAfterSeq
      ? this.rowState(record.serverId, record.remoteModelId)
      : undefined;
  }

  /**
   * Backgrounded, the clock freezes and the ticker and stream stop; records
   * and their waiters stay. Back in the foreground, every server with work in
   * flight is read before the stream may reopen.
   */
  private onAppActive(active: boolean): void {
    const wall = Date.now();
    if (!active) {
      this.clock.backgroundedAt ??= wall;
      this.foreground = false;
      return;
    }
    if (this.clock.backgroundedAt !== undefined) {
      this.clock.backgroundedTotalMs += wall - this.clock.backgroundedAt;
      this.clock.backgroundedAt = undefined;
    }
    this.streamDropped.clear();
    const servers = new Set(this.allInFlight.map(record => record.serverId));
    this.foregroundReadsPending = servers.size;
    this.foreground = true;
    for (const serverId of servers) {
      this.requestRead(serverId).finally(() =>
        runInAction(() => {
          this.foregroundReadsPending--;
        }),
      );
    }
  }

  /** Servers with work in flight and no open stream are read on a timer. */
  private runPolls(): void {
    const now = this.now();
    const servers = new Set(this.allInFlight.map(record => record.serverId));
    for (const serverId of servers) {
      if (this.stream?.serverId === serverId && this.stream.state === 'open') {
        this.lastPollAt.delete(serverId);
        continue;
      }
      const last = this.lastPollAt.get(serverId);
      if (last === undefined) {
        this.lastPollAt.set(serverId, now);
      } else if (now - last >= ROUTER_POLL_MS) {
        this.lastPollAt.set(serverId, now);
        this.requestRead(serverId);
      }
    }
  }

  private activate(): void {
    if (this.disposers.length > 0) {
      return;
    }
    for (const [serverId, read] of Object.entries(serverStore.listReads)) {
      this.seenSeq.set(serverId, read.seq);
      this.prevResident.set(serverId, this.residentIds(serverId));
    }
    if (!serverStore.appActive) {
      this.onAppActive(false);
    }
    this.disposers.push(
      reaction(
        () => serverStore.appActive,
        active => this.onAppActive(active),
      ),
      reaction(
        () =>
          Object.entries(serverStore.listReads).map(
            ([serverId, read]) => [serverId, read.seq] as const,
          ),
        reads => {
          for (const [serverId, seq] of reads) {
            if (this.seenSeq.get(serverId) !== seq) {
              this.seenSeq.set(serverId, seq);
              this.onRead(serverId, seq);
            }
          }
        },
        {equals: comparer.structural},
      ),
      reaction(
        () =>
          serverStore.servers.map(
            ({id, url, serverType}) => [id, url, serverType] as const,
          ),
        (servers, previous) => {
          const now = new Map(servers.map(([id, ...rest]) => [id, rest]));
          for (const [id, ...before] of previous) {
            const after = now.get(id);
            if (!after || !comparer.structural(after, before)) {
              this.onServerChanged(id);
            }
          }
        },
        {equals: comparer.structural},
      ),
      reaction(
        () => this.desiredStreamServer,
        serverId => this.followStream(serverId),
        {fireImmediately: true},
      ),
      reaction(
        () => this.foreground && this.hasInFlight,
        run => (run ? this.startTicker() : this.stopTicker()),
        {fireImmediately: true},
      ),
    );
  }
}

export const routerStore = new RouterStore();
