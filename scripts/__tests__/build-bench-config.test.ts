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
import {
  getBenchmarkMatrix,
  parseSettingsAxes,
} from '../../e2e/fixtures/benchmark-models';

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

  // ---------------------------------------------------------------------------
  // settings_axes threading (WHAT 4b, 9a)
  // ---------------------------------------------------------------------------

  it('omits settings_axes from the JSON when the matrix has no axes (WHAT 9a)', () => {
    const matrix = getBenchmarkMatrix(); // env-less matrix has no axes
    const cfg = buildSharedConfig(matrix);
    // Empty array MUST be omitted, not emitted — single canonical
    // "no sweep" shape on the wire.
    expect(Object.prototype.hasOwnProperty.call(cfg, 'settings_axes')).toBe(
      false,
    );
  });

  it('emits settings_axes verbatim when the matrix carries them', () => {
    const matrix = getBenchmarkMatrix();
    const matrixWithAxes = {
      ...matrix,
      settings_axes: [{name: 'cache_type_k' as const, values: ['f16', 'q8_0']}],
    };
    const cfg = buildSharedConfig(matrixWithAxes);
    expect((cfg as any).settings_axes).toEqual([
      {name: 'cache_type_k', values: ['f16', 'q8_0']},
    ]);
  });
});

// -----------------------------------------------------------------------------
// parseSettingsAxes — env-var → settings_axes contract (WHAT 4b.2-4, 9e)
// -----------------------------------------------------------------------------

describe('parseSettingsAxes', () => {
  it('returns [] when no BENCH_* settings env vars are set', () => {
    expect(parseSettingsAxes({})).toEqual([]);
  });

  it('emits axes in the fixed order WHAT 4b.3 mandates', () => {
    // Pass them in reverse declaration order so a bug that returned
    // env-iteration order would fail the test.
    const env = {
      BENCH_N_THREADS: '6',
      BENCH_USE_MMAP: 'true',
      BENCH_NO_EXTRA_BUFTS: 'false',
      BENCH_FLASH_ATTN_TYPE: 'auto',
      BENCH_CACHE_TYPE_V: 'f16',
      BENCH_CACHE_TYPE_K: 'q8_0',
    };
    const axes = parseSettingsAxes(env);
    expect(axes.map(a => a.name)).toEqual([
      'cache_type_k',
      'cache_type_v',
      'flash_attn_type',
      'no_extra_bufts',
      'use_mmap',
      'n_threads',
    ]);
  });

  it('preserves env-var value order within each axis', () => {
    const axes = parseSettingsAxes({BENCH_CACHE_TYPE_K: 'f16,q8_0,q4_0'});
    expect(axes).toHaveLength(1);
    expect(axes[0].values).toEqual(['f16', 'q8_0', 'q4_0']);
  });

  it('coerces no_extra_bufts string tokens to booleans', () => {
    const axes = parseSettingsAxes({BENCH_NO_EXTRA_BUFTS: 'true,false'});
    expect(axes[0].values).toEqual([true, false]);
  });

  it('coerces n_threads tokens to integers', () => {
    const axes = parseSettingsAxes({BENCH_N_THREADS: '4,6,8'});
    expect(axes[0].values).toEqual([4, 6, 8]);
  });

  it('rejects an invalid CacheType (WHAT 9e)', () => {
    expect(() => parseSettingsAxes({BENCH_CACHE_TYPE_K: 'bogus'})).toThrow(
      /BENCH_CACHE_TYPE_K=bogus is not a valid CacheType/,
    );
  });

  it('rejects an invalid flash_attn_type (WHAT 9e)', () => {
    expect(() => parseSettingsAxes({BENCH_FLASH_ATTN_TYPE: 'invalid'})).toThrow(
      /BENCH_FLASH_ATTN_TYPE=invalid is not valid/,
    );
  });

  it('rejects n_threads <= 0 (WHAT 9e)', () => {
    expect(() => parseSettingsAxes({BENCH_N_THREADS: '0'})).toThrow(
      /BENCH_N_THREADS=0 is not valid/,
    );
  });

  it('rejects a non-integer n_threads (WHAT 9e)', () => {
    expect(() => parseSettingsAxes({BENCH_N_THREADS: '3.5'})).toThrow(
      /BENCH_N_THREADS=3.5 is not valid/,
    );
  });

  it('rejects an invalid use_mmap value', () => {
    expect(() => parseSettingsAxes({BENCH_USE_MMAP: 'maybe'})).toThrow(
      /BENCH_USE_MMAP=maybe is not valid/,
    );
  });

  it('rejects an invalid no_extra_bufts value', () => {
    expect(() =>
      parseSettingsAxes({BENCH_NO_EXTRA_BUFTS: 'sometimes'}),
    ).toThrow(/BENCH_NO_EXTRA_BUFTS=sometimes is not valid/);
  });

  it('rejects an empty value list (whitespace-only env var)', () => {
    // Whitespace-only values bypass the env-presence check via trim() in
    // getBenchmarkMatrix, but parseSettingsAxes itself defends against an
    // explicit empty-after-trim list (e.g. '   ,   ').
    expect(() => parseSettingsAxes({BENCH_CACHE_TYPE_K: '   ,   '})).toThrow(
      /empty value list/,
    );
  });
});
