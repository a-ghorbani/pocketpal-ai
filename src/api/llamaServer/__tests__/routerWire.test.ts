import {
  hasRouterStatus,
  mapRowStatus,
  reduceRouterEvent,
  rowExitCode,
  rowMatchesKey,
  rowStateFromList,
  serverReason,
  RouterEventEffect,
} from '../routerWire';
import {
  routerWireEvents,
  routerWireJson,
} from '../../../../jest/fixtures/routerWire';
import {
  directTextModelsBody,
  routerModelsBody,
} from '../../../../jest/fixtures/remoteModelList';

type Update = Extract<RouterEventEffect, {kind: 'update'}>;

const loadStream = routerWireEvents('sse-load-sequence.txt');
const downloadStream = routerWireEvents('sse-download-sequence.txt');

const forModel = (events: any[], model: string) =>
  events.filter(e => e.model === model);

describe('mapRowStatus', () => {
  it('reads the captured router rows', () => {
    for (const row of routerModelsBody.data) {
      expect(mapRowStatus(row)).toBe(row.status.value);
    }
  });

  it('has no row map to absent', () => {
    expect(mapRowStatus(undefined)).toBe('absent');
  });

  // Constructed: the captures hold the SSE transition of a failed load, not a
  // list row taken after one.
  it('reads a failed load off the row, where the wire states it', () => {
    expect(
      mapRowStatus({status: {value: 'unloaded', failed: true, exit_code: 1}}),
    ).toBe('failed');
  });

  it.each([
    ['an unrecognised value', {status: {value: 'hibernating'}}],
    ['a status object with no value', {status: {}}],
    ['no status object', {}],
  ])('maps %s to unknown rather than a default', (_label, row) => {
    expect(mapRowStatus(row)).toBe('unknown');
  });

  it('matches a row by either id key', () => {
    expect(rowMatchesKey({id: 'alpha'}, 'alpha')).toBe(true);
    expect(rowMatchesKey({model: 'alpha'}, 'alpha')).toBe(true);
    expect(rowMatchesKey({id: 'beta'}, 'alpha')).toBe(false);
  });
});

describe('rowStateFromList', () => {
  const rows = routerModelsBody.data as any[];

  it('reads the row the server listed', () => {
    expect(rowStateFromList(rows, 'gemma-4-e2b', false)).toBe('loaded');
  });

  it('drops the state of a row a failed read left behind', () => {
    expect(rowStateFromList(rows, 'gemma-4-e2b', true)).toBe('unknown');
  });

  it('leaves absence alone, which no read refreshed away', () => {
    expect(rowStateFromList(rows, 'never-heard-of-it', true)).toBe('absent');
  });
});

describe('router evidence on a row', () => {
  it('finds a status object on every row of a captured router list', () => {
    for (const body of [
      routerModelsBody,
      routerWireJson('router-v1-models.json'),
    ]) {
      expect(body.data.every(hasRouterStatus)).toBe(true);
    }
  });

  it('finds none on a single-model server row', () => {
    expect(directTextModelsBody.data.some(hasRouterStatus)).toBe(false);
  });

  it('reads an exit code only when it is a number', () => {
    const rows = [
      {id: 'a', status: {value: 'unloaded', failed: true, exit_code: 1}},
      {id: 'b', status: {value: 'unloaded', exit_code: '1'}},
    ];
    expect(rowExitCode(rows, 'a')).toBe(1);
    expect(rowExitCode(rows, 'b')).toBeUndefined();
    expect(rowExitCode(rows, 'c')).toBeUndefined();
  });
});

