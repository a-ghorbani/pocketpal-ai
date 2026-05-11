/**
 * Merge a directory of raw benchmark-report JSONs into a single canonical
 * device baseline.
 *
 *   - Dedupes runs across files: latest timestamp per (model_id, quant,
 *     requested_backend) wins.
 *   - Filters out a configurable list of stale model_ids (e.g. when a
 *     fixture entry is replaced — `lfm2-1.2b` → `lfm2.5-1.2b-instruct`).
 *   - Sorts runs deterministically by (model_id, quant, backend) so the
 *     baseline diff stays readable across re-baselines.
 *   - Overrides top-level metadata fields (commit, llama_rn_version,
 *     device, soc) from CLI args / local environment, since the on-device
 *     report writer doesn't populate them yet.
 *
 * Usage:
 *   npx ts-node scripts/merge-bench-reports.ts \
 *     --input '/tmp/poco-bench/files/benchmark-report-*.json' \
 *     --out ../e2e/baselines/benchmark/poco-myron.json \
 *     --device 'POCO X9 Pro Myron' \
 *     --soc 'Snapdragon 8 Elite Gen 5' \
 *     --commit "$(git rev-parse --short HEAD)" \
 *     --drop-models lfm2-1.2b
 */

import * as fs from 'fs';
import * as path from 'path';

import {deriveLogSignals} from '../../src/__automation__/logSignals';

/**
 * Tiny glob shim — supports `<dir>/<prefix>*<suffix>` of one segment, which
 * is all the merge script ever needs. Avoids depending on the transitive
 * `glob` package.
 */
function expandGlob(pattern: string): string[] {
  const star = pattern.lastIndexOf('*');
  if (star < 0) {
    return fs.existsSync(pattern) ? [pattern] : [];
  }
  const dir = path.dirname(pattern.slice(0, star) + 'x');
  const base = path.basename(pattern);
  const [prefix, suffix] = base.split('*');
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir)
    .filter(f => f.startsWith(prefix ?? '') && f.endsWith(suffix ?? ''))
    .map(f => path.join(dir, f));
}

interface RunRow {
  model_id: string;
  quant: string;
  requested_backend: 'cpu' | 'gpu' | 'hexagon';
  effective_backend: string;
  pp_avg: number | null;
  tg_avg: number | null;
  wall_ms: number;
  peak_memory_mb: number | null;
  log_signals: Record<string, unknown>;
  init_settings: Record<string, unknown>;
  /** WHAT v1.1 row identity: the fourth axis of the dedupe key. v1.0
   * inputs lack this field and must be migrated before merging. */
  settings_fingerprint?: string;
  /** WHAT v1.1 row identity: what the cell asked for. */
  settings_overrides?: Record<string, unknown>;
  status: string;
  error?: string;
  reason?: string;
  timestamp: string;
}

interface SettingsAxis {
  name: string;
  values: Array<string | number | boolean>;
}

interface BenchParams {
  pp: number;
  tg: number;
  pl: number;
  nr: number;
}

interface RawReport {
  version?: string;
  device?: string | null;
  soc?: string | null;
  commit?: string | null;
  llama_rn_version?: string | null;
  platform?: string;
  os_version?: string | null;
  timestamp?: string;
  preseeded?: boolean;
  bench?: BenchParams;
  /** Echo of the run's `config.settings_axes` when axes were set
   * (WHAT 1e, 4f.5). Absent on legacy v1.0 reports and on v1.1 reports
   * that ran with no sweep. */
  settings_axes_used?: SettingsAxis[];
  runs: RunRow[];
}

interface BaselineReport extends RawReport {
  generated_by: 'merge-bench-reports';
  source_files: string[];
}

interface Args {
  input: string;
  out: string;
  device?: string;
  soc?: string;
  commit?: string;
  llamaRnVersion?: string;
  osVersion?: string;
  dropModels: string[];
}

