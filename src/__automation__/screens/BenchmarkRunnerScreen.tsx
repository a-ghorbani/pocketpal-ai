import React, {useCallback, useRef, useState} from 'react';
import {Button, ScrollView, StyleSheet, Text, View} from 'react-native';
import RNDeviceInfo from 'react-native-device-info';
import {addNativeLogListener, toggleNativeLog} from 'llama.rn';
import {observer} from 'mobx-react';

import {modelStore} from '../../store';
import {getDeviceOptions} from '../../utils/deviceSelection';
import type {Model} from '../../utils/types';
import {
  BENCH_LOG_RE,
  deriveEffectiveBackend,
  deriveLogSignals,
  emptyLogSignals,
  type LogSignals,
} from '../logSignals';

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

type Status = string; // 'idle' | 'downloading:<f>' | 'running:<i/n>:<...>' | 'complete' | 'error:<msg>'

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
  /** Echo of `config.settings_axes` when the run had axes. Omitted when the
   * config had none (WHAT §1e, §9a — empty array MUST NOT be emitted). */
  settings_axes_used?: SettingsAxis[];
  runs: BenchmarkRunRow[];
}

const DEFAULT_BENCH = {pp: 512, tg: 128, pl: 1, nr: 3};
const TRUNCATE_ERROR = 200; // status string error length
const TRUNCATE_ROW_ERROR = 500; // row.error length
const PEAK_POLL_MS = 1000;

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
 * Snapshot the matrix-level pre-run state of the six fingerprint knobs
 * from `modelStore.contextInitParams`. Used as the fixed point for
 * restoration (4c.3) and the pre-init failure-path fingerprint
 * construction (9c).
 *
 * Reads from `contextInitParams` directly (operator-facing values,
 * preserving e.g. `use_mmap='smart'`) — NOT from
 * `getEffectiveContextInitParams(filePath)` which resolves smart-mmap
 * to a concrete boolean dependent on file state. WHAT 4d explicitly
 * pins the fingerprint to operator intent over engine-effective
 * resolution.
 *
 * Keys missing on the current platform (e.g. iOS `no_extra_bufts`)
 * stay missing in the result, so the canonicaliser later writes `"-"`
 * for them.
 */
function snapshotFingerprintKeys(): PreRunSnapshot {
  const params = modelStore.contextInitParams as unknown as Record<
    string,
    unknown
  >;
  const snapshot: PreRunSnapshot = {};
  const keys: SettingsKnob[] = [
    'cache_type_k',
    'cache_type_v',
    'flash_attn_type',
    'no_extra_bufts',
    'use_mmap',
    'n_threads',
  ];
  for (const k of keys) {
    const v = params[k];
    if (v !== undefined) {
      snapshot[k] = v as SettingsValue;
    }
  }
  return snapshot;
}

/**
 * Apply the cell's settings overrides via the existing `modelStore.setX`
 * setters (WHAT 4c.2, I4 — no direct mutation of `contextInitParams`).
 *
 * Apply order rationale: `flash_attn_type` is applied BEFORE the
 * cache-type setters because:
 *   - When the requested `flash_attn_type` is `'auto'` or `'on'`, the
 *     cache-type setters take effect (the requested override lands as
 *     expected).
 *   - When the requested `flash_attn_type` is `'off'`, `setCacheTypeK/V`
 *     no-op silently (WHAT §4e). Applying flash_attn first makes that
 *     no-op correctly attributable to the declared intent rather than
 *     to stale state from a prior cell.
 *
 * The silent no-op is documented expected behaviour (WHAT D11). It
 * surfaces in the report as a divergence between `settings_overrides`
 * (the request) and `init_settings` (the post-init reality), which the
 * operator can inspect.
 */
