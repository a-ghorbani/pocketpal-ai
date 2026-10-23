import {fakePlusFeatures, fakePlusRows} from '../../../../jest/fixtures/plus';
import {PLUS_FEATURES} from '../catalog';
import {
  RAM_MARKETING_FACTOR,
  anyRunnable,
  featureRows,
  shippedFeatures,
} from '../features';

const NONE: ReadonlySet<string> = new Set();
const GB8 = 8e9;

describe('Plus feature status', () => {
  it('shows hands-free voice ready and the API server coming soon', () => {
    const rows = featureRows(PLUS_FEATURES, GB8, NONE);
    expect(rows).toEqual([
      {id: 'handsFreeVoice', status: 'ready'},
      {id: 'localApiServer', status: 'soon'},
    ]);
    expect(anyRunnable(rows)).toBe(true);
    expect(shippedFeatures(PLUS_FEATURES, NONE).map(f => f.id)).toEqual([
      'handsFreeVoice',
    ]);
  });

  it('marks the overridden feature shipped', () => {
    const override = new Set(['localApiServer']);
    const rows = featureRows(PLUS_FEATURES, GB8, override);
    expect(rows).toEqual([
      {id: 'handsFreeVoice', status: 'ready'},
      {id: 'localApiServer', status: 'ready'},
    ]);
  });

  it('marks a shipped feature below its device gate as opt-in, still runnable', () => {
    const rows = featureRows(
      PLUS_FEATURES,
      GB8,
      NONE,
      new Map([['handsFreeVoice', 'belowGate']]),
    );
    expect(rows).toEqual([
      {id: 'handsFreeVoice', status: 'optIn', reason: 'belowGate'},
      {id: 'localApiServer', status: 'soon'},
    ]);
    expect(anyRunnable(rows)).toBe(true);
  });

  it('keeps an unshipped or RAM-short feature as it was below the gate', () => {
    const table = fakePlusFeatures([
      {id: 'later', shipped: false},
      {id: 'big', shipped: true, minRamGb: 16},
    ]);
    const optIn = new Map([
      ['later', 'belowGate'],
      ['big', 'belowGate'],
    ] as const);
    expect(featureRows(table, GB8, NONE, optIn)).toEqual([
      {id: 'later', status: 'soon'},
      {id: 'big', status: {needsGb: 16}},
    ]);
  });

  it('uses 0.85 of the marketed size in decimal bytes', () => {
    expect(RAM_MARKETING_FACTOR).toBe(0.85);
    const table = fakePlusFeatures([{id: 'big', shipped: true, minRamGb: 8}]);
    expect(featureRows(table, 6.8e9, NONE)).toEqual([
      {id: 'big', status: 'ready'},
    ]);
    expect(featureRows(table, 6.79e9, NONE)).toEqual([
      {id: 'big', status: {needsGb: 8}},
    ]);
  });

  it('never lets the next marketed size down pass', () => {
    const table = fakePlusFeatures([{id: 'big', shipped: true, minRamGb: 8}]);
    const sixGbPhone = 6 * 1024 ** 3;
    expect(featureRows(table, sixGbPhone, NONE)[0].status).toEqual({
      needsGb: 8,
    });
  });

  it('treats a feature without a RAM gate as ready on any device', () => {
    const table = fakePlusFeatures([{id: 'any', shipped: true}]);
    expect(featureRows(table, 1, NONE)).toEqual([{id: 'any', status: 'ready'}]);
    expect(featureRows(table, null, NONE)).toEqual([
      {id: 'any', status: 'ready'},
    ]);
  });

  it('shows an unshipped feature as coming soon whatever the RAM', () => {
    const table = fakePlusFeatures([
      {id: 'later', shipped: false, minRamGb: 4},
    ]);
    expect(featureRows(table, 1, NONE)).toEqual([
      {id: 'later', status: 'soon'},
    ]);
    expect(featureRows(table, 64e9, NONE)).toEqual([
      {id: 'later', status: 'soon'},
    ]);
  });

  it('withholds RAM-gated rows until the RAM read resolves', () => {
    const table = fakePlusFeatures([
      {id: 'gated', shipped: true, minRamGb: 8},
      {id: 'open', shipped: true},
      {id: 'later', shipped: false, minRamGb: 8},
    ]);
    expect(featureRows(table, null, NONE)).toEqual([
      {id: 'open', status: 'ready'},
      {id: 'later', status: 'soon'},
    ]);
  });

  it('is runnable only when a row is ready', () => {
    expect(anyRunnable(fakePlusRows([{id: 'a', status: {needsGb: 8}}]))).toBe(
      false,
    );
    expect(
      anyRunnable(
        fakePlusRows([
          {id: 'a', status: {needsGb: 8}},
          {id: 'b', status: 'ready'},
        ]),
      ),
    ).toBe(true);
  });

  it('handles an empty table', () => {
    expect(featureRows([], GB8, NONE)).toEqual([]);
    expect(anyRunnable([])).toBe(false);
    expect(shippedFeatures([], NONE)).toEqual([]);
  });

  it('keeps table order', () => {
    const table = fakePlusFeatures([
      {id: 'c', shipped: true},
      {id: 'a', shipped: false},
      {id: 'b', shipped: true},
    ]);
    expect(featureRows(table, GB8, NONE).map(row => row.id)).toEqual([
      'c',
      'a',
      'b',
    ]);
    expect(shippedFeatures(table, NONE).map(f => f.id)).toEqual(['c', 'b']);
  });
});
