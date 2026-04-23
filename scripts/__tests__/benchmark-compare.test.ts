/**
 * Unit tests for the pure `compareReports` function in
 * `e2e/scripts/benchmark-compare.ts`. Mirrors the pattern of
 * `scripts/__tests__/memory-compare.test.ts` — the script lives under `e2e/`
 * but its regression-diffing core is plain TypeScript with no Appium deps.
 *
 * Behaviour under test:
 *   - identical reports pass, no flags;
 *   - >15 pp% delta (in the regression direction) is flagged;
 *   - >15 tg% delta (in the regression direction) is flagged;
 *   - effective_backend mismatch is flagged independently of numeric deltas;
 *   - missing rows are surfaced via `missing_in_current` / `missing_in_baseline`.
 */

import {
  BenchmarkMatrixReport,
  BenchmarkRunReport,
  compareReports,
} from '../../e2e/scripts/benchmark-compare';

function makeRun(
  overrides: Partial<BenchmarkRunReport> = {},
): BenchmarkRunReport {
  return {
    model_id: 'qwen3-1.7b',
    quant: 'q4_0',
    requested_backend: 'gpu',
    effective_backend: 'opencl',
    pp_avg: 300,
    tg_avg: 24,
    wall_ms: 20_000,
    peak_memory_mb: 2048,
    status: 'ok',
    timestamp: '2026-04-21T00:00:00Z',
    ...overrides,
  };
}

function makeReport(
  runs: BenchmarkRunReport[],
  overrides: Partial<BenchmarkMatrixReport> = {},
): BenchmarkMatrixReport {
  return {
    version: '1.0',
    device: 'S26 Ultra',
    soc: 'SM8875',
    commit: 'abc123',
    llama_rn_version: '0.12.0',
    platform: 'android',
    os_version: '16',
    timestamp: '2026-04-21T00:00:00Z',
    preseeded: true,
    runs,
    ...overrides,
  };
}

