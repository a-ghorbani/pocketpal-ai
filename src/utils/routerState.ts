/**
 * Pure state for `llama-server` router mode: the unions every consumer branches
 * on, the mapping from a list row to one of them, the per-kind verdict rules,
 * and the reducer over the `/models/sse` payloads.
 *
 * Nothing here reads a verdict from an event. An event says a model's situation
 * may have changed; the reconciled row in the model list says what it is.
 */

export type RouterStatus =
  | 'unloaded'
  | 'loading'
  | 'loaded'
  | 'sleeping'
  | 'downloading';

/**
 * `absent`: no row for the model. `failed`: the row says so. `unknown`: the row
 * is there and its state is not one we recognise, which renders no state claim
 * rather than a guess.
 */
export type RouterRowState = RouterStatus | 'absent' | 'failed' | 'unknown';

/** Whether this build has `GET /models/sse`, which shipped later than load and unload. */
export type RouterStreamCap = 'unknown' | 'present' | 'absent';

export interface RouterLoadProgress {
  stages?: string[];
  current?: string;
  value?: number;
}

export interface RouterBytes {
  done: number;
  total: number;
  urls: number;
}

export interface RouterLive {
  status?: RouterRowState;
  progress?: RouterLoadProgress;
  bytes?: RouterBytes;
  exitCode?: number;
  /** When this entry was written, which is how it is ranked against a fetch. */
  at: number;
}

export type RouterOpKind = 'load' | 'unload' | 'download';

/**
 * Why an operation ended badly. The cause carries the copy; `message` carries
 * the server's own words where it gave any, which are not a stable contract
 * and are only ever passed through.
 */
export interface RouterFailure {
  cause: 'load-failed' | 'unload-not-released' | 'download-not-fetched';
  message?: string;
}

export interface RouterOp {
  kind: RouterOpKind;
  phase: 'requested' | 'active';
  serverId: string;
  /** Rekeyed once when a lone download adopts the id its first event carries. */
  key: string;
  startedAt: number;
  /** Which models fetch was the last to begin before this request. */
  requestSeq: number;
  lastEvidenceAt: number;
  /** Set once a terminal download event has arrived for this op. */
  attemptEnded?: boolean;
  /** A watchdog has asked the list; the next reconcile may settle this op. */
  verdictRequested?: boolean;
  reason?: string;
}

const ROUTER_STATUSES: RouterStatus[] = [
  'unloaded',
  'loading',
  'loaded',
  'sleeping',
  'downloading',
];

/** The fields of a `/v1/models` row this module reads. */
export interface RouterListRow {
  id?: string;
  model?: string;
  status?: {
    value?: string;
    failed?: boolean;
    exit_code?: number;
    progress?: Record<string, {done?: number; total?: number}>;
  };
}

function asStatus(value: unknown): RouterStatus | undefined {
  return typeof value === 'string' &&
    (ROUTER_STATUSES as string[]).includes(value)
    ? (value as RouterStatus)
    : undefined;
}

/**
 * Total: every row, and the absence of one, maps to a member. A row whose state
 * is unreadable is `unknown`, never a default to `unloaded`.
 */
export function mapRowStatus(row: RouterListRow | undefined): RouterRowState {
  if (!row) {
    return 'absent';
  }
  if (row.status?.failed === true) {
    return 'failed';
  }
  return asStatus(row.status?.value) ?? 'unknown';
}

/** Upstream matches a row to a model id by either key; so do we. */
export function rowMatchesKey(row: RouterListRow, id: string): boolean {
  return row.id === id || row.model === id;
}

export type RouterLoadVerdict = 'ready' | 'failed' | 'in-flight';

/**
 * A load reads the row. `sleeping` is resident — the process is alive and only
 * the weights are released — so it is ready, not a failure.
 */
export function loadVerdict(state: RouterRowState): RouterLoadVerdict {
  switch (state) {
    case 'loaded':
    case 'sleeping':
      return 'ready';
    case 'loading':
    case 'downloading':
      return 'in-flight';
    default:
      return 'failed';
  }
}

export type RouterUnloadVerdict = 'released' | 'not-converged';

/**
 * An unload reads the end state the user asked for, which is the inverse of a
 * load's: a row still reading `loaded` is the failure being guarded against,
 * and running one through the other's mapping reports it as success.
 */
export function unloadVerdict(state: RouterRowState): RouterUnloadVerdict {
  switch (state) {
    case 'unloaded':
    case 'absent':
    case 'failed':
      return 'released';
    default:
      return 'not-converged';
  }
}

export type RouterDownloadVerdict =
  | 'arrived'
  | 'downloading'
  | 'unresolved'
  | 'never-arrived';

export interface RouterDownloadEvidence {
  rowState: RouterRowState;
  /** A downloading row in this reconcile, or an event since the last arm. */
  freshCorroboration: boolean;
  attemptEnded: boolean;
  graceElapsed: boolean;
  ceilingElapsed: boolean;
}

