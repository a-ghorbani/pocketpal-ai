import React, {useCallback, useRef, useState} from 'react';
import {Button, ScrollView, StyleSheet, Text, View} from 'react-native';
import RNDeviceInfo from 'react-native-device-info';
import {
  addNativeLogListener,
  initLlama,
  toggleNativeLog,
  type LlamaContext,
} from 'llama.rn';
import {observer} from 'mobx-react';

import {modelStore} from '../../store';
import NativeHardwareInfo from '../../specs/NativeHardwareInfo';
import {getDeviceOptions} from '../../utils/deviceSelection';
import {getRecommendedThreadCount} from '../../utils/deviceCapabilities';
import type {Model} from '../../utils/types';
import {
  BENCH_LOG_RE,
  deriveEffectiveBackend,
  deriveLogSignals,
  emptyLogSignals,
  requestSatisfiedBy,
  type LogSignals,
} from '../logSignals';
import {
  DEFAULT_BENCH_BASE_PARAMS,
  composeCellParams,
  type BenchBaseParams,
} from '../benchParams';

// Top-level require keeps RNFS access DCE-friendly (matches MemoryAdapter
// pattern from TASK-20260423-2331 Step 0). The whole module is gated
// behind __E2E__ at every reachable import site (App.tsx, deepLink.ts,
// useDeepLinking.ts), so this require is unreachable in prod.

const RNFS = require('@dr.pogodin/react-native-fs');

// Runtime-referenced marker for the CI bundle-grep — see .github/workflows/ci.yml.
// MUST be referenced INSIDE a runtime branch (not just JSDoc) so Hermes cannot
// DCE the literal as dead code. We log it from onRun below.
const BENCH_RUN_MATRIX = 'BENCH_RUN_MATRIX';

const CONFIG_PATH = `${RNFS.ExternalDirectoryPath}/bench-config.json`;
const reportPath = (timestamp: string) =>
  `${RNFS.ExternalDirectoryPath}/benchmark-report-${timestamp}.json`;

type Status = string; // 'idle' | 'downloading:<f>[ <pct>%]' | 'running:<i/n>:<tag>' (tag may include /<key=val;...> override suffix) | 'cell-failed:<i/n>:<msg>' | 'complete' | 'error:<msg>'

/** Closed enum for the requested-backend axis. Hexagon (Qualcomm NPU) is a
 * third backend value, distinct from cpu/gpu, and gated by the same
 * fail-fast pattern as `gpu` — if the device has no Hexagon, hexagon cells
 * fail and the matrix continues. (WHAT §1a, §8 D1.) */
export type Backend = 'cpu' | 'gpu' | 'hexagon';

/** Closed enum of fingerprint-eligible knobs. Adding a knob is a
 * fingerprint-version bump (WHAT §4d.1 — fixed contract). */
export type SettingsKnob =
  | 'cache_type_k'
  | 'cache_type_v'
  | 'flash_attn_type'
  | 'no_extra_bufts'
  | 'use_mmap'
  | 'n_threads';

/** Value domain for sweep axes. The actual per-knob domain is enforced at
 * config-build time (WHAT §4b.4); values reach the screen pre-validated. */
export type SettingsValue = string | number | boolean;

export interface SettingsAxis {
  name: SettingsKnob;
  values: SettingsValue[];
}

interface BenchVariant {
  quant: string;
  filename: string;
  /** Optional GGUF size in bytes. Bypasses the pre-flight space check when
   * absent (set to 1). Provide it from bench-config to honour the real
   * disk-space gate; the implementer can fetch it from HF's API if needed. */
  size?: number;
}

interface BenchModelEntry {
  id: string;
  hfModelId: string;
  quants: BenchVariant[];
}

export interface BenchConfig {
  models: BenchModelEntry[];
  backends: Backend[];
  bench?: {pp: number; tg: number; pl: number; nr: number};
  /** Sweep axes for per-cell context-init overrides. Optional/absent means
   * "no sweep" — the matrix produces one cell per (model, variant, backend)
   * with empty overrides and the reserved `app-default` fingerprint
   * (WHAT §1a, §2, §4d D7). */
  settings_axes?: SettingsAxis[];
  /** Wall-time (ms) to wait between cells, after `ctx.release()` resolves.
   * Two purposes layered together:
   *   1. Backend drivers (Adreno OpenCL command-queue tear-down on a worker
   *      thread, Hexagon HTP FastRPC teardown) defer their final memory
   *      release a few hundred ms past the JSI-promise boundary. ≥200ms is
   *      enough for that.
   *   2. **Thermal stabilisation** — long matrix runs see CPU/SoC/battery
   *      temperatures climb monotonically across cells (≈1°C per cell on
   *      Snapdragon under sustained pp+tg load), and a hot device throttles
   *      mid-cell, distorting pp/tg numbers. Setting this to e.g. 15-60s
   *      gives the cooling system a window to bring temperatures back to a
   *      stable working range before the next cell.
   * Default 2000ms when absent (driver-release insurance only — does NOT
   * stabilise thermals on hot devices). Operators tune higher in the
   * pushed bench-config.json without rebuilding the APK. The effective
   * value is echoed in the report's top-level `inter_cell_settle_ms`. */
  inter_cell_settle_ms?: number;
}

/** Effective backend after parsing native-log signals. Mirrors the
 * OpenCL pair with hexagon arms (WHAT §1c, §8 D2). */
export type EffectiveBackend =
  | 'cpu'
  | 'opencl'
  | 'cpu+opencl-partial'
  | 'hexagon'
  | 'cpu+hexagon-partial'
  | 'unknown';

