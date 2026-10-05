import {mapRowStatus} from '../../api/llamaServer/routerWire';
import type {ListRowState, RowState} from '../../api/llamaServer/routerWire';
import {
  loadFailure,
  loadMaxFailure,
  loadVerdict,
  unloadReleased,
  unloadSettleFailure,
} from '../routerVerdicts';

/** Every row goes through the mapper, the only producer of a list state. */
const listed = (state: RowState): ListRowState => {
  if (state === 'absent') {
    return mapRowStatus(undefined);
  }
  if (state === 'failed') {
    return mapRowStatus({status: {value: 'unloaded', failed: true}});
  }
  if (state === 'unknown') {
    return mapRowStatus({status: {}});
  }
  return mapRowStatus({status: {value: state}});
};

describe('loadVerdict', () => {
  it.each<[RowState, string, string, string]>([
    ['loaded', 'ready', 'ready', 'ready'],
    ['sleeping', 'ready', 'ready', 'ready'],
    ['loading', 'corroborate', 'corroborate', 'corroborate'],
    ['downloading', 'corroborate', 'corroborate', 'corroborate'],
    ['unloaded', 'stay', 'failed', 'failed'],
    ['failed', 'stay', 'failed', 'failed'],
    ['absent', 'stay', 'failed', 'failed'],
    ['unknown', 'stay', 'stay', 'stay'],
  ])(
    'reads a %s row: requested %s, asked %s, active %s',
    (row, requested, asked, active) => {
      expect(loadVerdict(listed(row), 'requested', false)).toBe(requested);
      expect(loadVerdict(listed(row), 'requested', true)).toBe(asked);
      expect(loadVerdict(listed(row), 'active', false)).toBe(active);
    },
  );
});

describe('unloadReleased', () => {
  it.each<[RowState, boolean]>([
    ['unloaded', true],
    ['failed', true],
    ['absent', true],
    ['loaded', false],
    ['sleeping', false],
    ['loading', false],
    ['downloading', false],
    ['unknown', false],
  ])('reads a %s row as released: %p', (row, expected) => {
    expect(unloadReleased(listed(row))).toBe(expected);
  });
});

describe('unloadSettleFailure', () => {
  it.each<[RowState, string | undefined]>([
    ['loaded', 'unload-not-released'],
    ['sleeping', 'unload-not-released'],
    ['loading', 'unload-not-released'],
    ['downloading', 'unload-not-released'],
    ['unknown', undefined],
    ['unloaded', undefined],
    ['failed', undefined],
    ['absent', undefined],
  ])('reads a %s row at the settle bound as %p', (row, cause) => {
    expect(unloadSettleFailure(listed(row))?.cause).toBe(cause);
  });
});

describe('load failure message', () => {
  it('prefers the server reason over the exit code', () => {
    expect(loadFailure('model file is corrupt', 1)).toEqual({
      cause: 'load-failed',
      message: 'model file is corrupt',
    });
  });

  it('composes the exit code when the server gave no reason', () => {
    expect(loadFailure(undefined, 1)).toEqual({
      cause: 'load-failed',
      message: 'exit code 1',
    });
  });

  it('keeps an exit code of 0', () => {
    expect(loadFailure(undefined, 0).message).toBe('exit code 0');
  });

  it('carries no message when there is nothing to say', () => {
    expect(loadFailure()).toEqual({cause: 'load-failed'});
  });
});

describe('loadMaxFailure', () => {
  it.each<[RowState | undefined, string]>([
    ['unloaded', 'load-failed'],
    ['failed', 'load-failed'],
    ['absent', 'load-failed'],
    ['loading', 'wait-stopped'],
    ['loaded', 'wait-stopped'],
    ['unknown', 'wait-stopped'],
    [undefined, 'wait-stopped'],
  ])('reads a %p row at the bound as %s', (row, cause) => {
    expect(
      loadMaxFailure(row === undefined ? undefined : listed(row)).cause,
    ).toBe(cause);
  });

  it('keeps the reason when the row decided', () => {
    expect(loadMaxFailure(listed('unloaded'), 'oom')).toEqual({
      cause: 'load-failed',
      message: 'oom',
    });
  });
});
