import {compareReports, MemoryReport} from '../../e2e/scripts/memory-compare';

function makeReport(memoryMap: Record<string, number> = {}): MemoryReport {
  const defaults: Record<string, number> = {
    app_launch: 100,
    models_screen: 110,
    chat_screen: 115,
    model_loaded: 300,
    chat_active: 350,
    post_chat_idle: 320,
    model_unloaded: 105,
  };
  const merged = {...defaults, ...memoryMap};

  return {
    version: '1.0',
    commit: 'abc123',
    device: 'TestDevice',
    os_version: '18.0',
    platform: 'ios',
    timestamp: new Date().toISOString(),
    model: 'test-model',
    checkpoints: Object.entries(merged).map(([label, mb]) => ({
      label,
      timestamp: new Date().toISOString(),
      native: {
        phys_footprint: mb * 1024 * 1024,
        available_memory: 3e9,
      },
    })),
    peak_memory_mb: Math.max(...Object.values(merged)),
  };
}

describe('compareReports', () => {
  it('passes when current matches baseline', () => {
    const result = compareReports(makeReport(), makeReport());

    expect(result.pass).toBe(true);
    expect(result.regressions).toHaveLength(0);
    expect(result.deltas).toHaveLength(7);
  });

  it('passes when delta is high % but low absolute (below mb threshold)', () => {
    const baseline = makeReport({app_launch: 100});
    const current = makeReport({app_launch: 120}); // +20% but only +20 MB

    const result = compareReports(baseline, current);

    expect(result.pass).toBe(true);
    expect(result.regressions).toHaveLength(0);
  });

  it('passes when delta is high absolute but low % (below pct threshold)', () => {
    const baseline = makeReport({model_loaded: 3000});
    const current = makeReport({model_loaded: 3150}); // +150 MB but only +5%

    const result = compareReports(baseline, current);

    expect(result.pass).toBe(true);
    expect(result.regressions).toHaveLength(0);
  });

  it('fails when delta exceeds BOTH thresholds', () => {
    const baseline = makeReport({model_loaded: 1000});
    const current = makeReport({model_loaded: 1500}); // +500 MB and +50%

    const result = compareReports(baseline, current);

    expect(result.pass).toBe(false);
    expect(result.regressions).toHaveLength(1);
    expect(result.regressions[0].checkpoint).toBe('model_loaded');
    expect(result.regressions[0].delta_mb).toBeCloseTo(500, 0);
    expect(result.regressions[0].delta_pct).toBeCloseTo(50, 0);
  });

  it('respects custom thresholds', () => {
    const baseline = makeReport({chat_active: 200});
    const current = makeReport({chat_active: 260}); // +60 MB, +30%

    // Default thresholds (10%, 200 MB) — passes (60 MB < 200 MB)
    expect(compareReports(baseline, current).pass).toBe(true);

    // Custom thresholds (5%, 50 MB) — fails (both exceeded)
    const result = compareReports(baseline, current, {pct: 5, mb: 50});
    expect(result.pass).toBe(false);
    expect(result.regressions).toHaveLength(1);
  });

  it('reports deltas for all checkpoints even when passing', () => {
    const baseline = makeReport({app_launch: 100, model_loaded: 300});
    const current = makeReport({app_launch: 105, model_loaded: 310});

    const result = compareReports(baseline, current);

    expect(result.pass).toBe(true);
    const appDelta = result.deltas.find(d => d.checkpoint === 'app_launch');
    expect(appDelta).toBeDefined();
    expect(appDelta!.delta_mb).toBeCloseTo(5, 0);
    expect(appDelta!.delta_pct).toBeCloseTo(5, 0);
  });

  it('handles Android pss_total metric', () => {
    const androidReport = (memMb: number): MemoryReport => ({
      ...makeReport(),
      platform: 'android',
      checkpoints: [
        {
          label: 'app_launch',
          timestamp: new Date().toISOString(),
          native: {pss_total: memMb * 1024 * 1024, available_memory: 3e9},
        },
      ],
    });

    const result = compareReports(androidReport(200), androidReport(200));

    expect(result.pass).toBe(true);
    expect(result.deltas[0].metric).toBe('pss_total');
  });

  it('skips checkpoints missing from baseline', () => {
    const baseline = makeReport();
    const current: MemoryReport = {
      ...makeReport(),
      checkpoints: [
        ...makeReport().checkpoints,
        {
          label: 'extra_checkpoint',
          timestamp: new Date().toISOString(),
          native: {phys_footprint: 999 * 1024 * 1024, available_memory: 1e9},
        },
      ],
    };

    const result = compareReports(baseline, current);

    // extra_checkpoint has no baseline — should not appear in deltas
    expect(
      result.deltas.find(d => d.checkpoint === 'extra_checkpoint'),
    ).toBeUndefined();
  });

  it('includes peak comparison in result', () => {
    const baseline = makeReport({chat_active: 500});
    const current = makeReport({chat_active: 520});

    const result = compareReports(baseline, current);

    expect(result.peak_baseline_mb).toBe(500);
    expect(result.peak_current_mb).toBe(520);
  });

  it('detects memory decrease (negative delta) without flagging', () => {
    const baseline = makeReport({model_loaded: 1000});
    const current = makeReport({model_loaded: 800}); // -200 MB, improvement

    const result = compareReports(baseline, current);

    expect(result.pass).toBe(true);
    const delta = result.deltas.find(d => d.checkpoint === 'model_loaded');
    expect(delta!.delta_mb).toBeCloseTo(-200, 0);
    expect(delta!.delta_pct).toBeCloseTo(-20, 0);
  });

  it('includes metal_allocated in iOS total when present', () => {
    const MB = 1024 * 1024;
    const makeIosReport = (phys: number, metal: number): MemoryReport => ({
      ...makeReport(),
      checkpoints: [
        {
          label: 'model_loaded',
          timestamp: new Date().toISOString(),
          native: {
            phys_footprint: phys * MB,
            metal_allocated: metal * MB,
            available_memory: 3e9,
          },
        },
      ],
      peak_memory_mb: phys + metal,
    });

    const baseline = makeIosReport(400, 1700); // total 2100
    const current = makeIosReport(410, 1900); // total 2310, +210 MB, +10%

    const result = compareReports(baseline, current);

    const delta = result.deltas[0];
    expect(delta.metric).toBe('phys+metal');
    expect(delta.baseline_mb).toBeCloseTo(2100, 0);
    expect(delta.current_mb).toBeCloseTo(2310, 0);
    expect(delta.delta_mb).toBeCloseTo(210, 0);
    expect(delta.delta_pct).toBeCloseTo(10, 0);
  });

  it('flags regression when metal causes total to exceed thresholds', () => {
    const MB = 1024 * 1024;
    const makeIosReport = (phys: number, metal: number): MemoryReport => ({
      ...makeReport(),
      checkpoints: [
        {
          label: 'model_loaded',
          timestamp: new Date().toISOString(),
          native: {
            phys_footprint: phys * MB,
            metal_allocated: metal * MB,
            available_memory: 3e9,
          },
        },
      ],
      peak_memory_mb: phys + metal,
    });

    const baseline = makeIosReport(400, 1700); // total 2100
    const current = makeIosReport(400, 2100); // total 2500, +400 MB, +19%

    const result = compareReports(baseline, current);

    expect(result.pass).toBe(false);
    expect(result.regressions).toHaveLength(1);
    expect(result.regressions[0].delta_mb).toBeCloseTo(400, 0);
  });
});
