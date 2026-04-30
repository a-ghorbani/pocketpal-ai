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
  requested_backend: 'cpu' | 'gpu';
  effective_backend: string;
  pp_avg: number | null;
  tg_avg: number | null;
  wall_ms: number;
  peak_memory_mb: number | null;
  log_signals: Record<string, unknown>;
  init_settings: Record<string, unknown>;
  status: string;
  error?: string;
  reason?: string;
  timestamp: string;
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
  return `${r.model_id}::${r.quant}::${r.requested_backend}`;
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
  return 0;
}

/**
 * `log_signals.raw_matches` is debug context (the first ~200 captured native
 * log lines) — useful for one-off investigation, not for a versioned
 * baseline. Stripping it keeps baseline diffs readable.
 */
function stripRawMatches(r: RunRow): RunRow {
  const ls = r.log_signals as Record<string, unknown> | undefined;
  if (!ls || !Array.isArray(ls.raw_matches)) {
    return r;
  }
  return {...r, log_signals: {...ls, raw_matches: []}};
}

export function mergeReports(
  reports: RawReport[],
  drop: Set<string>,
): {runs: RunRow[]; latestTimestamp: string | null} {
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
    runs: Array.from(byKey.values()).map(stripRawMatches).sort(compareRuns),
    latestTimestamp,
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
  const {runs, latestTimestamp} = mergeReports(reports, drop);

  const baseline: BaselineReport = {
    version: pickFirst<string>(reports, 'version') ?? '1.0',
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
  if (drop.size > 0) {
    console.error(`  dropped model_ids: ${[...drop].join(', ')}`);
  }
}

if (require.main === module) {
  main();
}
