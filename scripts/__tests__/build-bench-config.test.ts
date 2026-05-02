/**
 * Unit tests for the shared `BenchConfig` builder. The CLI generator
 * (`e2e/scripts/build-bench-config.ts`) was previously duplicating the
 * models/quants derivation in `e2e/helpers/bench-runner.ts` AND emitting a
 * different `nr` value (1 vs 3). The CLI now delegates to the helper's
 * `buildConfig` and re-attaches the CLI-only `tier` field; these tests
 * confirm the unification (round-1 review C2).
 *
 * The tests live in `scripts/__tests__/` (root jest) and import the e2e
 * scripts via relative paths — same pattern as `merge-bench-reports.test.ts`
 * and `benchmark-compare.test.ts`. The root jest config ignores `/e2e/`
 * (`testPathIgnorePatterns`), so co-locating these tests in the e2e workspace
 * would not run them.
 */

import {buildConfig as buildSharedConfig} from '../../e2e/helpers/bench-runner';
import {buildScreenConfig} from '../../e2e/scripts/build-bench-config';
import {getBenchmarkMatrix} from '../../e2e/fixtures/benchmark-models';

describe('shared BenchConfig builder', () => {
  // ---------------------------------------------------------------------------
  // C2: helper and CLI emit byte-identical models/backends/bench for the same
  // matrix. Only `tier` differs (CLI-only metadata).
  // ---------------------------------------------------------------------------

  it('CLI builder calls into helper builder (no duplication; nr=3 in both)', () => {
    const matrix = getBenchmarkMatrix();

    const fromHelper = buildSharedConfig(matrix);
    const fromCli = buildScreenConfig();

    // The bench protocol is the canonical {pp:512, tg:128, pl:1, nr:3}.
    // Specifically NOT nr:1 (which is what the CLI used to emit).
    expect(fromHelper.bench).toEqual({pp: 512, tg: 128, pl: 1, nr: 3});
    expect(fromCli.bench).toEqual({pp: 512, tg: 128, pl: 1, nr: 3});

    // models/backends are byte-identical between the two builders.
    expect(fromCli.models).toEqual(fromHelper.models);
    expect(fromCli.backends).toEqual(fromHelper.backends);
  });

  it('CLI builder appends `tier` to the shared output (helper does not)', () => {
    const matrix = getBenchmarkMatrix();
    const fromHelper = buildSharedConfig(matrix);
    const fromCli = buildScreenConfig();

    // tier is informational metadata for the CLI consumer; not part of the
    // bench protocol the screen reads.
    expect(fromCli.tier).toBe(matrix.tier);
    expect((fromHelper as Record<string, unknown>).tier).toBeUndefined();
  });

  it('helper builder shape matches BenchConfig contract (no `tier`)', () => {
    const matrix = getBenchmarkMatrix();
    const cfg = buildSharedConfig(matrix);

    // The screen reads BenchConfig with: models, backends, bench. The
    // helper's output is exactly that — no extra fields the screen would
    // need to ignore.
    expect(Object.keys(cfg).sort()).toEqual(['backends', 'bench', 'models']);
  });

  it('models entries carry id, hfModelId, and a quants array', () => {
    const matrix = getBenchmarkMatrix();
    const cfg = buildSharedConfig(matrix);

    expect(cfg.models.length).toBeGreaterThan(0);
    for (const m of cfg.models) {
      expect(m).toHaveProperty('id');
      expect(m).toHaveProperty('hfModelId');
      expect(typeof m.hfModelId).toBe('string');
      expect(m.hfModelId).toMatch(/\/.+-GGUF$/);
      expect(Array.isArray(m.quants)).toBe(true);
    }
  });
});
