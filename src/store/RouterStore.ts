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
import {postLoad, postUnload} from '../api/llamaServer/router';
import type {RouterTarget} from '../api/llamaServer/router';
import {
  hasRouterStatus,
  rowExitCode,
  rowStateFromList,
  serverReason,
} from '../api/llamaServer/routerWire';
import type {ListRowState, LoadProgress} from '../api/llamaServer/routerWire';
import {
  loadFailure,
  loadVerdict,
  unloadReleased,
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

  private reads = new Map<
    string,
    {current: Promise<void>; next?: Promise<void>}
  >();
  private seenSeq = new Map<string, number>();
  private disposers: IReactionDisposer[] = [];

  constructor() {
    makeAutoObservable<this, 'reads' | 'seenSeq' | 'disposers'>(this, {
      records: false,
      reads: false,
      seenSeq: false,
      disposers: false,
    });
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
  }

  private now(): number {
    return Date.now();
  }

  private inFlight(serverId: string): RouterRecord[] {
    return Array.from<RouterRecord>(this.records.values()).filter(
      record => record.serverId === serverId && this.owns(record),
    );
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
      return;
    }
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
  }

  private activate(): void {
    if (this.disposers.length > 0) {
      return;
    }
    for (const [serverId, read] of Object.entries(serverStore.listReads)) {
      this.seenSeq.set(serverId, read.seq);
    }
    this.disposers.push(
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
    );
  }
}

export const routerStore = new RouterStore();