function parseArgs(argv: string[]): Args {
  const out: Args = {input: '', out: '', dropModels: []};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--input') {
      out.input = argv[++i];
    } else if (a === '--out') {
      out.out = argv[++i];
    } else if (a === '--device') {
      out.device = argv[++i];
    } else if (a === '--soc') {
      out.soc = argv[++i];
    } else if (a === '--commit') {
      out.commit = argv[++i];
    } else if (a === '--llama-rn-version') {
      out.llamaRnVersion = argv[++i];
    } else if (a === '--os-version') {
      out.osVersion = argv[++i];
    } else if (a === '--drop-models') {
      out.dropModels = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    } else if (a === '--help' || a === '-h') {
      printHelpAndExit();
    } else {
      console.error(`Unknown arg: ${a}`);
      printHelpAndExit(1);
    }
  }
  if (!out.input || !out.out) {
    console.error('--input and --out are required');
    printHelpAndExit(1);
  }
  return out;
}

function printHelpAndExit(code = 0): never {
  console.log(`
Usage: npx ts-node scripts/merge-bench-reports.ts \\
  --input <glob>               raw report files (e.g. '/tmp/foo/*.json')
  --out <path>                 baseline output path
  [--device <name>]            override top-level device label
  [--soc <name>]               override top-level soc label
  [--commit <sha>]             override top-level commit
  [--llama-rn-version <v>]     override llama.rn version
  [--os-version <v>]           override OS version
  [--drop-models id1,id2]      drop runs whose model_id matches
`);
  process.exit(code);
}

function rowKey(r: RunRow): string {
  // WHAT 4f.1: dedupe key extends to the settings fingerprint so multiple
  // sweep configurations coexist in one baseline. The merger refuses to
  // accept rows without a fingerprint when the report version is 1.1
  // (I1); for v1.0 inputs the merger refuses up front (I8) before this
  // function ever runs.
  return `${r.model_id}::${r.quant}::${r.requested_backend}::${
    r.settings_fingerprint ?? 'app-default'
  }`;
}

function preferLatest(a: RunRow, b: RunRow): RunRow {
  // Prefer status:'ok' over failures, then prefer the most recent timestamp.
  if (a.status === 'ok' && b.status !== 'ok') {
    return a;
  }
  if (b.status === 'ok' && a.status !== 'ok') {
    return b;
  }
  return Date.parse(a.timestamp) >= Date.parse(b.timestamp) ? a : b;
}

function compareRuns(a: RunRow, b: RunRow): number {
  if (a.model_id !== b.model_id) {
    return a.model_id < b.model_id ? -1 : 1;
  }
  if (a.quant !== b.quant) {
    return a.quant < b.quant ? -1 : 1;
  }
  if (a.requested_backend !== b.requested_backend) {
    return a.requested_backend < b.requested_backend ? -1 : 1;
  }
  // WHAT 4f.4: tie-break on fingerprint after backend so baseline diffs
  // stay stable when multiple cells share (model,quant,backend).
  const fa = a.settings_fingerprint ?? '';
  const fb = b.settings_fingerprint ?? '';
  if (fa !== fb) {
    return fa < fb ? -1 : 1;
  }
  return 0;
}

/**
 * Re-derive structured signals from the row's `raw_matches` before strip.
 *
 * Why: when we add a new structured field to logSignals (e.g.
 * `memory_buffers`), older raw reports can backfill it on merge — re-running
 * the parser populates the new field without re-running cells on device.
 * Caveat: `raw_matches` is gated by `BENCH_LOG_RE` at capture time, so the
 * backfill only works if the new field's source lines were already matched
 * by the regex in the run that produced the report. Adding a new field
 * whose source lines were NOT in the old regex requires either widening
 * `BENCH_LOG_RE` AND re-capturing on device, or accepting empty backfill
 * for legacy reports.
 *
 * No-op when raw_matches is absent or empty (legacy reports already
 * stripped, or cells that failed before any log line landed). The row's
 * existing structured fields are overwritten by the parser output — the
 * source-of-truth is always `raw_matches`, structured fields are a cache.
 */
function rederiveLogSignals(r: RunRow): RunRow {
  const ls = r.log_signals as Record<string, unknown> | undefined;
  if (!ls || !Array.isArray(ls.raw_matches) || ls.raw_matches.length === 0) {
    return r;
  }
  const fresh = deriveLogSignals(ls.raw_matches as string[]);
  return {...r, log_signals: fresh as unknown as Record<string, unknown>};
}

