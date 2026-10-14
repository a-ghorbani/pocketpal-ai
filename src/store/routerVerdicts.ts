import type {ListRowState} from '../api/llamaServer/routerWire';

/**
 * Why a router operation ended badly. `server-unreachable` and `wait-stopped`
 * are facts about the request and this app's wait, never about the model.
 * `message` holds bounded server words, or an exit code the app composed.
 */
export interface RouterFailure {
  cause:
    | 'load-failed'
    | 'unload-not-released'
    | 'server-unreachable'
    | 'wait-stopped';
  message?: string;
}

export type RecordKind = 'load' | 'unload';
export type RecordPhase = 'requested' | 'active';

/** What one list read made of a load still in flight. */
export type LoadVerdict = 'ready' | 'corroborate' | 'failed' | 'stay';

/**
 * A row that is down settles a load only once the server has shown it took
 * the request up (`active`), or once a watchdog or a refusal asked the list
 * to decide: until then the server may simply not have started it.
 */
export function loadVerdict(
  row: ListRowState,
  phase: RecordPhase,
  verdictRequested: boolean,
): LoadVerdict {
  switch (row as string) {
    case 'loaded':
    case 'sleeping':
      return 'ready';
    case 'loading':
    case 'downloading':
      return 'corroborate';
    case 'unloaded':
    case 'failed':
    case 'absent':
      return phase === 'active' || verdictRequested ? 'failed' : 'stay';
    default:
      return 'stay';
  }
}

/** An unload reads the opposite way round from a load. */
export function unloadReleased(row: ListRowState): boolean {
  return row === 'unloaded' || row === 'failed' || row === 'absent';
}

/** The server's own reason wins over an exit code the app composes. */
export function loadFailure(reason?: string, exitCode?: number): RouterFailure {
  const message =
    reason ?? (exitCode !== undefined ? `exit code ${exitCode}` : undefined);
  return message === undefined
    ? {cause: 'load-failed'}
    : {cause: 'load-failed', message};
}

/**
 * The load ran out of time. Where a post-request read shows the model down,
 * the row is what gets reported; otherwise it is only this app's wait that
 * ended.
 */
export function loadMaxFailure(
  row: ListRowState | undefined,
  reason?: string,
  exitCode?: number,
): RouterFailure {
  return row !== undefined && unloadReleased(row)
    ? loadFailure(reason, exitCode)
    : {cause: 'wait-stopped'};
}

/**
 * The unload settle bound, judged against a post-request read: the model still
 * held is a failure to release; an unreadable row is no claim either way.
 */
export function unloadSettleFailure(
  row: ListRowState,
): RouterFailure | undefined {
  if (row === 'unknown' || unloadReleased(row)) {
    return undefined;
  }
  return {cause: 'unload-not-released'};
}

export const unreachableFailure = (): RouterFailure => ({
  cause: 'server-unreachable',
});
