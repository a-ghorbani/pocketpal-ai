import {compareReports, MemoryReport} from '../memory-compare';

function makeReport(overrides: Partial<MemoryReport> = {}): MemoryReport {
  return {
    version: '1.0',
    commit: 'abc123',
    device: 'iPhone 16',
    os_version: '18.0',
    platform: 'ios',
    timestamp: new Date().toISOString(),
    model: 'smollm2-135m',
    checkpoints: [
      {
        label: 'app_launch',
        timestamp: new Date().toISOString(),
        native: {phys_footprint: 100 * 1024 * 1024, available_memory: 3e9},
      },
      {
        label: 'models_screen',
        timestamp: new Date().toISOString(),
        native: {phys_footprint: 110 * 1024 * 1024, available_memory: 3e9},
      },
      {
        label: 'chat_screen',
        timestamp: new Date().toISOString(),
        native: {phys_footprint: 115 * 1024 * 1024, available_memory: 3e9},
      },
      {
        label: 'model_loaded',
        timestamp: new Date().toISOString(),
        native: {phys_footprint: 300 * 1024 * 1024, available_memory: 2.5e9},
      },
      {
        label: 'chat_active',
        timestamp: new Date().toISOString(),
        native: {phys_footprint: 350 * 1024 * 1024, available_memory: 2.3e9},
      },
      {
        label: 'post_chat_idle',
        timestamp: new Date().toISOString(),
        native: {phys_footprint: 320 * 1024 * 1024, available_memory: 2.4e9},
      },
      {
        label: 'model_unloaded',
        timestamp: new Date().toISOString(),
        native: {phys_footprint: 105 * 1024 * 1024, available_memory: 3e9},
      },
    ],
    peak_memory_mb: 350,
    ...overrides,
  };
}

function makeReportWithMemory(memoryMap: Record<string, number>): MemoryReport {
  const base = makeReport();
  return makeReport({
    checkpoints: base.checkpoints.map(c => ({
      ...c,
      native: {
        ...c.native,
        phys_footprint:
          (memoryMap[c.label] ?? c.native.phys_footprint / (1024 * 1024)) *
          1024 *
          1024,
      },
    })),
  });
}

