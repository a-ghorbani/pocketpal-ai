import {
  applyLivePatch,
  downloadVerdict,
  loadVerdict,
  mapRowStatus,
  reduceRouterEvent,
  rowMatchesKey,
  unloadVerdict,
  RouterEventEffect,
  RouterListState,
  RouterRowState,
} from '../routerState';
import {routerWireEvents} from '../../../jest/fixtures/routerWire';
import {routerModelsBody} from '../../../jest/fixtures/remoteModelList';

const loadStream = routerWireEvents('sse-load-sequence.txt');
const downloadStream = routerWireEvents('sse-download-sequence.txt');

const forModel = (events: any[], model: string) =>
  events.filter(e => e.model === model);

/**
 * A verdict takes a state a reconciled list reported, and the mapper is the
 * only thing that produces one — so the rows below go through it rather than
 * asserting the type onto a bare member.
 */
const listed = (state: RouterRowState): RouterListState => {
  if (state === 'absent') {
    return mapRowStatus(undefined);
  }
  if (state === 'failed') {
    return mapRowStatus({status: {failed: true}});
  }
  return mapRowStatus({status: {value: state}});
};

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

describe('verdicts', () => {
  it.each<[RouterRowState, string]>([
    ['loaded', 'ready'],
    ['sleeping', 'ready'],
    ['loading', 'in-flight'],
    ['downloading', 'in-flight'],
    ['unloaded', 'failed'],
    ['failed', 'failed'],
    ['absent', 'failed'],
    ['unknown', 'failed'],
  ])('a load at a %s row is %s', (state, expected) => {
    expect(loadVerdict(listed(state))).toBe(expected);
  });

  it.each<[RouterRowState, string]>([
    ['unloaded', 'released'],
    ['absent', 'released'],
    ['failed', 'released'],
    ['loaded', 'not-converged'],
    ['loading', 'not-converged'],
    ['sleeping', 'not-converged'],
    ['downloading', 'not-converged'],
    ['unknown', 'not-converged'],
  ])('an unload at a %s row is %s', (state, expected) => {
    expect(unloadVerdict(listed(state))).toBe(expected);
  });

  it('reads an unload the opposite way round from a load', () => {
    expect(loadVerdict(listed('loaded'))).toBe('ready');
    expect(unloadVerdict(listed('loaded'))).toBe('not-converged');
  });

  const evidence = (over: Partial<Parameters<typeof downloadVerdict>[0]>) => ({
    rowState: listed('absent'),
    freshCorroboration: false,
    attemptEnded: false,
    graceElapsed: false,
    ceilingElapsed: false,
    ...over,
  });

  it('settles a download on the row, not on the attempt ending', () => {
    expect(downloadVerdict(evidence({rowState: listed('unloaded')}))).toBe(
      'arrived',
    );
    expect(
      downloadVerdict(
        evidence({attemptEnded: true, rowState: listed('unloaded')}),
      ),
    ).toBe('arrived');
  });

  it('holds a download open while its ceiling is unspent', () => {
    expect(downloadVerdict(evidence({}))).toBe('unresolved');
    expect(downloadVerdict(evidence({rowState: listed('downloading')}))).toBe(
      'downloading',
    );
    expect(downloadVerdict(evidence({freshCorroboration: true}))).toBe(
      'unresolved',
    );
  });

  it('fails a download only once nothing arrived', () => {
    expect(
      downloadVerdict(evidence({attemptEnded: true, graceElapsed: true})),
    ).toBe('never-arrived');
    expect(downloadVerdict(evidence({attemptEnded: true}))).toBe('unresolved');
    expect(downloadVerdict(evidence({ceilingElapsed: true}))).toBe(
      'never-arrived',
    );
  });

  it('does not fail an uncorroborated download at the grace window alone', () => {
    expect(downloadVerdict(evidence({graceElapsed: true}))).toBe('unresolved');
  });
});

describe('reduceRouterEvent over the captured load stream', () => {
  const alpha = forModel(loadStream, 'alpha');
  const corrupt = forModel(loadStream, 'corrupt');

  it('takes both event names down one path', () => {
    const names = new Set(loadStream.map(e => e.event));
    expect(names).toContain('model_status');
    expect(names).toContain('status_change');

    const ack = reduceRouterEvent(alpha[0]);
    const transition = reduceRouterEvent(alpha[1]);
    expect(ack).toMatchObject({kind: 'update', patch: {status: 'loading'}});
    expect(transition).toMatchObject({
      kind: 'update',
      patch: {status: 'loading'},
    });
  });

  it('keeps a value of 0.0 as a determinate zero', () => {
    const first = reduceRouterEvent(alpha[1]) as Extract<
      RouterEventEffect,
      {kind: 'update'}
    >;
    expect(first.patch.progress).toEqual({
      stages: ['text_model'],
      current: 'text_model',
      value: 0,
    });
    expect(typeof first.patch.progress?.value).toBe('number');
    expect('value' in first.patch.progress!).toBe(true);
  });

  it('does not prompt a reconcile while the load is still running', () => {
    expect(reduceRouterEvent(alpha[1])).toMatchObject({reconcile: false});
    expect(reduceRouterEvent(alpha[3])).toMatchObject({reconcile: false});
  });

  it('prompts a reconcile at loaded, sleeping and unloaded', () => {
    for (const event of alpha.slice(4)) {
      expect(reduceRouterEvent(event)).toMatchObject({reconcile: true});
    }
  });

  // exit_code 0 rides a clean unload. A guard testing only that the field is
  // there would read that as a failure, and it is the ordinary path.
  it('attaches exit_code 0 from a clean unload without making it a reason', () => {
    const cleanUnload = alpha[alpha.length - 1];
    expect(cleanUnload.data).toEqual({status: 'unloaded', exit_code: 0});

    const effect = reduceRouterEvent(cleanUnload) as Extract<
      RouterEventEffect,
      {kind: 'update'}
    >;
    expect(effect.patch.exitCode).toBe(0);
    expect(effect.patch.status).toBe('unloaded');
  });

  it('attaches exit_code 1 from a failed load', () => {
    const failure = corrupt[corrupt.length - 1];
    const effect = reduceRouterEvent(failure) as Extract<
      RouterEventEffect,
      {kind: 'update'}
    >;
    expect(effect.patch.exitCode).toBe(1);
    expect(effect.patch.status).toBe('unloaded');
  });

  it('never states a verdict — the stream only reports unloaded', () => {
    const states = alpha
      .concat(corrupt)
      .map(e => reduceRouterEvent(e))
      .map(effect => (effect.kind === 'update' ? effect.patch.status : null));
    expect(states).not.toContain('failed');
  });
});

