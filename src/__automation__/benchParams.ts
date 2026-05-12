/**
 * Bench-runner params composition.
 *
 * The matrix runner owns the native context lifecycle end-to-end and never
 * routes through `modelStore.contextInitParams` / `modelStore.initContext`.
 * That isolation removes three classes of failure that earlier shared-state
 * designs hit:
 *
 *   1. Cold-launch auto-load shadowing — when the bench shared the store,
 *      `ChatView`'s `selectModel(palDefaultModel)` could load the model
 *      with default devices BEFORE the matrix could call `setDevices(...)`,
 *      and `initContext`'s "already loaded → skip" path silently dropped
 *      the runner's per-cell intent.
 *   2. Cross-cell MMKV leak — a previous cell's persisted `n_gpu_layers`
 *      could carry into the next cell unless explicitly pinned and then
 *      restored at matrix exit. The pin/restore machinery was a
 *      symptom-level patch.
 *   3. Crash-corruption — if the matrix threw mid-flight, the user's
 *      persisted Settings would be left in whatever transient state the
 *      last cell wrote.
 *
 * Under this module's contract:
 *   - The runner reads NOTHING from `modelStore`.
 *   - The runner writes NOTHING to `modelStore`.
 *   - Per-cell params are a pure literal: base ⊕ overrides ⊕ backend slot.
 *
 * `n_threads` is the one device-dependent default. The runner resolves it
 * once at matrix start via `getRecommendedThreadCount()` (a pure utility,
 * not store-coupled) and threads it into the base.
 */

import {Platform} from 'react-native';

import type {ContextParams} from 'llama.rn';

import type {
  SettingsKnob,
  SettingsValue,
} from './screens/BenchmarkRunnerScreen';

/**
 * Per-cell override map. Mirrors the existing `SettingsOverrides` in the
 * screen module; re-exported here so callers that only need the params
 * helpers don't import the screen.
 */
export type SettingsOverrides = Partial<Record<SettingsKnob, SettingsValue>>;

/**
 * The exact field set the bench runner controls when composing
 * `ContextParams` for `initLlama`. Excludes `model`, `devices`,
 * `n_gpu_layers` — those are the per-cell axis values, computed from the
 * cell's backend slot, not part of the shared base.
 */
export type BenchBaseParams = Pick<
  ContextParams,
  | 'n_ctx'
  | 'n_batch'
  | 'n_ubatch'
  | 'n_threads'
  | 'cache_type_k'
  | 'cache_type_v'
  | 'use_mlock'
  | 'use_mmap'
  | 'flash_attn_type'
  | 'kv_unified'
  | 'n_parallel'
  | 'no_extra_bufts'
>;

/**
 * Base params for every bench cell, before per-cell overrides. Picked to
 * be reproducible across devices and decoupled from whatever the user has
 * in Settings: `use_mmap` is an explicit boolean (no smart resolver),
 * `flash_attn_type` follows the platform default that matches the merged
 * v2.2 contract, `kv_unified=true` matches the post-v2.0 ContextInitParams
 * default. `n_threads` is a fallback only — the matrix overwrites it with
 * `getRecommendedThreadCount()` at matrix start.
 */
export const DEFAULT_BENCH_BASE_PARAMS: BenchBaseParams = {
  n_ctx: 2048,
  n_batch: 512,
  n_ubatch: 512,
  n_threads: 4,
  cache_type_k: 'f16',
  cache_type_v: 'f16',
  use_mlock: false,
  use_mmap: false,
  flash_attn_type: Platform.OS === 'ios' ? 'auto' : 'off',
  kv_unified: true,
  n_parallel: 1,
  no_extra_bufts: false,
};

/**
 * Translate a per-cell `SettingsOverrides` map to a `Partial<BenchBaseParams>`.
 *
 * `use_mmap` is the only knob whose override domain (`'true' | 'false' |
 * 'smart'`, mirroring the Settings UI) doesn't coincide with the
 * `ContextParams` field type (`boolean`). `'smart'` has no per-file
 * resolution under the bench (no model file is open at compose time);
 * we resolve it to the platform default — `true` on iOS, `false` on
 * Android — to match the ContextInitParams v2.2 migration semantics.
 *
 * Pure: no closure capture, no side effects. Exported for unit tests.
 */
export function buildOverridesParams(
  overrides: SettingsOverrides,
): Partial<BenchBaseParams> {
  const out: Partial<BenchBaseParams> = {};
  if (overrides.flash_attn_type !== undefined) {
    out.flash_attn_type = overrides.flash_attn_type as 'auto' | 'on' | 'off';
  }
  if (overrides.cache_type_k !== undefined) {
    out.cache_type_k = overrides.cache_type_k as ContextParams['cache_type_k'];
  }
  if (overrides.cache_type_v !== undefined) {
    out.cache_type_v = overrides.cache_type_v as ContextParams['cache_type_v'];
  }
  if (overrides.no_extra_bufts !== undefined) {
    out.no_extra_bufts = Boolean(overrides.no_extra_bufts);
  }
  if (overrides.use_mmap !== undefined) {
    if (overrides.use_mmap === 'smart') {
      out.use_mmap = Platform.OS === 'ios';
    } else if (typeof overrides.use_mmap === 'boolean') {
      out.use_mmap = overrides.use_mmap;
    } else {
      out.use_mmap = overrides.use_mmap === 'true';
    }
  }
  if (overrides.n_threads !== undefined) {
    out.n_threads = Number(overrides.n_threads);
  }
  return out;
}

/**
 * Compose the literal `ContextParams` the runner hands to `initLlama` for
 * a single cell. The field order is significant for the snapshot-on-disk:
 *   1. base — every field with its default value
 *   2. overrides — the cell's sweep-axis values (only the keys the cell
 *      explicitly varied; everything else stays at base)
 *   3. cell-axis fixed slots — `model`, `devices`, `n_gpu_layers`, which
 *      are determined by the cell coordinates, not the sweep
 *
 * Pure: no closure capture, no side effects. Exported for unit tests.
 */
export function composeCellParams(args: {
  filePath: string;
  base: BenchBaseParams;
  overrides: SettingsOverrides;
  devices: string[];
  n_gpu_layers: number;
}): ContextParams {
  return {
    ...args.base,
    ...buildOverridesParams(args.overrides),
    model: args.filePath,
    devices: args.devices,
    n_gpu_layers: args.n_gpu_layers,
  };
}