describe('compareReports (benchmark-compare)', () => {
  // ---------------------------------------------------------------------------
  // Happy path
  // ---------------------------------------------------------------------------

  it('passes with no flags when both reports are identical', () => {
    const runs = [
      makeRun({quant: 'q4_0'}),
      makeRun({quant: 'q5_k_m', pp_avg: 280, tg_avg: 22}),
    ];
    const result = compareReports(makeReport(runs), makeReport(runs));

    expect(result.pass).toBe(true);
    expect(result.rows).toHaveLength(2);
    expect(result.rows.every(r => !r.flagged)).toBe(true);
    expect(result.rows.every(r => r.flags.length === 0)).toBe(true);
    expect(result.missing_in_current).toHaveLength(0);
    expect(result.missing_in_baseline).toHaveLength(0);
    expect(result.threshold_pct).toBe(15); // default
  });

  // ---------------------------------------------------------------------------
  // Numeric-regression flags
  // ---------------------------------------------------------------------------

  it('flags a >15% pp regression', () => {
    const baseline = makeReport([makeRun({pp_avg: 300, tg_avg: 24})]);
    // -20% pp, tg unchanged
    const current = makeReport([makeRun({pp_avg: 240, tg_avg: 24})]);

    const result = compareReports(baseline, current);

    expect(result.pass).toBe(false);
    expect(result.rows[0].flagged).toBe(true);
    expect(result.rows[0].delta_pp_pct).toBeCloseTo(-20, 1);
    expect(result.rows[0].flags.some(f => f.startsWith('pp_regression'))).toBe(
      true,
    );
    expect(result.rows[0].flags.some(f => f.startsWith('tg_regression'))).toBe(
      false,
    );
  });

  it('flags a >15% tg regression', () => {
    const baseline = makeReport([makeRun({pp_avg: 300, tg_avg: 24})]);
    // pp unchanged, -25% tg
    const current = makeReport([makeRun({pp_avg: 300, tg_avg: 18})]);

    const result = compareReports(baseline, current);

    expect(result.pass).toBe(false);
    expect(result.rows[0].flagged).toBe(true);
    expect(result.rows[0].delta_tg_pct).toBeCloseTo(-25, 1);
    expect(result.rows[0].flags.some(f => f.startsWith('tg_regression'))).toBe(
      true,
    );
    expect(result.rows[0].flags.some(f => f.startsWith('pp_regression'))).toBe(
      false,
    );
  });

  it('does NOT flag when both deltas are inside the threshold', () => {
    const baseline = makeReport([makeRun({pp_avg: 300, tg_avg: 24})]);
    // -10% pp, -10% tg; both inside 15%
    const current = makeReport([makeRun({pp_avg: 270, tg_avg: 21.6})]);

    const result = compareReports(baseline, current);

    expect(result.pass).toBe(true);
    expect(result.rows[0].flagged).toBe(false);
  });

  it('does NOT flag improvements (positive deltas past threshold)', () => {
    // The compare script reports regressions only: a +20% pp jump is an
    // improvement and must NOT be flagged.
    const baseline = makeReport([makeRun({pp_avg: 300, tg_avg: 24})]);
    const current = makeReport([makeRun({pp_avg: 360, tg_avg: 30})]); // +20%, +25%

    const result = compareReports(baseline, current);

    expect(result.pass).toBe(true);
    expect(result.rows[0].flagged).toBe(false);
    expect(result.rows[0].delta_pp_pct).toBeCloseTo(20, 1);
    expect(result.rows[0].delta_tg_pct).toBeCloseTo(25, 1);
  });

  it('uses OR semantics: flags when pp OR tg regresses (not AND)', () => {
    // Contrast with memory-compare which requires BOTH thresholds.
    const baseline = makeReport([makeRun({pp_avg: 300, tg_avg: 24})]);
    // -20% pp but +5% tg — one dim regresses, the other improves.
    const current = makeReport([makeRun({pp_avg: 240, tg_avg: 25.2})]);

    const result = compareReports(baseline, current);

    expect(result.pass).toBe(false);
    expect(result.rows[0].flagged).toBe(true);
  });

  it('respects a custom --pct threshold', () => {
    const baseline = makeReport([makeRun({pp_avg: 300, tg_avg: 24})]);
    const current = makeReport([makeRun({pp_avg: 276, tg_avg: 24})]); // -8% pp

    // Default (15%): passes
    expect(compareReports(baseline, current).pass).toBe(true);

    // Custom 5%: fails
    const strict = compareReports(baseline, current, {pct: 5});
    expect(strict.pass).toBe(false);
    expect(strict.threshold_pct).toBe(5);
    expect(strict.rows[0].flags.some(f => f.startsWith('pp_regression'))).toBe(
      true,
    );
  });

  it('treats null pp/tg values as un-comparable (no delta, no flag)', () => {
    // A failed/skipped run typically has pp_avg=null, tg_avg=null.
    const baseline = makeReport([makeRun({pp_avg: 300, tg_avg: 24})]);
    const current = makeReport([
      makeRun({pp_avg: null, tg_avg: null, status: 'failed'}),
    ]);

    const result = compareReports(baseline, current);

    expect(result.rows[0].delta_pp_pct).toBeNull();
    expect(result.rows[0].delta_tg_pct).toBeNull();
    // No numeric-regression flag because both deltas are null. Effective
    // backend ('opencl' == 'opencl') also matches. So no flag.
    expect(
      result.rows[0].flags.filter(
        f => f.startsWith('pp_regression') || f.startsWith('tg_regression'),
      ),
    ).toHaveLength(0);
  });

  it('treats zero baseline as un-comparable (avoids division by zero)', () => {
    const baseline = makeReport([makeRun({pp_avg: 0, tg_avg: 0})]);
    const current = makeReport([makeRun({pp_avg: 100, tg_avg: 10})]);

    const result = compareReports(baseline, current);

    expect(result.rows[0].delta_pp_pct).toBeNull();
    expect(result.rows[0].delta_tg_pct).toBeNull();
    expect(result.rows[0].flagged).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // effective_backend mismatch (independent of numeric deltas)
  // ---------------------------------------------------------------------------

  it('flags an effective_backend mismatch even when pp/tg are stable', () => {
    // Same numbers, but GPU run silently fell back to CPU in current.
    const baseline = makeReport([
      makeRun({effective_backend: 'opencl', pp_avg: 300, tg_avg: 24}),
    ]);
    const current = makeReport([
      makeRun({
        effective_backend: 'cpu+opencl-partial',
        pp_avg: 300,
        tg_avg: 24,
      }),
    ]);

    const result = compareReports(baseline, current);

    expect(result.pass).toBe(false);
    expect(result.rows[0].flagged).toBe(true);
    expect(
      result.rows[0].flags.some(f => f.startsWith('effective_backend:')),
    ).toBe(true);
    expect(
      result.rows[0].flags.find(f => f.startsWith('effective_backend:')),
    ).toBe('effective_backend:opencl->cpu+opencl-partial');
    // Numeric regressions NOT present.
    expect(
      result.rows[0].flags.some(
        f => f.startsWith('pp_regression') || f.startsWith('tg_regression'),
      ),
    ).toBe(false);
  });

  it('stacks effective_backend mismatch with numeric regressions', () => {
    const baseline = makeReport([
      makeRun({effective_backend: 'opencl', pp_avg: 300, tg_avg: 24}),
    ]);
    const current = makeReport([
      makeRun({effective_backend: 'cpu', pp_avg: 100, tg_avg: 10}),
    ]);

    const result = compareReports(baseline, current);
    expect(result.rows[0].flags.length).toBeGreaterThanOrEqual(3);
    expect(result.rows[0].flags).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^pp_regression/),
        expect.stringMatching(/^tg_regression/),
        'effective_backend:opencl->cpu',
      ]),
    );
  });

  // ---------------------------------------------------------------------------
  // Row-level set semantics
  // ---------------------------------------------------------------------------

  it('surfaces rows missing in current under missing_in_current', () => {
    const baseline = makeReport([
      makeRun({quant: 'q4_0'}),
      makeRun({quant: 'q5_k_m', pp_avg: 280, tg_avg: 22}),
    ]);
    const current = makeReport([makeRun({quant: 'q4_0'})]);

    const result = compareReports(baseline, current);

    expect(result.missing_in_current).toEqual(['qwen3-1.7b::q5_k_m::gpu']);
    expect(result.missing_in_baseline).toEqual([]);
    expect(result.rows).toHaveLength(1);
  });

  it('surfaces new rows under missing_in_baseline', () => {
    const baseline = makeReport([makeRun({quant: 'q4_0'})]);
    const current = makeReport([
      makeRun({quant: 'q4_0'}),
      makeRun({quant: 'q8_0', pp_avg: 200, tg_avg: 16}),
    ]);

    const result = compareReports(baseline, current);

    expect(result.missing_in_baseline).toEqual(['qwen3-1.7b::q8_0::gpu']);
    expect(result.missing_in_current).toEqual([]);
  });

  it('keys rows by model::quant::requested_backend (CPU and GPU are separate rows)', () => {
    const runs = [
      makeRun({requested_backend: 'cpu', effective_backend: 'cpu'}),
      makeRun({requested_backend: 'gpu', effective_backend: 'opencl'}),
    ];
    const result = compareReports(makeReport(runs), makeReport(runs));

    expect(result.rows).toHaveLength(2);
    const keys = result.rows.map(r => r.key).sort();
    expect(keys).toEqual(['qwen3-1.7b::q4_0::cpu', 'qwen3-1.7b::q4_0::gpu']);
  });

  // ---------------------------------------------------------------------------
  // Metadata passthrough
  // ---------------------------------------------------------------------------

  it('copies baseline/current commits and devices into the result', () => {
    const baseline = makeReport([makeRun()], {
      commit: 'base-sha',
      device: 'BaselineDevice',
    });
    const current = makeReport([makeRun()], {
      commit: 'cur-sha',
      device: 'CurrentDevice',
    });

    const result = compareReports(baseline, current);

    expect(result.baseline_commit).toBe('base-sha');
    expect(result.current_commit).toBe('cur-sha');
    expect(result.baseline_device).toBe('BaselineDevice');
    expect(result.current_device).toBe('CurrentDevice');
  });

  it('round-trips 2-dp precision on the delta percentages', () => {
    // 300 -> 289.88 is a -3.3733...% delta; rounded to 2 dp is -3.37.
    const baseline = makeReport([makeRun({pp_avg: 300, tg_avg: 24})]);
    const current = makeReport([makeRun({pp_avg: 289.88, tg_avg: 24})]);
    const result = compareReports(baseline, current);
    expect(result.rows[0].delta_pp_pct).toBe(-3.37);
  });
});