function applySettingsOverrides(overrides: SettingsOverrides): void {
  if (overrides.flash_attn_type !== undefined) {
    modelStore.setFlashAttnType(
      overrides.flash_attn_type as 'auto' | 'on' | 'off',
    );
  }
  if (overrides.cache_type_k !== undefined) {
    // CacheType is a string-valued enum; runtime value already validated
    // at config-build time (Step 3 / WHAT 4b.4).
    modelStore.setCacheTypeK(overrides.cache_type_k as never);
  }
  if (overrides.cache_type_v !== undefined) {
    modelStore.setCacheTypeV(overrides.cache_type_v as never);
  }
  if (overrides.no_extra_bufts !== undefined) {
    modelStore.setNoExtraBufts(overrides.no_extra_bufts as boolean);
  }
  if (overrides.use_mmap !== undefined) {
    modelStore.setUseMmap(overrides.use_mmap as 'true' | 'false' | 'smart');
  }
  if (overrides.n_threads !== undefined) {
    modelStore.setNThreads(overrides.n_threads as number);
  }
}

/**
 * Restore the matrix-level pre-run snapshot using the same setters
 * (WHAT 4c.3, I5 — restore runs on every exit path). Best-effort:
 * a single setter throwing does NOT mask the matrix's own outcome.
 *
 * Apply order matches `applySettingsOverrides` (`flash_attn_type`
 * first) so the restore deterministically lands the snapshot values
 * regardless of the current (post-cell) state.
 */