describe('reduceRouterEvent over the captured load stream', () => {
  const alpha = forModel(loadStream, 'alpha');
  const corrupt = forModel(loadStream, 'corrupt');

  it('takes both event names down one path', () => {
    const names = new Set(loadStream.map(e => e.event));
    expect(names).toContain('model_status');
    expect(names).toContain('status_change');

    const payload = alpha[1];
    expect(
      reduceRouterEvent({...payload, event: 'model_status'}),
    ).toStrictEqual(reduceRouterEvent({...payload, event: 'status_change'}));
    expect(reduceRouterEvent(alpha[0])).toMatchObject({
      kind: 'update',
      model: 'alpha',
      status: 'loading',
    });
  });

  it('keeps a value of 0.0 on the first tick as a determinate zero', () => {
    const first = reduceRouterEvent(alpha[1]) as Update;
    expect(first.progress).toEqual({
      stages: ['text_model'],
      current: 'text_model',
      value: 0,
    });
    expect(first.progress?.value === 0).toBe(true);
  });

  // exit_code 0 rides a clean unload. A guard testing only that the field is
  // there would read that as a failure, and it is the ordinary path.
  it('attaches exit_code 0 from a clean unload', () => {
    const cleanUnload = alpha[alpha.length - 1];
    expect(cleanUnload.data).toEqual({status: 'unloaded', exit_code: 0});

    const effect = reduceRouterEvent(cleanUnload) as Update;
    expect(effect.exitCode).toBe(0);
    expect(effect.status).toBe('unloaded');
  });

  it('attaches exit_code 1 from a failed load', () => {
    const effect = reduceRouterEvent(corrupt[corrupt.length - 1]) as Update;
    expect(effect.exitCode).toBe(1);
    expect(effect.status).toBe('unloaded');
  });

  it('never states failed — the stream only reports unloaded', () => {
    const states = alpha
      .concat(corrupt)
      .map(e => reduceRouterEvent(e))
      .map(effect => (effect.kind === 'update' ? effect.status : null));
    expect(states).not.toContain('failed');
  });
});

describe('reduceRouterEvent over the captured download stream', () => {
  it('ignores every download event', () => {
    const downloadEvents = downloadStream.filter(e =>
      String(e.event).startsWith('download_'),
    );
    expect(downloadEvents.length).toBeGreaterThan(0);
    for (const event of downloadEvents) {
      expect(reduceRouterEvent(event)).toEqual({kind: 'ignore'});
    }
  });

  it('yields no progress from the whole stream', () => {
    for (const event of downloadStream) {
      const effect = reduceRouterEvent(event);
      expect(effect.kind === 'update' && effect.progress).toBeFalsy();
    }
  });

  it('asks for a read on models_reload', () => {
    const reload = downloadStream.find(e => e.event === 'models_reload')!;
    expect(reduceRouterEvent(reload)).toEqual({kind: 'read'});
  });
});

describe('reduceRouterEvent on shapes it does not recognise', () => {
  it.each([
    ['an unknown event name', {model: 'a', event: 'model_teleported'}],
    ['no event field', {model: 'a', data: {status: 'loaded'}}],
    ['no model field', {event: 'status_change', data: {status: 'loaded'}}],
    ['no data', {model: 'a', event: 'status_change'}],
    ['a null payload', null],
    ['a string payload', 'data'],
  ])('ignores %s', (_label, payload) => {
    expect(reduceRouterEvent(payload)).toEqual({kind: 'ignore'});
  });

  it('asks for a read on model_remove', () => {
    expect(reduceRouterEvent({model: 'alpha', event: 'model_remove'})).toEqual({
      kind: 'read',
    });
  });

  it('renders no state claim for a status it has not seen', () => {
    expect(
      reduceRouterEvent({
        model: 'a',
        event: 'status_change',
        data: {status: 'quiescing'},
      }),
    ).toMatchObject({kind: 'update', status: 'unknown'});
  });

  it('ignores a progress value that is not a number', () => {
    const effect = reduceRouterEvent({
      model: 'a',
      event: 'status_change',
      data: {status: 'loading', progress: {value: '0.5'}},
    }) as Update;
    expect(effect.progress).toBeUndefined();
  });
});

describe('serverReason', () => {
  it('reads the message of a captured error body', () => {
    expect(serverReason(routerWireJson('unload-not-running-400.json'))).toBe(
      'model is not running',
    );
  });

  it('falls back to a bare error string, then a top-level message', () => {
    expect(serverReason({error: 'bad model'})).toBe('bad model');
    expect(serverReason({message: 'busy'})).toBe('busy');
  });

  it('collapses whitespace runs and trims', () => {
    expect(serverReason({error: {message: '  failed\n\n  to\tload  '}})).toBe(
      'failed to load',
    );
  });

  it('caps at 200 code points without splitting a surrogate pair', () => {
    const reason = serverReason({error: {message: '😀'.repeat(201)}})!;
    expect(Array.from(reason)).toHaveLength(200);
    expect(reason).toBe('😀'.repeat(200));
  });

  it.each([
    ['a number', {error: {message: 42}}],
    ['an empty string', {error: {message: '   '}}],
    ['no body', undefined],
    ['an object error', {error: {code: 400}}],
  ])('gives nothing for %s', (_label, body) => {
    expect(serverReason(body)).toBeUndefined();
  });
});
