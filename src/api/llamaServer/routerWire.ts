/**
 * Pure reading of the llama-server router wire: list rows, `/models/sse`
 * payloads and error bodies. Nothing here decides an outcome; an event says a
 * model's situation may have changed, and only a later list read says what it
 * is.
 */

export type RouterStatus =
  | 'unloaded'
  | 'loading'
  | 'loaded'
  | 'sleeping'
  | 'downloading';

/**
 * `absent`: no row for the model. `failed`: the row says so. `unknown`: the
 * row's state is unreadable, or the list it came from is stale; it renders as
 * no claim at all, never as a guess.
 */
export type RowState = RouterStatus | 'failed' | 'absent' | 'unknown';

declare const fromList: unique symbol;

/**
 * A row state read off a models list. Verdicts take only this, so a state
 * assembled from anything else (an event, a guess) cannot reach one.
 */
export type ListRowState = RowState & {readonly [fromList]: true};

export interface LoadProgress {
  stages?: string[];
  current?: string;
  value?: number;
}

/** The fields of a `/v1/models` row this module reads. */
export interface RouterListRow {
  id?: string;
  model?: string;
  status?: {value?: unknown; failed?: unknown; exit_code?: unknown};
}

const ROUTER_STATUSES: readonly string[] = [
  'unloaded',
  'loading',
  'loaded',
  'sleeping',
  'downloading',
];

function asStatus(value: unknown): RouterStatus | undefined {
  return typeof value === 'string' && ROUTER_STATUSES.includes(value)
    ? (value as RouterStatus)
    : undefined;
}

function listState(state: RowState): ListRowState {
  return state as ListRowState;
}

/** Total: every row, and the absence of one, maps to a member. */
export function mapRowStatus(row: RouterListRow | undefined): ListRowState {
  if (!row) {
    return listState('absent');
  }
  if (row.status?.failed === true) {
    return listState('failed');
  }
  return listState(asStatus(row.status?.value) ?? 'unknown');
}

/** Upstream matches a row to a model by either key; so does this. */
export function rowMatchesKey(row: RouterListRow, id: string): boolean {
  return row.id === id || row.model === id;
}

/**
 * The one reading of a server's list for one model. A stale list still holds
 * the row (so the model is not `absent`), but nothing has corroborated its
 * state since, so the state reads `unknown`.
 */
export function rowStateFromList(
  rows: readonly RouterListRow[],
  remoteModelId: string,
  stale: boolean,
): ListRowState {
  const row = rows.find(candidate => rowMatchesKey(candidate, remoteModelId));
  return mapRowStatus(row && stale ? {id: row.id} : row);
}

/** A row carries router evidence when its `status` is an object. */
export function hasRouterStatus(row: unknown): boolean {
  const status = (row as RouterListRow | null | undefined)?.status;
  return typeof status === 'object' && status !== null;
}

/** The exit code a failed row carries, presence-checked. */
export function rowExitCode(
  rows: readonly RouterListRow[],
  remoteModelId: string,
): number | undefined {
  const code = rows.find(row => rowMatchesKey(row, remoteModelId))?.status
    ?.exit_code;
  return typeof code === 'number' ? code : undefined;
}

export type RouterEventEffect =
  | {kind: 'ignore'}
  /** Something server-wide changed; ask the list. */
  | {kind: 'read'}
  | {
      kind: 'update';
      model: string;
      status?: RowState;
      progress?: LoadProgress;
      exitCode?: number;
    };

function readLoadProgress(raw: unknown): LoadProgress | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const source = raw as Record<string, unknown>;
  const progress: LoadProgress = {};
  if (Array.isArray(source.stages)) {
    progress.stages = source.stages.filter(
      (stage): stage is string => typeof stage === 'string',
    );
  }
  if (typeof source.current === 'string') {
    progress.current = source.current;
  }
  // 0.0 is the first tick of a real load, so presence is what is tested.
  if (typeof source.value === 'number' && Number.isFinite(source.value)) {
    progress.value = source.value;
  }
  return Object.keys(progress).length > 0 ? progress : undefined;
}

/**
 * `model_status` fires once as an acknowledgement and every later transition
 * arrives as `status_change`; both take the same path. Download events are
 * ignored, and an unrecognised or malformed payload settles nothing.
 */
export function reduceRouterEvent(payload: unknown): RouterEventEffect {
  if (!payload || typeof payload !== 'object') {
    return {kind: 'ignore'};
  }
  const {event, model, data} = payload as Record<string, any>;
  if (event === 'models_reload' || event === 'model_remove') {
    return {kind: 'read'};
  }
  if (event !== 'status_change' && event !== 'model_status') {
    return {kind: 'ignore'};
  }
  if (
    typeof model !== 'string' ||
    !model ||
    !data ||
    typeof data !== 'object'
  ) {
    return {kind: 'ignore'};
  }

  const status =
    asStatus(data.status) ??
    (typeof data.status === 'string' ? 'unknown' : undefined);
  const progress = readLoadProgress(data.progress);
  const exitCode =
    typeof data.exit_code === 'number' ? data.exit_code : undefined;
  if (status === undefined && !progress) {
    return {kind: 'ignore'};
  }
  return {
    kind: 'update',
    model,
    ...(status !== undefined && {status}),
    ...(progress && {progress}),
    ...(exitCode !== undefined && {exitCode}),
  };
}

const SERVER_TEXT_MAX = 200;

/**
 * The words a server gave for a refusal, bounded where they enter so that what
 * is held is bounded too. Counted in code points, so a cut never splits a
 * surrogate pair; a code point is at most two UTF-16 units, so twice the cap
 * always holds the cap and the whole body is never walked.
 */
export function serverReason(body: unknown): string | undefined {
  const source = body as Record<string, any> | null | undefined;
  const candidates = [source?.error?.message, source?.error, source?.message];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue;
    }
    const text = candidate
      .slice(0, SERVER_TEXT_MAX * 4)
      .replace(/\s+/g, ' ')
      .trim();
    if (text) {
      return Array.from(text).slice(0, SERVER_TEXT_MAX).join('');
    }
  }
  return undefined;
}