function restoreSettingsSnapshot(snapshot: PreRunSnapshot): void {
  const trySet = (fn: () => void): void => {
    try {
      fn();
    } catch {
      // Restore is best-effort; one setter failing does not abort the
      // others. The next run's apply phase will normalise state again.
    }
  };
  if (snapshot.flash_attn_type !== undefined) {
    trySet(() =>
      modelStore.setFlashAttnType(
        snapshot.flash_attn_type as 'auto' | 'on' | 'off',
      ),
    );
  }
  if (snapshot.cache_type_k !== undefined) {
    trySet(() => modelStore.setCacheTypeK(snapshot.cache_type_k as never));
  }
  if (snapshot.cache_type_v !== undefined) {
    trySet(() => modelStore.setCacheTypeV(snapshot.cache_type_v as never));
  }
  if (snapshot.no_extra_bufts !== undefined) {
    trySet(() =>
      modelStore.setNoExtraBufts(snapshot.no_extra_bufts as boolean),
    );
  }
  if (snapshot.use_mmap !== undefined) {
    trySet(() =>
      modelStore.setUseMmap(snapshot.use_mmap as 'true' | 'false' | 'smart'),
    );
  }
  if (snapshot.n_threads !== undefined) {
    trySet(() => modelStore.setNThreads(snapshot.n_threads as number));
  }
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
  const hadAxesInConfig = !!(
    config.settings_axes && config.settings_axes.length > 0
  );

  // Matrix-level pre-run snapshot (WHAT 4c.1). Captured ONCE before the
  // first cell — the fixed point used for both restoration (4c.3) and
  // the pre-init failure-path fingerprint construction (9c).
  const preRunSnapshot = snapshotFingerprintKeys();

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

  // Native log capture is global state in llama.rn — flip it on once for the
  // whole matrix and toggle off in the outer finally so an unexpected throw
  // anywhere in the loop body doesn't leave native logging on for the rest
  // of the app session. Per-cell scoping is done by attaching a fresh
  // listener around each init+bench window.
  await toggleNativeLog(true).catch(() => undefined);
  try {
    const startTimestamp = new Date().toISOString();
    const safeStamp = startTimestamp.replace(/[:.]/g, '-');
    const path = reportPath(safeStamp);
    const report: BenchmarkReport = {
      version: '1.1',
      platform: 'android',
      timestamp: startTimestamp,
      preseeded: true, // pessimistic — flips false on first downloading: transition
      bench,
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
      // Tracks whether modelStore.initContext resolved for this cell. The
      // finally block uses this to call releaseContext exactly once per
      // initialized cell, regardless of whether bench() then threw.
      let contextInitialized = false;
      // Post-init snapshot, hoisted so the catch path can pick between the
      // standard fingerprint (post-init available) and the `req:`-prefixed
      // fingerprint (pre-init failure). WHAT 9d explicitly requires this
      // hoist as part of the contract. Read by Step 7's fingerprint
      // helpers in the catch block.
      let postInitSnapshot: Record<string, unknown> | null = null;

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

        // 3. Apply the cell's settings overrides via existing setters
        //    (WHAT 4c.2, I4). Done AFTER GPU/Hexagon pre-check and AFTER
        //    model resolve/download (which can take 30 min) so the window
        //    where stale settings are visible is minimised if the run
        //    aborts.
        applySettingsOverrides(overrides);

        // 4. Programmatic tier switch (CPU / GPU / Hexagon device set).
        let cellDevices: string[];
        if (backend === 'cpu') {
          cellDevices = ['CPU'];
        } else if (backend === 'gpu') {
          cellDevices = adrenoDevices as string[];
        } else {
          // hexagon — pre-check above guarantees hexagonDevices is non-null.
          cellDevices = hexagonDevices as string[];
        }
        modelStore.setDevices(cellDevices);

        // 4a. Attach native-log listener so the cell's load output (the same
        // lines that show up in `adb logcat`) lands in `logBuffer`. The
        // BENCH_LOG_RE pre-filter keeps the buffer bounded for long runs.
        logSub = addNativeLogListener((_level, text) => {
          if (BENCH_LOG_RE.test(text)) {
            logBuffer.push(text);
          }
        });

        // 5. Init context (mutex-serialized inside ModelStore).
        await modelStore.initContext(resolvedModel);
        contextInitialized = true;

        // 6. Snapshot init settings AFTER initContext (they may have been
        // touched by initContext's quant-aware tweaks). Captured into the
        // hoisted `postInitSnapshot` so the catch path can also build a
        // standard (non-`req:`) fingerprint when initContext succeeded
        // but bench() later threw (WHAT §9d).
        const initSettings = JSON.parse(
          JSON.stringify(modelStore.contextInitParams),
        );

        postInitSnapshot = initSettings;

        // 6. Peak memory tracking.
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
          const ctx = modelStore.context;
          if (!ctx) {
            throw new Error('context-not-initialized');
          }
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

        // Derive backend evidence from the cell's load output. The log
        // listener is detached in the finally block (sole detach site).
        const logSignals = deriveLogSignals(logBuffer);
        const effectiveBackend = deriveEffectiveBackend(logSignals);

        const wall = Date.now() - tStart;
        const peakBytes = peakMemory
          ? (peakMemory as {used: number}).used
          : null;
        const row: BenchmarkRunRow = {
          ...rowBase,
          effective_backend: effectiveBackend,
          pp_avg: speedPp,
          tg_avg: speedTg,
          wall_ms: wall,
          peak_memory_mb:
            typeof peakBytes === 'number'
              ? Math.round((peakBytes / (1024 * 1024)) * 100) / 100
              : null,
          log_signals: logSignals,
          init_settings: initSettings,
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
        // Sole release site: cells that finished initContext (success path or
        // any throw afterwards) release exactly once. Cells that threw before
        // initContext resolved (e.g. download-timeout, GPU pre-check) skip
        // release because there is no context to release.
        if (contextInitialized) {
          try {
            await (modelStore as any).releaseContext?.();
          } catch {
            // releaseContext throwing should not abort the matrix; the next
            // cell's initContext will tear down the stale context anyway.
          }
        }
        // Sole listener-detach site. Idempotent: no-op when null.
        logSub?.remove();
        logSub = null;
      }
    }

    setStatus('complete');
  } finally {
    // Outer matrix-level finally: success and failure paths converge here.
    // Order: log toggle off -> restore snapshot. Both wrapped so neither
    // blocks the other (WHAT 4c.3, I5: restore runs on every exit path).
    await toggleNativeLog(false).catch(() => undefined);
    try {
      restoreSettingsSnapshot(preRunSnapshot);
    } catch {
      // Per WHAT 4c.3, restore is best-effort; a restore failure does not
      // re-fail the matrix.
    }
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