describe('reduceRouterEvent over the captured download stream', () => {
  it('sums the per-URL map found one level below the documented place', () => {
    const first = downloadStream.find(
      e => e.event === 'download_progress',
    ) as any;
    const effect = reduceRouterEvent(first) as Extract<
      RouterEventEffect,
      {kind: 'update'}
    >;

    expect(effect.patch.bytes).toEqual({done: 0, total: 291545600, urls: 1});
    expect(effect.patch.status).toBe('downloading');
  });

  it('keeps done 0 as zero transferred, not as no byte detail', () => {
    const first = downloadStream.find(
      e => e.event === 'download_progress',
    ) as any;
    expect(
      Object.values(first.data.progress as Record<string, any>)[0],
    ).toEqual({
      done: 0,
      total: 291545600,
    });

    const effect = reduceRouterEvent(first) as Extract<
      RouterEventEffect,
      {kind: 'update'}
    >;
    expect(effect.patch.bytes).toBeDefined();
    expect(effect.patch.bytes!.done).toBe(0);
  });

  // Constructed: every captured tick carries exactly one URL, so a map with
  // two entries has never been observed. It is covered anyway because reading
  // only the first entry satisfies every measured case above, and a two-file
  // download would then report a fraction of the bytes as if it were all of
  // them.
  it('sums a two-entry map rather than reading one of its entries', () => {
    const measured = downloadStream.find(
      e => e.event === 'download_progress',
    ) as any;
    const [url, only] = Object.entries(
      measured.data.progress as Record<string, any>,
    )[0];

    const effect = reduceRouterEvent({
      ...measured,
      data: {
        progress: {
          [url]: only,
          [url + '.mmproj']: {done: 5, total: 11},
        },
      },
    }) as Extract<RouterEventEffect, {kind: 'update'}>;

    expect(effect.patch.bytes).toEqual({
      done: only.done + 5,
      total: only.total + 11,
      urls: 2,
    });
  });

  it('ignores a progress payload whose map is at the documented place', () => {
    expect(
      reduceRouterEvent({
        model: 'x',
        event: 'download_progress',
        data: {'https://example/x.gguf': {done: 1, total: 2}},
      }),
    ).toEqual({kind: 'ignore'});
  });

  // Both terminal names fired for outcomes opposite to their plain reading:
  // download_finished for a repository that does not exist, download_failed
  // on cancel. Neither may carry a verdict.
  it.each(['download_finished', 'download_failed'])(
    'treats %s as a prompt to reconcile and nothing more',
    name => {
      const event = downloadStream.find(e => e.event === name)!;
      expect(reduceRouterEvent(event)).toEqual({
        kind: 'update',
        model: event.model,
        about: 'download',
        patch: {},
        reconcile: true,
        attemptEnded: true,
      });
    },
  );

  it('cannot tell the successful download from the failed one by its event', () => {
    const finished = downloadStream.filter(
      e => e.event === 'download_finished',
    );
    expect(finished).toHaveLength(2);
    expect(finished[0].model).not.toBe(finished[1].model);

    const withoutIdentity = (event: any) => {
      const effect = reduceRouterEvent(event) as any;
      return {...effect, model: undefined};
    };
    expect(withoutIdentity(finished[0])).toEqual(withoutIdentity(finished[1]));
  });

  it('drops every belief about the server on models_reload', () => {
    const reload = downloadStream.find(e => e.event === 'models_reload')!;
    expect(reload.model).toBe('*');
    expect(reduceRouterEvent(reload)).toEqual({kind: 'drop-server'});
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

  it('drops one model on model_remove', () => {
    expect(reduceRouterEvent({model: 'alpha', event: 'model_remove'})).toEqual({
      kind: 'drop-model',
      model: 'alpha',
    });
  });

  it('renders no state claim for a status it has not seen', () => {
    expect(
      reduceRouterEvent({
        model: 'a',
        event: 'status_change',
        data: {status: 'quiescing'},
      }),
    ).toMatchObject({patch: {status: 'unknown'}, reconcile: true});
  });
});

describe('applyLivePatch', () => {
  it('keeps fields an event did not mention and restamps recency', () => {
    const first = applyLivePatch(
      undefined,
      {status: 'loading', progress: {value: 0}},
      10,
    );
    const second = applyLivePatch(
      first,
      {bytes: {done: 1, total: 2, urls: 1}},
      20,
    );

    expect(second).toEqual({
      status: 'loading',
      progress: {value: 0},
      bytes: {done: 1, total: 2, urls: 1},
      at: 20,
    });
  });
});