/**
 * `log_signals.raw_matches` is debug context (the first ~200 captured native
 * log lines) — useful for one-off investigation, not for a versioned
 * baseline. Stripping it keeps baseline diffs readable. Always called
 * AFTER `rederiveLogSignals`, never before.
 */
function stripRawMatches(r: RunRow): RunRow {
  const ls = r.log_signals as Record<string, unknown> | undefined;
  if (!ls || !Array.isArray(ls.raw_matches)) {
    return r;
  }
  return {...r, log_signals: {...ls, raw_matches: []}};
}

function benchKey(b: BenchParams): string {
  return `pp=${b.pp},tg=${b.tg},pl=${b.pl},nr=${b.nr}`;
}

/**
 * Merged baselines must carry a single `bench` block matching the protocol
 * the benchmark-compare script will check against future reports. Inputs
 * with disagreeing bench params cannot be merged into one baseline because
 * pp/tg numbers are not comparable across protocols.
 *
 * Returns null if no input report has a `bench` block (legacy / pre-v1.1).
 * Throws if two input reports have different bench params.
 */
function reconcileBench(reports: RawReport[]): BenchParams | null {
  let resolved: BenchParams | null = null;
  let resolvedKey: string | null = null;
  for (const rep of reports) {
    if (!rep.bench) {
      continue;
    }
    const key = benchKey(rep.bench);
    if (resolvedKey === null) {
      resolved = rep.bench;
      resolvedKey = key;
    } else if (key !== resolvedKey) {
      throw new Error(
        `inconsistent bench params across input reports: ${resolvedKey} vs ${key}`,
      );
    }
  }
  return resolved;
}

/**
 * Merge two settings_axes_used lists across input reports (WHAT 4f.5).
 * Same axis name in two inputs -> union of values; values keep
 * first-seen order (env-var order from the earlier input, then any new
 * values appended). Axis declaration order across inputs follows the
 * first input that declared each axis.
 */
function mergeAxesUsed(
  reports: RawReport[],
): SettingsAxis[] | undefined {
  const merged = new Map<string, SettingsAxis>();
  let anyHadAxes = false;
  for (const rep of reports) {
    if (!rep.settings_axes_used || rep.settings_axes_used.length === 0) {
      continue;
    }
    anyHadAxes = true;
    for (const axis of rep.settings_axes_used) {
      const prior = merged.get(axis.name);
      if (!prior) {
        merged.set(axis.name, {name: axis.name, values: [...axis.values]});
      } else {
        for (const v of axis.values) {
          if (!prior.values.includes(v)) {
            prior.values.push(v);
          }
        }
      }
    }
  }
  return anyHadAxes ? Array.from(merged.values()) : undefined;
}

export function mergeReports(
  reports: RawReport[],
  drop: Set<string>,
): {
  runs: RunRow[];
  latestTimestamp: string | null;
  bench: BenchParams | null;
  settings_axes_used: SettingsAxis[] | undefined;
  version: string;
} {
  // WHAT 4f.2 / 4h I8: refuse to merge inputs that mix v1.0 and v1.1.
  // The version mismatch check fires BEFORE row dedupe so a malformed
  // mix is surfaced as a single error, not as silent fingerprint loss.
  const versions = new Set(reports.map(r => r.version ?? '1.0'));
  if (versions.size > 1) {
    throw new Error(
      `inconsistent baseline versions: ${[...versions].join(
        ',',
      )}; run migrate-baseline-v1-to-v1_1 first`,
    );
  }
  const version = (versions.values().next().value as string) ?? '1.0';

  // WHAT 4h I1: every v1.1 row MUST carry non-null settings_fingerprint
  // and settings_overrides. Surfacing this here (rather than letting
  // rowKey silently fall back to 'app-default' under undefined) keeps a
  // malformed v1.1 input from polluting the baseline.
  if (version === '1.1') {
    for (const rep of reports) {
      for (const r of rep.runs ?? []) {
        if (
          typeof r.settings_fingerprint !== 'string' ||
          r.settings_overrides === undefined ||
          r.settings_overrides === null
        ) {
          throw new Error(
            `row missing settings_fingerprint/settings_overrides — input is malformed (model_id=${r.model_id}, quant=${r.quant})`,
          );
        }
      }
    }
  }

  const byKey = new Map<string, RunRow>();
  let latestTimestamp: string | null = null;
  for (const rep of reports) {
    if (rep.timestamp) {
      if (!latestTimestamp || rep.timestamp > latestTimestamp) {
        latestTimestamp = rep.timestamp;
      }
    }
    for (const r of rep.runs ?? []) {
      if (drop.has(r.model_id)) {
        continue;
      }
      const key = rowKey(r);
      const prior = byKey.get(key);
      byKey.set(key, prior ? preferLatest(prior, r) : r);
    }
  }
  return {
    runs: Array.from(byKey.values())
      .map(rederiveLogSignals)
      .map(stripRawMatches)
      .sort(compareRuns),
    latestTimestamp,
    bench: reconcileBench(reports),
    settings_axes_used: mergeAxesUsed(reports),
    version,
  };
}