/**
 * A download reads presence. Absence from the list is not failure while the
 * op's ceiling is unspent: a model being fetched need not be listed until it
 * lands, and on a server with no stream there is nothing else to corroborate it.
 */
export function downloadVerdict(
  evidence: RouterDownloadEvidence,
): RouterDownloadVerdict {
  if (evidence.rowState === 'downloading') {
    return 'downloading';
  }
  if (evidence.rowState !== 'absent') {
    return 'arrived';
  }
  if (evidence.freshCorroboration) {
    return 'unresolved';
  }
  if (evidence.attemptEnded && evidence.graceElapsed) {
    return 'never-arrived';
  }
  if (!evidence.attemptEnded && evidence.ceilingElapsed) {
    return 'never-arrived';
  }
  return 'unresolved';
}

export interface RouterLivePatch {
  status?: RouterRowState;
  progress?: RouterLoadProgress;
  bytes?: RouterBytes;
  exitCode?: number;
}

export type RouterEventEffect =
  | {kind: 'ignore'}
  /** Every belief about this server is stale. */
  | {kind: 'drop-server'}
  | {kind: 'drop-model'; model: string}
  | {
      kind: 'update';
      model: string;
      patch: RouterLivePatch;
      /** The situation may have settled; ask the list, do not read the name. */
      reconcile: boolean;
      /** A terminal download event arrived. It says the attempt stopped, nothing more. */
      attemptEnded: boolean;
    };

function readLoadProgress(raw: any): RouterLoadProgress | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const progress: RouterLoadProgress = {};
  if (Array.isArray(raw.stages)) {
    progress.stages = raw.stages.filter((s: unknown) => typeof s === 'string');
  }
  if (typeof raw.current === 'string') {
    progress.current = raw.current;
  }
  // 0.0 is the first tick of a real load, so presence is what is tested.
  if (typeof raw.value === 'number' && Number.isFinite(raw.value)) {
    progress.value = raw.value;
  }
  return Object.keys(progress).length > 0 ? progress : undefined;
}

/**
 * The per-URL map is nested one level below where the reference prints it.
 * `done` is 0 on the first event of a real download.
 */
function readBytes(raw: any): RouterBytes | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  let done = 0;
  let total = 0;
  let urls = 0;
  for (const entry of Object.values(raw) as any[]) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    if (typeof entry.done !== 'number' || typeof entry.total !== 'number') {
      continue;
    }
    done += entry.done;
    total += entry.total;
    urls += 1;
  }
  return urls > 0 ? {done, total, urls} : undefined;
}

/**
 * A payload whose `event` is unrecognised, or whose shape does not parse, is
 * ignored — it never settles anything.
 */
export function reduceRouterEvent(payload: any): RouterEventEffect {
  if (!payload || typeof payload !== 'object') {
    return {kind: 'ignore'};
  }
  const event = payload.event;
  const model = payload.model;
  if (typeof event !== 'string') {
    return {kind: 'ignore'};
  }
  if (event === 'models_reload') {
    return {kind: 'drop-server'};
  }
  if (typeof model !== 'string' || !model) {
    return {kind: 'ignore'};
  }
  if (event === 'model_remove') {
    return {kind: 'drop-model', model};
  }

  // `model_status` fires once as the opening acknowledgement; every transition
  // after it — progress, completion, sleep, failure — arrives as
  // `status_change`. Handling only the documented name shows a spinner that
  // never moves.
  if (event === 'status_change' || event === 'model_status') {
    const data = payload.data;
    if (!data || typeof data !== 'object') {
      return {kind: 'ignore'};
    }
    const status = asStatus(data.status);
    const patch: RouterLivePatch = {
      status:
        status ?? (typeof data.status === 'string' ? 'unknown' : undefined),
    };
    const progress = readLoadProgress(data.progress);
    if (progress) {
      patch.progress = progress;
    }
    if (typeof data.exit_code === 'number') {
      patch.exitCode = data.exit_code;
    }
    if (patch.status === undefined && !patch.progress) {
      return {kind: 'ignore'};
    }
    return {
      kind: 'update',
      model,
      patch,
      reconcile: status !== 'loading' && status !== 'downloading',
      attemptEnded: false,
    };
  }

  if (event === 'download_progress') {
    const bytes = readBytes(payload.data?.progress);
    if (!bytes) {
      return {kind: 'ignore'};
    }
    return {
      kind: 'update',
      model,
      patch: {status: 'downloading', bytes},
      reconcile: false,
      attemptEnded: false,
    };
  }

  // Neither name is an outcome: `download_finished` fires for downloads that
  // never happened, and `download_failed` was only ever seen on cancel.
  if (event === 'download_finished' || event === 'download_failed') {
    return {
      kind: 'update',
      model,
      patch: {},
      reconcile: true,
      attemptEnded: true,
    };
  }

  return {kind: 'ignore'};
}

/** Merge a patch into an overlay entry, stamping when it was written. */
export function applyLivePatch(
  previous: RouterLive | undefined,
  patch: RouterLivePatch,
  at: number,
): RouterLive {
  return {
    ...previous,
    ...patch,
    at,
  };
}
