/**
 * Unit tests for the pure `migrateReport` helper in
 * `e2e/scripts/migrate-baseline-v1-to-v1_1.ts`.
 *
 * Lives in scripts/__tests__/ (root jest) following the same pattern
 * as merge-bench-reports.test.ts and benchmark-compare.test.ts —
 * the e2e directory is testPathIgnorePatterns'd by the root jest
 * config.
 */

import {migrateReport} from '../../e2e/scripts/migrate-baseline-v1-to-v1_1';

function makeV1Row(over: Partial<Record<string, unknown>> = {}) {
  return {
    model_id: 'qwen3-1.7b',
    quant: 'q4_0',
    requested_backend: 'cpu',
    effective_backend: 'cpu',
    pp_avg: 100,
    tg_avg: 10,
    wall_ms: 1000,
    peak_memory_mb: 200,
    log_signals: {raw_matches: []},
    init_settings: {n_ctx: 2048, n_threads: 6, cache_type_k: 'f16'},
    status: 'ok',
    timestamp: '2026-04-29T08:00:00Z',
    ...over,
  };
}

describe('migrateReport', () => {
  it('stamps every row with app-default fingerprint and empty overrides (WHAT D7/D8)', () => {
    const v1 = {
      version: '1.0',
      device: 'POCO',
      runs: [makeV1Row({}), makeV1Row({quant: 'q8_0'})],
    };
    const out = migrateReport(v1);
    expect(out.version).toBe('1.1');
    expect(out.runs).toHaveLength(2);
    for (const r of out.runs) {
      expect(r.settings_fingerprint).toBe('app-default');
      expect(r.settings_overrides).toEqual({});
    }
  });

  it('preserves all other row fields verbatim', () => {
    const row = makeV1Row({
      pp_avg: 250.5,
      effective_backend: 'opencl',
      log_signals: {opencl_init: true, raw_matches: []},
    });
    const out = migrateReport({version: '1.0', runs: [row]});
    const migrated = out.runs[0];
    expect(migrated.pp_avg).toBe(250.5);
    expect(migrated.effective_backend).toBe('opencl');
    expect(migrated.log_signals).toEqual({
      opencl_init: true,
      raw_matches: [],
    });
    expect(migrated.init_settings).toEqual({
      n_ctx: 2048,
      n_threads: 6,
      cache_type_k: 'f16',
    });
  });

  it('preserves top-level metadata (device, soc, commit, bench, etc)', () => {
    const v1 = {
      version: '1.0',
      device: 'POCO',
      soc: 'SD8E5',
      commit: 'abc123',
      llama_rn_version: '0.12.0-rc.9',
      platform: 'android',
      os_version: '15',
      timestamp: '2026-04-29T10:00:00Z',
      preseeded: false,
      bench: {pp: 512, tg: 128, pl: 1, nr: 3},
      runs: [makeV1Row({})],
    };
    const out = migrateReport(v1);
    expect(out.device).toBe('POCO');
    expect(out.soc).toBe('SD8E5');
    expect(out.commit).toBe('abc123');
    expect(out.bench).toEqual({pp: 512, tg: 128, pl: 1, nr: 3});
    expect(out.timestamp).toBe('2026-04-29T10:00:00Z');
  });

  it('does NOT add settings_axes_used (legacy baselines had no sweeps)', () => {
    const v1 = {version: '1.0', runs: [makeV1Row({})]};
    const out = migrateReport(v1);
    // Legacy baselines were captured without sweeps by construction;
    // adding settings_axes_used would lie about provenance.
    expect(
      Object.prototype.hasOwnProperty.call(out, 'settings_axes_used'),
    ).toBe(false);
  });

  it('treats missing version as 1.0 and migrates anyway (legacy default)', () => {
    const v1 = {runs: [makeV1Row({})]}; // no version field
    const out = migrateReport(v1);
    expect(out.version).toBe('1.1');
    expect(out.runs[0].settings_fingerprint).toBe('app-default');
  });

  it('is idempotent: a second migration produces the same output', () => {
    const v1 = {version: '1.0', runs: [makeV1Row({})]};
    const once = migrateReport(v1);
    const twice = migrateReport(once);
    expect(twice).toEqual(once);
  });

  it('passes a v1.1 input through unchanged (does NOT re-stamp)', () => {
    const v1_1 = {
      version: '1.1',
      runs: [
        {
          ...makeV1Row({}),
          settings_fingerprint: 'cache_type_k=q8_0;...',
          settings_overrides: {cache_type_k: 'q8_0'},
        },
      ],
    };
    const out = migrateReport(v1_1);
    // Already-1.1 input MUST keep its non-app-default fingerprint —
    // the migration's only legitimate path to mint app-default is
    // the legacy v1.0 stamp.
    expect(out.runs[0].settings_fingerprint).toBe('cache_type_k=q8_0;...');
    expect(out.runs[0].settings_overrides).toEqual({cache_type_k: 'q8_0'});
    expect(out).toBe(v1_1); // identity (no copy)
  });

  it('throws on unknown version (fail loud per WHAT 4f.2)', () => {
    expect(() => migrateReport({version: '0.9', runs: []})).toThrow(
      /unsupported version: 0\.9/,
    );
    expect(() => migrateReport({version: '2.0', runs: []})).toThrow(
      /unsupported version: 2\.0/,
    );
  });

  it('handles a report with zero rows (empty runs array)', () => {
    const out = migrateReport({version: '1.0', runs: []});
    expect(out.version).toBe('1.1');
    expect(out.runs).toEqual([]);
  });

  it('handles a report with missing runs field (defensive)', () => {
    const out = migrateReport({version: '1.0'});
    expect(out.version).toBe('1.1');
    expect(out.runs).toEqual([]);
  });
});