interface BenchmarkRunRow {
  model_id: string;
  quant: string;
  requested_backend: Backend;
  effective_backend: EffectiveBackend;
  pp_avg: number | null;
  tg_avg: number | null;
  wall_ms: number;
  peak_memory_mb: number | null;
  log_signals: LogSignals;
  init_settings: Record<string, unknown>;
  /** Exact params passed to llama.rn's initLlama, captured BEFORE
   * initContext fires. Distinct from `init_settings` (which snapshots
   * `modelStore.contextInitParams` AFTER init). The store may carry
   * symbolic values like `use_mmap='smart'` that resolve to concrete
   * booleans only via `getEffectiveContextInitParams(filePath)`. This
   * field captures what the runtime actually saw. Diagnostic for
   * cross-cell or cross-session state leaks. */
  effective_init_params: Record<string, unknown>;
  /** What the cell asked for. Always present (possibly `{}`) — single
   * writer is `runMatrix` (WHAT §4h I1, §5). */
  settings_overrides: Partial<Record<SettingsKnob, SettingsValue>>;
  /** Canonical fingerprint identifying the cell's settings configuration.
   * Pure function of `init_settings` (success / post-init failure path) or
   * the matrix-level pre-run snapshot overlaid with overrides (pre-init
   * failure path, prefixed `req:`). The reserved literal `app-default` is
   * minted only when no `settings_axes` was passed in config and the cell
   * has empty overrides (WHAT §4d, §4h I2/I3, §9c). */
  settings_fingerprint: string;
  status: 'ok' | 'skipped' | 'failed';
  reason?: string;
  error?: string;
  timestamp: string;
}

interface BenchmarkReport {
  version: '1.1';
  platform: 'android';
  timestamp: string;
  preseeded: boolean;
  bench: {pp: number; tg: number; pl: number; nr: number};
  /** Echo of the effective inter-cell settle (ms) actually used by this
   * run. Always present; resolves the config's `inter_cell_settle_ms`
   * with the 2000ms default. Useful for thermal-throttling forensics
   * when comparing two reports captured under different settle values. */
  inter_cell_settle_ms: number;
  /** Echo of `config.settings_axes` when the run had axes. Omitted when the
   * config had none (WHAT §1e, §9a — empty array MUST NOT be emitted). */
  settings_axes_used?: SettingsAxis[];
  runs: BenchmarkRunRow[];
}

const DEFAULT_BENCH = {pp: 512, tg: 128, pl: 1, nr: 3};
const TRUNCATE_ERROR = 200; // status string error length
const TRUNCATE_ROW_ERROR = 500; // row.error length
const PEAK_POLL_MS = 1000;
const DEFAULT_INTER_CELL_SETTLE_MS = 2000;

async function loadConfig(): Promise<BenchConfig> {
  const exists = await RNFS.exists(CONFIG_PATH);
  if (!exists) {
    throw new Error('bench-config-missing');
  }
  const raw = await RNFS.readFile(CONFIG_PATH, 'utf8');
  return JSON.parse(raw) as BenchConfig;
}

async function trackPeakMemory(): Promise<{
  total: number;
  used: number;
  percentage: number;
} | null> {
  try {
    const total = await RNDeviceInfo.getTotalMemory();
    const used = await RNDeviceInfo.getUsedMemory();
    return {total, used, percentage: (used / total) * 100};
  } catch {
    return null;
  }
}

type SettingsOverrides = Partial<Record<SettingsKnob, SettingsValue>>;

/**
 * Pre-run snapshot of all six fingerprint-eligible knobs (WHAT 4c.1).
 * The matrix-level fixed point used for both restoration (4c.3) and
 * the pre-init failure-path fingerprint construction (9c).
 *
 * Keys missing on the platform stay missing in the snapshot (e.g. iOS
 * `no_extra_bufts`); the canonicaliser treats absence as `"-"`.
 */
type PreRunSnapshot = Partial<Record<SettingsKnob, SettingsValue>>;

/**
 * Expand sweep axes into a list of per-cell override maps. WHAT §2:
 * absent / empty axes returns `[{}]` — single cell, empty overrides,
 * which is the only path that produces the `app-default` fingerprint
 * (D7). With axes, returns the full cartesian product preserving axis
 * order (WHAT 4b.3 — fixed declaration order).
 *
 * Pure: no closure capture, no side effects. Exported for unit tests.
 */
export function expandAxes(
  axes: SettingsAxis[] | undefined,
): SettingsOverrides[] {
  if (!axes || axes.length === 0) {
    return [{}];
  }
  // Iteratively grow the cartesian product, axis by axis. Reads more
  // naturally than a recursive variant for the small N we expect (six
  // axes max, typically two or three values each).
  let result: SettingsOverrides[] = [{}];
  for (const axis of axes) {
    const next: SettingsOverrides[] = [];
    for (const acc of result) {
      for (const value of axis.values) {
        next.push({...acc, [axis.name]: value});
      }
    }
    result = next;
  }
  return result;
}

/**
 * Project the bench's matrix-level base params onto the six
 * fingerprint-eligible knobs (WHAT 4d.1 — fixed contract). This is the
 * fixed point used to build `req:`-prefixed failure fingerprints when a
 * cell throws BEFORE init params are composed (e.g. download timeout,
 * GPU/Hexagon pre-check failure).
 *
 * Reads only from the bench's own base params — never from
 * `modelStore.contextInitParams`. The runner is fully isolated from the
 * rest of the app's state, so the fingerprint reflects the bench's
 * declared base, not whatever the user happens to have in Settings.
 */
function snapshotFingerprintKeys(base: BenchBaseParams): PreRunSnapshot {
  return {
    cache_type_k: base.cache_type_k as SettingsValue,
    cache_type_v: base.cache_type_v as SettingsValue,
    flash_attn_type: base.flash_attn_type as SettingsValue,
    no_extra_bufts: base.no_extra_bufts as SettingsValue,
    use_mmap: base.use_mmap as SettingsValue,
    n_threads: base.n_threads as SettingsValue,
  };
}