function pickFirst<T>(reports: RawReport[], field: keyof RawReport): T | null {
  for (const rep of reports) {
    const v = rep[field];
    if (v !== null && v !== undefined && v !== '') {
      return v as T;
    }
  }
  return null;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = expandGlob(args.input).sort();
  if (files.length === 0) {
    console.error(`No files matched: ${args.input}`);
    process.exit(1);
  }
  console.error(`merging ${files.length} report(s):`);
  for (const f of files) {
    console.error(`  - ${path.relative(process.cwd(), f)}`);
  }

  const reports: RawReport[] = files.map(f =>
    JSON.parse(fs.readFileSync(f, 'utf8')),
  );
  const drop = new Set(args.dropModels);
  const {runs, latestTimestamp, bench, settings_axes_used, version} =
    mergeReports(reports, drop);

  const baseline: BaselineReport = {
    // mergeReports already enforced single-version (I8); use its return
    // value rather than pickFirst.
    version,
    device: args.device ?? pickFirst<string>(reports, 'device') ?? null,
    soc: args.soc ?? pickFirst<string>(reports, 'soc') ?? null,
    commit: args.commit ?? pickFirst<string>(reports, 'commit') ?? null,
    llama_rn_version:
      args.llamaRnVersion ??
      pickFirst<string>(reports, 'llama_rn_version') ??
      null,
    platform: pickFirst<string>(reports, 'platform') ?? 'android',
    os_version:
      args.osVersion ?? pickFirst<string>(reports, 'os_version') ?? null,
    timestamp: latestTimestamp ?? new Date().toISOString(),
    preseeded: false,
    // Only set `bench` when at least one input report carried it. Omitting
    // the field on legacy merges keeps downstream graceful-degrade paths
    // (benchmark-compare warns and skips the protocol-mismatch gate when
    // either side lacks `bench`).
    ...(bench ? {bench} : {}),
    // WHAT 4f.5: include settings_axes_used as the union of input axes
    // when any input had them.
    ...(settings_axes_used ? {settings_axes_used} : {}),
    runs,
    generated_by: 'merge-bench-reports',
    source_files: files.map(f => path.basename(f)),
  };

  fs.mkdirSync(path.dirname(args.out), {recursive: true});
  fs.writeFileSync(args.out, JSON.stringify(baseline, null, 2) + '\n');
  console.error(`\nwrote ${args.out}`);
  console.error(`  runs: ${runs.length}`);
  console.error(`  device: ${baseline.device}`);
  console.error(`  commit: ${baseline.commit}`);
  console.error(`  llama_rn_version: ${baseline.llama_rn_version}`);
  if (bench) {
    console.error(`  bench: ${benchKey(bench)}`);
  } else {
    console.error(
      '  bench: (omitted — no input report carried bench params; legacy merge)',
    );
  }
  if (drop.size > 0) {
    console.error(`  dropped model_ids: ${[...drop].join(', ')}`);
  }
}

if (require.main === module) {
  main();
}