describe('compareReports', () => {
  it('should pass when within budget, no regression, and no leak', () => {
    const baseline = makeReport();
    const current = makeReport();

    const result = compareReports(baseline, current);

    expect(result.pass).toBe(true);
    expect(result.budget_violations).toHaveLength(0);
    expect(result.regressions).toHaveLength(0);
    expect(result.leak_detected).toBe(false);
    expect(result.leak_details).toBeDefined();
    expect(result.leak_details!.ratio).toBeLessThanOrEqual(1.1);
  });

  it('should detect budget violation when checkpoint exceeds ceiling', () => {
    const baseline = makeReport();
    const current = makeReport({
      checkpoints: [
        ...makeReport().checkpoints.slice(0, 4),
        {
          label: 'chat_active',
          timestamp: new Date().toISOString(),
          native: {
            phys_footprint: 1200 * 1024 * 1024,
            available_memory: 1e9,
          },
        },
        ...makeReport().checkpoints.slice(5),
      ],
    });

    const result = compareReports(baseline, current);

    expect(result.pass).toBe(false);
    expect(result.budget_violations).toHaveLength(1);
    expect(result.budget_violations[0].checkpoint).toBe('chat_active');
    expect(result.budget_violations[0].metric).toBe('phys_footprint');
    expect(result.budget_violations[0].value_mb).toBeGreaterThan(1024);
  });

  it('should detect budget violation with custom ceiling', () => {
    const baseline = makeReport();
    const current = makeReport();

    const result = compareReports(baseline, current, {budgetCeilingMb: 200});

    expect(result.pass).toBe(false);
    expect(result.budget_violations.length).toBeGreaterThan(0);
    const modelLoaded = result.budget_violations.find(
      v => v.checkpoint === 'model_loaded',
    );
    expect(modelLoaded).toBeDefined();
  });

  it('should detect memory leak when post-unload > 110% pre-load', () => {
    const checkpoints = makeReport().checkpoints.map(c => ({...c}));
    checkpoints[6] = {
      label: 'model_unloaded',
      timestamp: new Date().toISOString(),
      native: {
        phys_footprint: 125 * 1024 * 1024,
        available_memory: 3e9,
      },
    };

    const baseline = makeReport();
    const current = makeReport({checkpoints});

    const result = compareReports(baseline, current);

    expect(result.pass).toBe(false);
    expect(result.leak_detected).toBe(true);
    expect(result.leak_details).toBeDefined();
    expect(result.leak_details!.ratio).toBeGreaterThan(1.1);
    expect(result.leak_details!.pre_load_mb).toBeCloseTo(100, 0);
    expect(result.leak_details!.post_unload_mb).toBeCloseTo(125, 0);
  });

  it('should handle Android reports with pss_total metric', () => {
    const androidReport = makeReport({
      platform: 'android',
      checkpoints: makeReport().checkpoints.map(c => ({
        ...c,
        native: {
          pss_total: c.native.phys_footprint,
          native_heap_allocated: c.native.phys_footprint * 0.5,
          available_memory: c.native.available_memory,
        },
      })),
    });

    const result = compareReports(androidReport, androidReport);

    expect(result.pass).toBe(true);
    expect(result.budget_violations).toHaveLength(0);
  });

  it('should pass when post-unload is exactly at 110% threshold', () => {
    const checkpoints = makeReport().checkpoints.map(c => ({...c}));
    checkpoints[6] = {
      label: 'model_unloaded',
      timestamp: new Date().toISOString(),
      native: {
        phys_footprint: 110 * 1024 * 1024,
        available_memory: 3e9,
      },
    };

    const baseline = makeReport();
    const current = makeReport({checkpoints});

    const result = compareReports(baseline, current);

    expect(result.leak_detected).toBe(false);
  });

  it('should handle missing app_launch or model_unloaded checkpoints', () => {
    const current = makeReport({
      checkpoints: makeReport().checkpoints.filter(
        c => c.label !== 'model_unloaded',
      ),
    });

    const result = compareReports(makeReport(), current);

    expect(result.leak_detected).toBe(false);
    expect(result.leak_details).toBeUndefined();
  });

  it('should detect regression when checkpoint increases > threshold vs baseline', () => {
    const baseline = makeReportWithMemory({
      app_launch: 100,
      model_loaded: 300,
      model_unloaded: 105,
    });
    const current = makeReportWithMemory({
      app_launch: 100,
      model_loaded: 400, // 33% increase
      model_unloaded: 105,
    });

    const result = compareReports(baseline, current);

    expect(result.pass).toBe(false);
    expect(result.regressions.length).toBeGreaterThan(0);
    const modelLoaded = result.regressions.find(
      r => r.checkpoint === 'model_loaded',
    );
    expect(modelLoaded).toBeDefined();
    expect(modelLoaded!.delta_pct).toBeGreaterThan(15);
    expect(modelLoaded!.baseline_mb).toBeCloseTo(300, 0);
    expect(modelLoaded!.current_mb).toBeCloseTo(400, 0);
  });

  it('should pass when regression is within threshold', () => {
    const baseline = makeReportWithMemory({
      app_launch: 100,
      model_loaded: 300,
      model_unloaded: 105,
    });
    const current = makeReportWithMemory({
      app_launch: 105, // 5% increase — within 15% default
      model_loaded: 320, // 6.7% increase — within threshold
      model_unloaded: 108,
    });

    const result = compareReports(baseline, current);

    expect(result.regressions).toHaveLength(0);
  });

  it('should respect custom regression threshold', () => {
    const baseline = makeReportWithMemory({
      app_launch: 100,
      model_loaded: 300,
      model_unloaded: 105,
    });
    const current = makeReportWithMemory({
      app_launch: 106, // 6% increase
      model_loaded: 300,
      model_unloaded: 105,
    });

    // 5% threshold — the 6% increase should flag
    const result = compareReports(baseline, current, {regressionPct: 5});

    expect(result.pass).toBe(false);
    expect(result.regressions.length).toBeGreaterThan(0);
    const appLaunch = result.regressions.find(
      r => r.checkpoint === 'app_launch',
    );
    expect(appLaunch).toBeDefined();
    expect(appLaunch!.delta_pct).toBeGreaterThan(5);
  });
});