/**
 * Project a cell's composed `ContextParams` onto the fingerprint-eligible
 * knobs. Used to build the success-path fingerprint AND to populate the
 * report's `init_settings` field. Replaces the prior post-init snapshot
 * read from `modelStore.contextInitParams`: under the isolated lifecycle
 * the runner never goes through ModelStore, so the cell's composed
 * params ARE the post-init reality (no in-store mutation can shadow
 * them).
 *
 * `model` and other non-fingerprint fields are dropped so the snapshot
 * is shaped to feed `canonicaliseFingerprint` directly.
 */
function snapshotCellInitSettings(
  cellParams: Record<string, unknown>,
): Record<string, unknown> {
  const keys: SettingsKnob[] = [
    'cache_type_k',
    'cache_type_v',
    'flash_attn_type',
    'no_extra_bufts',
    'use_mmap',
    'n_threads',
  ];
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (cellParams[k] !== undefined) {
      out[k] = cellParams[k];
    }
  }
  return out;
}

/**
 * `n_gpu_layers` and `devices` together control which backend ggml dispatches
 * to. The runner sets them per cell based on `backend`. Without this snapshot
 * + per-cell pin, persisted state from a prior session can leak: e.g. a
 * previous Hexagon run leaves `n_gpu_layers=99` in MMKV; a later cell with
 * `requested_backend='cpu'` sets `devices=['CPU']` but inherits `n_gpu_layers=99`,
 * and ggml routes the model through Hexagon anyway because the Hexagon
 * backend is registered (observed on Snapdragon 8 Elite Gen 5).
 */
/**
 * Map a cell's `backend` to its concrete (`devices`, `n_gpu_layers`) slot.
 * Both fields are pinned per cell; pinning `n_gpu_layers` is required
 * because `devices=['CPU']` alone does NOT prevent ggml from routing
 * layers to other registered backends when `n_gpu_layers > 0` — verified
 * on Snapdragon 8 Elite Gen 5 where `devices=['CPU']` + `n_gpu_layers=99`
 * + Hexagon registered results in full Hexagon offload.
 *
 * Caller MUST gate `gpu` / `hexagon` on the corresponding device-options
 * being available (see GPU/Hexagon pre-checks in `runMatrix`).
 */
function backendSlot(
  backend: Backend,
  adrenoDevices: string[] | null,
  hexagonDevices: string[] | null,
): {devices: string[]; n_gpu_layers: number} {
  if (backend === 'cpu') {
    return {devices: ['CPU'], n_gpu_layers: 0};
  }
  if (backend === 'gpu') {
    return {devices: adrenoDevices as string[], n_gpu_layers: 99};
  }
  return {devices: hexagonDevices as string[], n_gpu_layers: 99};
}

/**
 * Fingerprint canonical-form key list (WHAT 4d.1 — fixed contract).
 * Adding a knob here is a fingerprint-version bump.
 */
export const FINGERPRINT_KEYS: readonly SettingsKnob[] = [
  'cache_type_k',
  'cache_type_v',
  'flash_attn_type',
  'no_extra_bufts',
  'use_mmap',
  'n_threads',
];

/**
 * Reserved literal that distinguishes "no settings sweep was active"
 * from "the canonicalised default fingerprint happens to match"
 * (WHAT D7). Minted only by `buildSuccessFingerprint` /
 * `buildFailureFingerprint` when the cell came from a no-axes config
 * with empty overrides — and by the v1.0->v1.1 migration script for
 * legacy rows.
 */
export const APP_DEFAULT_FINGERPRINT = 'app-default';

/**
 * Canonicalise an init_settings-shaped record into the deterministic
 * fingerprint string. WHAT 4d.1-4:
 *   1. Iterate FINGERPRINT_KEYS in fixed order.
 *   2. Missing keys -> literal '-' (covers iOS's omitted no_extra_bufts).
 *   3. Coerce: bool -> 'true'|'false', number -> decimal string,
 *      string -> as-is lowercased.
 *   4. Join 'key=value' pairs with ';'.
 *
 * Pure: no closure capture, no mutation of input. Exported for unit
 * tests so the WHAT 4d examples can be byte-equality asserted.
 */
export function canonicaliseFingerprint(
  record: Record<string, unknown> | PreRunSnapshot,
): string {
  const parts: string[] = [];
  for (const key of FINGERPRINT_KEYS) {
    const v = (record as Record<string, unknown>)[key];
    let coerced: string;
    if (v === undefined || v === null) {
      coerced = '-';
    } else if (typeof v === 'boolean') {
      coerced = v ? 'true' : 'false';
    } else if (typeof v === 'number') {
      coerced = String(v);
    } else {
      coerced = String(v).toLowerCase();
    }
    parts.push(`${key}=${coerced}`);
  }
  return parts.join(';');
}

/**
 * Build the fingerprint for the success path (or post-init failure
 * path, WHAT 9d). Reads from the post-init snapshot — the source of
 * truth for what the engine actually applied.
 *
 * Special case (WHAT D7, I2): when the cell came from a no-axes
 * config AND overrides are empty, return the reserved
 * `app-default` literal regardless of the canonicalised content. This
 * keeps the legacy migration story (D8) from minting indistinguishable
 * fingerprints from explicit "swept and landed on defaults" cells.
 */
export function buildSuccessFingerprint(
  postInitSnapshot: Record<string, unknown>,
  hadAxesInConfig: boolean,
  isEmptyOverrides: boolean,
): string {
  if (!hadAxesInConfig && isEmptyOverrides) {
    return APP_DEFAULT_FINGERPRINT;
  }
  return canonicaliseFingerprint(postInitSnapshot);
}

