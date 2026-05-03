/**
 * Unit tests for the merge logic in `e2e/scripts/merge-bench-reports.ts`.
 *
 * The script lives under `e2e/`, but its `mergeReports` export is pure and
 * safe to import directly from the app's jest setup (same pattern as the
 * `logcat.test.ts` co-location).
 */

import {mergeReports} from '../../e2e/scripts/merge-bench-reports';

function makeRow(
  over: Partial<{
    model_id: string;
    quant: string;
    requested_backend: 'cpu' | 'gpu';
    pp_avg: number | null;
    status: string;
    timestamp: string;
    raw_matches: string[];
  }>,
) {
  return {
    model_id: over.model_id ?? 'qwen3-1.7b',
    quant: over.quant ?? 'q4_0',
    requested_backend: (over.requested_backend ?? 'cpu') as 'cpu' | 'gpu',
    effective_backend: 'unknown',
    pp_avg: over.pp_avg ?? 100,
    tg_avg: 10,
    wall_ms: 1000,
    peak_memory_mb: 100,
    log_signals: {raw_matches: over.raw_matches ?? []},
    init_settings: {},
    status: over.status ?? 'ok',
    timestamp: over.timestamp ?? '2026-04-29T08:00:00Z',
  };
}

describe('mergeReports', () => {
  it('dedupes by (model_id,quant,backend) and keeps the latest run', () => {
    const reports = [
      {runs: [makeRow({pp_avg: 1, timestamp: '2026-04-29T08:00:00Z'})]},
      {runs: [makeRow({pp_avg: 2, timestamp: '2026-04-29T09:00:00Z'})]},
      {runs: [makeRow({pp_avg: 3, timestamp: '2026-04-28T20:00:00Z'})]},
    ];
    const {runs} = mergeReports(reports, new Set());
    expect(runs).toHaveLength(1);
    expect(runs[0].pp_avg).toBe(2); // most-recent timestamp
  });

  it('prefers status:ok over a more-recent failure for the same key', () => {
    const reports = [
      {
        runs: [
          makeRow({pp_avg: 7, status: 'ok', timestamp: '2026-04-29T08:00:00Z'}),
        ],
      },
      {
        runs: [
          makeRow({
            pp_avg: null,
            status: 'failed',
            timestamp: '2026-04-29T10:00:00Z',
          }),
        ],
      },
    ];
    const {runs} = mergeReports(reports, new Set());
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe('ok');
    expect(runs[0].pp_avg).toBe(7);
  });

  it('drops rows whose model_id matches the drop list', () => {
    const reports = [
      {
        runs: [
          makeRow({model_id: 'lfm2-1.2b'}),
          makeRow({model_id: 'lfm2.5-1.2b-instruct'}),
        ],
      },
    ];
    const {runs} = mergeReports(reports, new Set(['lfm2-1.2b']));
    expect(runs).toHaveLength(1);
    expect(runs[0].model_id).toBe('lfm2.5-1.2b-instruct');
  });

  it('strips log_signals.raw_matches from the merged output', () => {
    const reports = [
      {runs: [makeRow({raw_matches: ['line1', 'line2', 'line3']})]},
    ];
    const {runs} = mergeReports(reports, new Set());
    expect(runs[0].log_signals).toMatchObject({raw_matches: []});
  });

  it('sorts runs deterministically by (model,quant,backend)', () => {
    const reports = [
      {
        runs: [
          makeRow({
            model_id: 'qwen3-1.7b',
            quant: 'q8_0',
            requested_backend: 'gpu',
          }),
          makeRow({
            model_id: 'gemma-3-1b',
            quant: 'q4_0',
            requested_backend: 'cpu',
          }),
          makeRow({
            model_id: 'qwen3-1.7b',
            quant: 'q4_0',
            requested_backend: 'cpu',
          }),
        ],
      },
    ];
    const {runs} = mergeReports(reports, new Set());
    expect(
      runs.map(r => `${r.model_id}/${r.quant}/${r.requested_backend}`),
    ).toEqual([
      'gemma-3-1b/q4_0/cpu',
      'qwen3-1.7b/q4_0/cpu',
      'qwen3-1.7b/q8_0/gpu',
    ]);
  });

  it('returns the most-recent timestamp from the input reports', () => {
    const reports = [
      {timestamp: '2026-04-28T20:00:00Z', runs: [makeRow({})]},
      {timestamp: '2026-04-29T10:00:00Z', runs: [makeRow({})]},
      {timestamp: '2026-04-29T08:00:00Z', runs: [makeRow({})]},
    ];
    const {latestTimestamp} = mergeReports(reports, new Set());
    expect(latestTimestamp).toBe('2026-04-29T10:00:00Z');
  });

  // ---------------------------------------------------------------------------
  // bench-block reconciliation: refreshed baselines must carry the protocol
  // params so benchmark-compare's mismatch gate stays armed for future runs.
  // ---------------------------------------------------------------------------

  it('preserves the bench block when all input reports agree', () => {
    const bench = {pp: 512, tg: 128, pl: 1, nr: 3};
    const reports = [
      {bench, runs: [makeRow({})]},
      {bench, runs: [makeRow({pp_avg: 200})]},
    ];
    const {bench: outBench} = mergeReports(reports, new Set());
    expect(outBench).toEqual(bench);
  });

  it('returns bench=null when no input report carries a bench block (legacy)', () => {
    const reports = [{runs: [makeRow({})]}, {runs: [makeRow({pp_avg: 200})]}];
    const {bench: outBench} = mergeReports(reports, new Set());
    expect(outBench).toBeNull();
  });

  it('preserves bench from the one input that has it (legacy + new mix)', () => {
    const bench = {pp: 512, tg: 128, pl: 1, nr: 3};
    const reports = [
      {runs: [makeRow({})]}, // legacy, no bench
      {bench, runs: [makeRow({pp_avg: 200})]},
    ];
    const {bench: outBench} = mergeReports(reports, new Set());
    expect(outBench).toEqual(bench);
  });

  it('throws when input reports have inconsistent bench params (cannot merge across protocols)', () => {
    const reports = [
      {bench: {pp: 512, tg: 128, pl: 1, nr: 1}, runs: [makeRow({})]},
      {bench: {pp: 512, tg: 128, pl: 1, nr: 3}, runs: [makeRow({pp_avg: 200})]},
    ];
    expect(() => mergeReports(reports, new Set())).toThrow(
      /inconsistent bench/,
    );
  });
});