/**
 * Build the fingerprint for the pre-init failure path (WHAT 9c, I3
 * exception (b)). Constructed from the matrix-level pre-run snapshot
 * (4c.1) overlaid with the cell's requested overrides — no constraint
 * replay (no setter calls); the spread is mechanical so the result is
 * reproducible without re-running setter logic.
 *
 * Result is prefixed `req:` to mark "derived from intent + pre-run
 * snapshot, not from applied state." The reserved `app-default`
 * literal is still minted in the no-axes-empty-overrides case so a
 * failed `app-default` cell still buckets correctly with its
 * successful peers (WHAT 6.C).
 */
export function buildFailureFingerprint(
  preRunSnapshot: PreRunSnapshot,
  requestedOverrides: SettingsOverrides,
  hadAxesInConfig: boolean,
): string {
  if (!hadAxesInConfig && Object.keys(requestedOverrides).length === 0) {
    return APP_DEFAULT_FINGERPRINT;
  }
  const merged = {...preRunSnapshot, ...requestedOverrides};
  return 'req:' + canonicaliseFingerprint(merged);
}

/**
 * Run the matrix. Pure-async, takes setStatus as a parameter so that unit
 * tests can drive the state machine without a real React tree.
 *
 * Side effects:
 *   - Updates the screen's status string at every transition.
 *   - Writes the report JSON file after every cell (append-as-you-go).
 *   - Calls modelStore.setDevices / initContext / context.bench / releaseContext.
 *
 * Per-cell error containment: a throw in cell N is captured into the row,
 * status is set to error:<msg>, but the loop continues to cell N+1.
 */
export async function runMatrix(
  config: BenchConfig,
  setStatus: (s: Status) => void,
  setLastCell: (c: {pp?: number; tg?: number; cells?: number}) => void,
): Promise<void> {
  const bench = config.bench ?? DEFAULT_BENCH;
  // Resolve inter-cell settle once per matrix. Validates: must be a finite
  // non-negative number; anything else falls back to the default rather
  // than throwing — keeps the matrix robust to a typo'd config value
  // (e.g. "30000" string instead of 30000 number).
  const interCellSettleMs =
    typeof config.inter_cell_settle_ms === 'number' &&
    Number.isFinite(config.inter_cell_settle_ms) &&
    config.inter_cell_settle_ms >= 0
      ? config.inter_cell_settle_ms
      : DEFAULT_INTER_CELL_SETTLE_MS;
  const hadAxesInConfig = !!(
    config.settings_axes && config.settings_axes.length > 0
  );

  // Resolve the device-appropriate thread count ONCE for the matrix.
  // `getRecommendedThreadCount()` is a pure utility (no modelStore
  // coupling), so the bench's base stays isolated from the user's
  // persisted Settings while still picking a sensible per-device
  // default (80% of cores when >4, otherwise all cores).
  const recommendedThreads = await getRecommendedThreadCount();
  const benchBase: BenchBaseParams = {
    ...DEFAULT_BENCH_BASE_PARAMS,
    n_threads: recommendedThreads,
  };

  // Matrix-level fingerprint snapshot (WHAT 4c.1). Derived from the
  // bench's own base — NOT from `modelStore.contextInitParams` — so the
  // fingerprint reflects what the bench would have run, independent of
  // whatever the user has in Settings.
  const preRunSnapshot = snapshotFingerprintKeys(benchBase);

  // Resolve the GPU and Hexagon device sets ONCE at run start. Reuses the
  // canonical helper (`getDeviceOptions` from src/utils/deviceSelection.ts)
  // instead of duplicating the getBackendDevicesInfo() filter logic.
  // Cells with backend:'gpu' fail fast (status:'failed') if no GPU option
  // is returned (e.g. supportsOpenCL=false device); same shape for hexagon.
  let adrenoDevices: string[] | null = null;
  let hexagonDevices: string[] | null = null;
  const wantsGpu = config.backends.includes('gpu');
  const wantsHexagon = config.backends.includes('hexagon');
  if (wantsGpu || wantsHexagon) {
    try {
      const opts = await getDeviceOptions();
      if (wantsGpu) {
        const gpu = opts.find(o => o.id === 'gpu');
        adrenoDevices = gpu?.devices ?? null;
      }
      if (wantsHexagon) {
        const hex = opts.find(o => o.id === 'hexagon');
        hexagonDevices = hex?.devices ?? null;
      }
    } catch {
      adrenoDevices = wantsGpu ? null : adrenoDevices;
      hexagonDevices = wantsHexagon ? null : hexagonDevices;
    }
  }

  // Expand the sweep-axes into per-cell override maps. Empty / absent
  // axes produces `[{}]` — one cell per (model, variant, backend), empty
  // overrides — the only path that mints `app-default` fingerprints
  // (WHAT §2, §4d D7).
  const overridesList = expandAxes(config.settings_axes);

  // Build a flat cell list (4-deep cartesian product per WHAT §2).
  const cells: Array<{
    model: BenchModelEntry;
    variant: BenchVariant;
    backend: Backend;
    overrides: SettingsOverrides;
  }> = [];
  for (const m of config.models) {
    for (const v of m.quants) {
      for (const b of config.backends) {
        for (const overrides of overridesList) {
          cells.push({model: m, variant: v, backend: b, overrides});
        }
      }
    }
  }

  // From here on the runner acquires global state (native logging,
  // benchmark-mode flag, exclusive context ownership). Wrap the entire
  // acquisition+work span in try/finally so a rejection during
  // toggleNativeLog or enterBenchmarkMode can't strand the app with
  // logging on or benchmarkActive=true. Both cleanup calls in the
  // finally are idempotent — safe to call even if their setup
  // counterpart never ran or only partially ran.
  try {
    // Native log capture is global state in llama.rn — flip it on once for
    // the whole matrix. Per-cell scoping is done by attaching a fresh
    // listener around each init+bench window.
    await toggleNativeLog(true).catch(() => undefined);

    // Take exclusive ownership of the native context lifecycle. This:
    //   - Sets `modelStore.benchmarkActive = true` synchronously so any
    //     in-flight or new auto-load (e.g. ChatView's pal-default
    //     selectModel on cold-launch) is gated.
    //   - Releases any context the rest of the app loaded so no stale
    //     LlamaContext occupies the native context list while the matrix
    //     is creating its own.
    // The runner from this point on calls `initLlama` directly per cell;
    // it never touches `modelStore.context` / `modelStore.activeModelId`.
    await modelStore.enterBenchmarkMode();
    const startTimestamp = new Date().toISOString();
    const safeStamp = startTimestamp.replace(/[:.]/g, '-');
    const path = reportPath(safeStamp);
    const report: BenchmarkReport = {
      version: '1.1',
      platform: 'android',
      timestamp: startTimestamp,
      preseeded: true, // pessimistic — flips false on first downloading: transition
      bench,
      inter_cell_settle_ms: interCellSettleMs,
      runs: [],
    };
    // settings_axes_used echoes config.settings_axes only when the run
    // had axes (WHAT 1e, 9a — empty array MUST NOT be emitted).
    if (hadAxesInConfig && config.settings_axes) {
      report.settings_axes_used = config.settings_axes;
    }

    // Write the shell up front so even an early crash leaves a JSON file.
    await RNFS.writeFile(path, JSON.stringify(report, null, 2), 'utf8');

    for (let i = 0; i < cells.length; i++) {
      const {model, variant, backend, overrides} = cells[i];
      const tStart = Date.now();
      // Status `<tag>` extension (WHAT §3, §8 D9): when overrides are
      // non-empty, append a short `key=value;...` summary so the WDIO
      // spec can disambiguate identical (model,quant,backend) cells with
      // different settings. Truncated to 60 chars to keep the polled
      // status string bounded. The summary uses the REQUESTED overrides
      // (not the post-init canonicalised fingerprint) — operators care
      // about what they asked for in the live status.
      const overrideEntries = Object.entries(overrides);
      const tagSuffix =
        overrideEntries.length === 0
          ? ''
          : '/' +
            overrideEntries
              .map(([k, v]) => `${k}=${String(v)}`)
              .join(';')
              .slice(0, 60);
      const tag = `${i + 1}/${cells.length}:${model.id}/${variant.quant}/${backend}${tagSuffix}`;
      setStatus(`running:${tag}`);

      const rowBase: Pick<
        BenchmarkRunRow,
        'model_id' | 'quant' | 'requested_backend' | 'timestamp'
      > = {
        model_id: model.id,
        quant: variant.quant,
        requested_backend: backend,
        timestamp: new Date().toISOString(),
      };

      // Per-cell log buffer + listener handle. Declared outside the try so the
      // catch path can still surface partial signals (and the finally can
      // detach the listener) when a cell throws mid-init.
      const logBuffer: string[] = [];
      let logSub: {remove: () => void} | null = null;
      // The native context the runner owns for this cell. Stored at outer
      // scope so the `finally` block can release it regardless of where in
      // the try body a throw lands. Distinct from `modelStore.context` —
      // the runner never assigns to that.
      let ctx: LlamaContext | null = null;
      // Post-init snapshot, hoisted so the catch path can pick between the
      // standard fingerprint (post-init available) and the `req:`-prefixed
      // fingerprint (pre-init failure). WHAT 9d explicitly requires this
      // hoist as part of the contract. Read by Step 7's fingerprint
      // helpers in the catch block.
      let postInitSnapshot: Record<string, unknown> | null = null;
      let effectiveInitParams: Record<string, unknown> = {};

      try {
        // 1. GPU pre-check: cell fails fast if backend=gpu but no GPU option.
        if (backend === 'gpu' && !adrenoDevices) {
          const row: BenchmarkRunRow = {
            ...rowBase,
            effective_backend: 'unknown',
            pp_avg: null,
            tg_avg: null,
            wall_ms: Date.now() - tStart,
            peak_memory_mb: null,
            log_signals: emptyLogSignals(),
            init_settings: {},
            effective_init_params: {},
            settings_overrides: overrides,
            settings_fingerprint: buildFailureFingerprint(
              preRunSnapshot,
              overrides,
              hadAxesInConfig,
            ),
            status: 'failed',
            error: 'GPU device not available',
          };
          report.runs.push(row);
          await RNFS.writeFile(path, JSON.stringify(report, null, 2), 'utf8');
          continue;
        }

        // 1b. Hexagon pre-check (mirror of GPU): cell fails fast if the
        // device has no Hexagon backend. WHAT 4a.7, I7, 6.C.
        if (backend === 'hexagon' && !hexagonDevices) {
          const row: BenchmarkRunRow = {
            ...rowBase,
            effective_backend: 'unknown',
            pp_avg: null,
            tg_avg: null,
            wall_ms: Date.now() - tStart,
            peak_memory_mb: null,
            log_signals: emptyLogSignals(),
            init_settings: {},
            effective_init_params: {},
            settings_overrides: overrides,
            settings_fingerprint: buildFailureFingerprint(
              preRunSnapshot,
              overrides,
              hadAxesInConfig,
            ),
            status: 'failed',
            error: 'Hexagon device not available',
          };
          report.runs.push(row);
          await RNFS.writeFile(path, JSON.stringify(report, null, 2), 'utf8');
          continue;
        }

        // 2. Resolve / download the model file.
        let resolvedModel = modelStore.models.find(
          (mm: Model) => mm.filename === variant.filename && mm.isDownloaded,
        );
        if (!resolvedModel) {
          report.preseeded = false;
          setStatus(`downloading:${variant.filename}`);
          // Strategy: rely on the existing app download path. The screen
          // pushes a minimal HuggingFaceModel + ModelFile descriptor into
          // modelStore, kicks off the download via downloadHFModel, and
          // polls modelStore.models for isDownloaded=true.
          const hfModel = {
            _id: model.hfModelId,
            id: model.hfModelId,
            author: model.hfModelId.split('/')[0] ?? 'unknown',
            gated: false,
            inference: '',
            lastModified: '',
            likes: 0,
            trendingScore: 0,
            private: false,
            sha: '',
            downloads: 0,
            tags: [],
            library_name: '',
            createdAt: '',
            model_id: model.hfModelId,
            siblings: [{rfilename: variant.filename} as any],
          } as any;
          // url is REQUIRED — hfAsModel reads modelFile.url into model.downloadUrl,
          // and ModelStore.checkSpaceAndDownload early-returns when !downloadUrl,
          // silently never starting the download. Construct the canonical HF
          // resolve URL inline; if the bench-config ever needs a different host
          // (private repo, mirror, etc.) we'd take it from the variant instead.
          // size is REQUIRED — hasEnoughSpace returns false for size <= 0
          // (malformed model), and DownloadManager.startDownload then throws
          // "Not enough storage space". The variant.size from bench-config
          // wins; otherwise fall back to 1 to bypass the pre-check (the actual
          // download will fail late if the device is genuinely full).
          const modelFile = {
            rfilename: variant.filename,
            size: variant.size ?? 1,
            url: `https://huggingface.co/${model.hfModelId}/resolve/main/${variant.filename}`,
          } as any;
          // Clear stale download error so we only observe failures from THIS
          // cell's download. The matrix is serial so one error slot is enough.
          modelStore.clearDownloadError?.();
          await modelStore.downloadHFModel(hfModel, modelFile);
          // Status updates with download progress: poll modelStore.models for
          // the entry and surface percentage. The DownloadManager updates
          // model.progress as bytes arrive; we read it on each poll tick.
          // We also watch modelStore.downloadError so a failed download fails
          // the cell within ~500 ms instead of burning the full 30-min deadline.
          const progressFilename = variant.filename;
          const downloadDeadline = Date.now() + 30 * 60 * 1000;
          while (Date.now() < downloadDeadline) {
            const entry = modelStore.models.find(
              (m: Model) => m.filename === progressFilename,
            );
            if (entry?.isDownloaded) {
              resolvedModel = entry;
              break;
            }
            const dlErr = (modelStore as any).downloadError;
            if (dlErr) {
              const reason =
                dlErr?.message ??
                dlErr?.error?.message ??
                JSON.stringify(dlErr).slice(0, TRUNCATE_ERROR);
              throw new Error(`download-failed:${progressFilename}:${reason}`);
            }
            const pct = entry?.progress ?? 0;
            setStatus(`downloading:${progressFilename} ${Math.round(pct)}%`);
            await new Promise(r => setTimeout(r, 500));
          }
          if (!resolvedModel) {
            throw new Error(`download-timeout:${progressFilename}`);
          }
          setStatus(`running:${tag}`);
        }

        // 3. Compose the literal `ContextParams` for this cell. No store
        //    mutation: per-cell overrides + backend slot land directly in
        //    the dict we hand to `initLlama`. This is the single source of
        //    truth for `init_settings` AND `effective_init_params`.
        const filePath = await modelStore.getModelFullPath(resolvedModel);
        const slot = backendSlot(backend, adrenoDevices, hexagonDevices);
        const cellParams = composeCellParams({
          filePath,
          base: benchBase,
          overrides,
          devices: slot.devices,
          n_gpu_layers: slot.n_gpu_layers,
        });

        // The fingerprint snapshot (and the `init_settings` field) is the
        // composed params projected onto the six fingerprint-eligible
        // knobs. Captured here so a throw in `initLlama` still yields a
        // standard (non-`req:`) fingerprint via `postInitSnapshot`.
        const initSettings = snapshotCellInitSettings(
          cellParams as unknown as Record<string, unknown>,
        );
        postInitSnapshot = initSettings;
        // `effective_init_params` is what hit native, with the model path
        // dropped (operator-private and not load-bearing for analysis).
        effectiveInitParams = Object.fromEntries(
          Object.entries(cellParams).filter(([k]) => k !== 'model'),
        );

        // 4. Attach native-log listener so the cell's load output lands in
        //    `logBuffer`. The `BENCH_LOG_RE` pre-filter keeps the buffer
        //    bounded for long runs.
        logSub = addNativeLogListener((_level, text) => {
          if (BENCH_LOG_RE.test(text)) {
            logBuffer.push(text);
          }
        });

        // 5. Init the native context directly. `initLlama` is the runner's
        //    ONLY native-load entrypoint — `modelStore.initContext` /
        //    `selectModel` are gated by `benchmarkActive` and would throw
        //    if accidentally invoked.
        ctx = await initLlama(cellParams);

        // 6. Validate the actual backend satisfies the requested backend.
        //    Partial offload (cpu+opencl-partial, cpu+hexagon-partial) IS
        //    considered satisfied — the cell landed on the requested
        //    backend, just incompletely. A fundamentally different backend
        //    (e.g. requested gpu, model loaded entirely on CPU) is a hard
        //    failure: under shared-state designs this could silently land
        //    in baselines as `status:ok` with `effective_backend:cpu` —
        //    the redesign disallows that.
        const okSignals = deriveLogSignals(logBuffer);
        const okBackend = deriveEffectiveBackend(okSignals);
        if (!requestSatisfiedBy(backend, okBackend)) {
          throw new Error(`backend-mismatch:${backend}:${okBackend}`);
        }

        // 7. Peak memory tracking.
        let peakMemory: {
          total: number;
          used: number;
          percentage: number;
        } | null = null;
        const memInterval = setInterval(async () => {
          const cur = await trackPeakMemory();
          if (cur && (!peakMemory || cur.percentage > peakMemory.percentage)) {
            peakMemory = cur;
          }
        }, PEAK_POLL_MS);

        let speedPp: number | undefined;
        let speedTg: number | undefined;
        try {
          const benchResult = await ctx.bench(
            bench.pp,
            bench.tg,
            bench.pl,
            bench.nr,
          );
          speedPp = benchResult.speedPp;
          speedTg = benchResult.speedTg;
        } finally {
          clearInterval(memInterval);
        }

        // Invariant: status:'ok' rows must always carry non-null pp_avg and
        // tg_avg. If ctx.bench() resolves with either metric undefined (e.g.
        // partial native failure), force the catch path so the row is recorded
        // as 'failed' with an explanatory error string. Without this, the
        // success-row builder below would write status:'ok' pp_avg:null which
        // makes regressions invisible to the compare script.
        if (speedPp == null || speedTg == null) {
          throw new Error(
            `bench returned null metric(s): speedPp=${speedPp}, speedTg=${speedTg}`,
          );
        }

        const wall = Date.now() - tStart;
        const peakBytes = peakMemory
          ? (peakMemory as {used: number}).used
          : null;
        const row: BenchmarkRunRow = {
          ...rowBase,
          effective_backend: okBackend,
          pp_avg: speedPp,
          tg_avg: speedTg,
          wall_ms: wall,
          peak_memory_mb:
            typeof peakBytes === 'number'
              ? Math.round((peakBytes / (1024 * 1024)) * 100) / 100
              : null,
          log_signals: okSignals,
          init_settings: initSettings,
          effective_init_params: effectiveInitParams,
          settings_overrides: overrides,
          settings_fingerprint: buildSuccessFingerprint(
            initSettings,
            hadAxesInConfig,
            Object.keys(overrides).length === 0,
          ),
          status: 'ok',
        };
        report.runs.push(row);
        await RNFS.writeFile(path, JSON.stringify(report, null, 2), 'utf8');
        setLastCell({
          pp: speedPp,
          tg: speedTg,
          cells: report.runs.length,
        });
      } catch (e) {
        // Salvage whatever load lines we captured before the throw — useful
        // for debugging "why did this cell fail" without re-running. The log
        // listener is detached in the finally block (sole detach site).
        const partialSignals = deriveLogSignals(logBuffer);
        const msg = (e as Error).message ?? 'unknown';
        const short = msg.slice(0, TRUNCATE_ERROR);
        const long = msg.slice(0, TRUNCATE_ROW_ERROR);
        // Fingerprint provenance per WHAT 9c/9d, I3:
        //   - postInitSnapshot null (pre-init failure)  -> req:-prefixed
        //     fingerprint built from pre-run snapshot + requested overrides.
        //   - postInitSnapshot non-null (post-init throw) -> standard
        //     fingerprint from the post-init snapshot, NO 'req:' prefix.
        const fingerprint =
          postInitSnapshot !== null
            ? buildSuccessFingerprint(
                postInitSnapshot,
                hadAxesInConfig,
                Object.keys(overrides).length === 0,
              )
            : buildFailureFingerprint(
                preRunSnapshot,
                overrides,
                hadAxesInConfig,
              );
        const row: BenchmarkRunRow = {
          ...rowBase,
          effective_backend: deriveEffectiveBackend(partialSignals),
          pp_avg: null,
          tg_avg: null,
          wall_ms: Date.now() - tStart,
          peak_memory_mb: null,
          log_signals: partialSignals,
          init_settings: postInitSnapshot ?? {},
          // Hoisted at runMatrix scope so the catch path sees whatever was
          // captured at step 4b. `{}` if the cell threw before 4b ran.
          effective_init_params: effectiveInitParams,
          settings_overrides: overrides,
          settings_fingerprint: fingerprint,
          status: 'failed',
          error: long,
        };
        report.runs.push(row);
        try {
          await RNFS.writeFile(path, JSON.stringify(report, null, 2), 'utf8');
        } catch {
          // best-effort
        }
        // Per-cell failure: use a non-terminal status so the WDIO spec keeps
        // polling until the loop ends with `complete`. `error:` is reserved
        // for fatal runner failures (caught by onRun's outer try/catch).
        // Without this distinction, a single cell failure would make the spec
        // pull a partial report mid-run while the screen is still iterating.
        setStatus(`cell-failed:${i + 1}/${cells.length}:${short}`);
        // continue to the next cell — per-cell error containment.
      } finally {
        // Sole release site for the runner-owned context. If `initLlama`
        // threw, `ctx` stays null and we skip release. If anything between
        // `initLlama` and the success-row throws, the local `ctx` is the
        // only handle to the native context — we MUST release it here or
        // the native context list grows on every failed cell.
        if (ctx) {
          // Lifecycle log lines so logcat (`ReactNativeJS:V`) gives us a
          // timestamped record of release timing per cell. Diagnostic for
          // process-death debugging: pairing alloc-time with release-time
          // lets us tell "release call never fired" from "release call
          // fired but native heap didn't drop". The N/total + tag fields
          // are the same shape as the on-screen status string so reports
          // and logs cross-reference cleanly.
          const releaseStart = Date.now();
          console.log(`[BENCH] cell ${tag}: releasing ctx`);
          try {
            await ctx.release();
            console.log(
              `[BENCH] cell ${tag}: released ctx in ${Date.now() - releaseStart}ms`,
            );
          } catch (e) {
            // Best-effort: a release throwing here doesn't abort the matrix.
            // The next cell creates a fresh context; if the leak persists
            // the cumulative `g_context_limit` check in RNLlamaJSI will
            // surface it as a hard error on a later cell.
            console.log(
              `[BENCH] cell ${tag}: release threw after ${Date.now() - releaseStart}ms: ${String(e)}`,
            );
          }
          // Cells release model weights/KV/compute through the native
          // allocator, which on Android may retain freed pages in its
          // arena rather than returning them to the kernel. Without a
          // purge between cells, RSS climbs across the matrix and the
          // process can be reaped before later cells finish. The rss
          // before/after fields make the effect observable in reports.
          try {
            const purgeStart = Date.now();
            const purgeResult = await NativeHardwareInfo.purgeNativeAllocator();
            const reclaimedKb =
              purgeResult.rss_kb_before - purgeResult.rss_kb_after;
            console.log(
              `[BENCH] cell ${tag}: purge purged=${purgeResult.purged} ` +
                `rss_before_kb=${purgeResult.rss_kb_before} ` +
                `rss_after_kb=${purgeResult.rss_kb_after} ` +
                `reclaimed_kb=${reclaimedKb} ` +
                `wall_ms=${Date.now() - purgeStart}`,
            );
          } catch (e) {
            // Non-fatal — we'd rather continue the matrix than abort
            // because a memory hint failed.
            console.log(`[BENCH] cell ${tag}: purge threw: ${String(e)}`);
          }
          // Inter-cell settle. Two purposes:
          //   1. `ctx.release()` resolves once ~llama_rn_context() returns,
          //      but some backend drivers (Adreno OpenCL command-queue
          //      tear-down on a worker thread, Hexagon HTP FastRPC
          //      teardown) defer their final memory release a few hundred
          //      ms past that boundary. The pre-redesign code carried a
          //      100ms `setTimeout` inside `ModelStore._releaseContextInternal`
          //      — added in response to actual failures, not preemptively.
          //   2. Thermal stabilisation across long matrix runs — operators
          //      tune `config.inter_cell_settle_ms` (default 2000ms) up
          //      to 15-60s when the device is throttling mid-cell.
          // Skipped when ctx is null (cell failed before init) since there
          // is nothing to settle.
          await new Promise(resolve => setTimeout(resolve, interCellSettleMs));
        }
        // Sole listener-detach site. Idempotent: no-op when null.
        logSub?.remove();
        logSub = null;
      }
    }

    setStatus('complete');
  } finally {
    // Outer matrix-level finally: success and failure paths converge here.
    // No "restore settings" step is required — under the isolated
    // lifecycle the runner never wrote to `modelStore.contextInitParams`,
    // so there is nothing to undo. The single side-effect we own is
    // native-log toggle (matrix-scoped) and benchmark-mode (matrix-scoped).
    await toggleNativeLog(false).catch(() => undefined);
    modelStore.exitBenchmarkMode();
  }
}

interface BenchmarkRunnerScreenProps {
  // Test-only seam: lets unit tests replace the runner with a mock to
  // assert single-flight gating and call counts without driving a real
  // matrix. Production code never passes this prop.
  __runner?: typeof runMatrix;
  __loadConfig?: typeof loadConfig;
}

export const BenchmarkRunnerScreen: React.FC<BenchmarkRunnerScreenProps> =
  observer(({__runner, __loadConfig}) => {
    const [status, setStatus] = useState<Status>('idle');
    const [lastCell, setLastCell] = useState<{
      pp?: number;
      tg?: number;
      cells?: number;
    }>({});
    const runningRef = useRef(false);

    const onRun = useCallback(async () => {
      // Single-flight: ignore taps while a run is in progress.
      if (runningRef.current) {
        return;
      }
      if (
        status !== 'idle' &&
        status !== 'complete' &&
        !status.startsWith('error:')
      ) {
        return;
      }
      runningRef.current = true;
      // Runtime reference to the marker constant — protects against Hermes
      // DCE. Without this, the literal would be stripped from the e2e
      // bundle and the CI grep "must be present" check would falsely pass.
      console.log(`[${BENCH_RUN_MATRIX}] starting matrix run`);
      try {
        const cfg = await (__loadConfig ?? loadConfig)();
        await (__runner ?? runMatrix)(cfg, setStatus, setLastCell);
      } catch (e) {
        const msg = (e as Error).message ?? 'unknown';
        setStatus(`error:${msg.slice(0, TRUNCATE_ERROR)}`);
      } finally {
        runningRef.current = false;
      }
    }, [status, __loadConfig, __runner]);

    const onReset = useCallback(() => {
      if (runningRef.current) {
        return;
      }
      setStatus('idle');
      setLastCell({});
    }, []);

    return (
      <ScrollView
        contentContainerStyle={styles.container}
        testID="bench-runner-screen">
        <Text style={styles.title}>Benchmark Matrix Runner</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Status:</Text>
          <Text testID="bench-runner-screen-status" accessibilityLabel={status}>
            {status}
          </Text>
        </View>
        <View
          testID="bench-runner-screen-result-preview"
          style={styles.preview}>
          <Text>Cells completed: {lastCell.cells ?? 0}</Text>
          <Text>Last pp: {lastCell.pp ?? '-'}</Text>
          <Text>Last tg: {lastCell.tg ?? '-'}</Text>
        </View>
        <View style={styles.buttonRow}>
          <Button
            testID="bench-run-button"
            title="Run benchmark matrix"
            onPress={onRun}
          />
        </View>
        <View style={styles.buttonRow}>
          <Button testID="bench-reset-button" title="Reset" onPress={onReset} />
        </View>
      </ScrollView>
    );
  });

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  label: {
    marginRight: 8,
    fontWeight: 'bold',
  },
  preview: {
    marginTop: 12,
    marginBottom: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: '#cccccc',
  },
  buttonRow: {
    marginVertical: 6,
  },
});
