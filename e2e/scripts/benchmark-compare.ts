#!/usr/bin/env npx tsx

/**
 * Benchmark Matrix Comparison Script
 *
 * Compares two benchmark-matrix reports row-by-row, flagging regressions on
 * either `pp_avg` or `tg_avg` that exceed |delta%| > --pct (default 15).
 *
 * Differences from memory-compare:
 *   - Regression trigger is OR (either pp OR tg beyond threshold), not AND.
 *   - Effective-backend mismatch (e.g. a prior OpenCL run silently falling
 *     back to CPU) is ALSO flagged, independent of the numeric deltas.
 *   - Positive delta on pp/tg is an improvement; negative is a regression.
 *
 * Usage:
 *   npx tsx scripts/benchmark-compare.ts <baseline.json> <current.json>
 *   npx tsx scripts/benchmark-compare.ts --pct 20 <baseline.json> <current.json>
 *
 * Exit codes:
 *   0 = pass (no regressions)
 *   1 = regression detected
 *   2 = error (bad input, missing files, etc.)
 */

import * as fs from 'fs';
import * as path from 'path';

export interface BenchmarkRunReport {
  model_id: string;
  quant: string;
  requested_backend: 'cpu' | 'gpu';
  effective_backend: 'cpu' | 'opencl' | 'cpu+opencl-partial' | 'unknown';
  pp_avg: number | null;
  tg_avg: number | null;
  wall_ms: number;
  peak_memory_mb: number | null;
  status: 'ok' | 'skipped' | 'failed';
  timestamp: string;
  reason?: string;
  error?: string;
}

export interface BenchmarkMatrixReport {
  version: string;
  device: string;
  soc: string | null;
  commit: string;
  llama_rn_version: string;
  platform: string;
  os_version: string;
  timestamp: string;
  preseeded?: boolean;
  runs: BenchmarkRunReport[];
}

export interface RowDelta {
  key: string;
  model_id: string;
  quant: string;
  requested_backend: 'cpu' | 'gpu';
  baseline_pp: number | null;
  current_pp: number | null;
  baseline_tg: number | null;
  current_tg: number | null;
  delta_pp_pct: number | null;
  delta_tg_pct: number | null;
  baseline_effective: string;
  current_effective: string;
  flagged: boolean;
  flags: string[];
}

export interface ComparisonResult {
  pass: boolean;
  threshold_pct: number;
  baseline_commit: string;
  current_commit: string;
  baseline_device: string;
  current_device: string;
  rows: RowDelta[];
  missing_in_current: string[]; // keys present in baseline but not current
  missing_in_baseline: string[]; // keys present in current but not baseline
}

export interface CompareOptions {
  pct?: number;
}

const DEFAULT_PCT = 15;

function rowKey(r: BenchmarkRunReport): string {
  return `${r.model_id}::${r.quant}::${r.requested_backend}`;
}

function pctDelta(base: number | null, cur: number | null): number | null {
  if (base === null || cur === null) return null;
  if (base === 0) return null;
  return Math.round(((cur - base) / base) * 10000) / 100; // 2 dp
}

export function compareReports(
  baseline: BenchmarkMatrixReport,
  current: BenchmarkMatrixReport,
  options?: CompareOptions,
): ComparisonResult {
  const pct = options?.pct ?? DEFAULT_PCT;

  const baseMap = new Map(baseline.runs.map(r => [rowKey(r), r]));
  const curMap = new Map(current.runs.map(r => [rowKey(r), r]));

  const rows: RowDelta[] = [];
  const missing_in_current: string[] = [];
  const missing_in_baseline: string[] = [];

  for (const [key, baseRow] of baseMap) {
    const curRow = curMap.get(key);
    if (!curRow) {
      missing_in_current.push(key);
      continue;
    }

    const deltaPp = pctDelta(baseRow.pp_avg, curRow.pp_avg);
    const deltaTg = pctDelta(baseRow.tg_avg, curRow.tg_avg);

    const flags: string[] = [];
    // Numeric-regression flags: negative delta past threshold on pp OR tg.
    if (deltaPp !== null && deltaPp < -pct) {
      flags.push(`pp_regression(${deltaPp.toFixed(1)}%)`);
    }
    if (deltaTg !== null && deltaTg < -pct) {
      flags.push(`tg_regression(${deltaTg.toFixed(1)}%)`);
    }
    // Effective-backend mismatch is its own flag, independent of deltas.
    if (baseRow.effective_backend !== curRow.effective_backend) {
      flags.push(
        `effective_backend:${baseRow.effective_backend}->${curRow.effective_backend}`,
      );
    }

    rows.push({
      key,
      model_id: baseRow.model_id,
      quant: baseRow.quant,
      requested_backend: baseRow.requested_backend,
      baseline_pp: baseRow.pp_avg,
      current_pp: curRow.pp_avg,
      baseline_tg: baseRow.tg_avg,
      current_tg: curRow.tg_avg,
      delta_pp_pct: deltaPp,
      delta_tg_pct: deltaTg,
      baseline_effective: baseRow.effective_backend,
      current_effective: curRow.effective_backend,
      flagged: flags.length > 0,
      flags,
    });
  }

  for (const key of curMap.keys()) {
    if (!baseMap.has(key)) {
      missing_in_baseline.push(key);
    }
  }

  return {
    pass: rows.every(r => !r.flagged),
    threshold_pct: pct,
    baseline_commit: baseline.commit,
    current_commit: current.commit,
    baseline_device: baseline.device,
    current_device: current.device,
    rows,
    missing_in_current,
    missing_in_baseline,
  };
}

function main(): void {
  const args = process.argv.slice(2);
  let pct: number | undefined;
  let outputPath: string | undefined;
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--pct' && i + 1 < args.length) {
      pct = Number(args[++i]);
    } else if (args[i] === '--output' && i + 1 < args.length) {
      outputPath = args[++i];
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.error(
        'Usage: benchmark-compare.ts [--pct N] [--output path] <baseline.json> <current.json>',
      );
      process.exit(0);
    } else {
      positional.push(args[i]);
    }
  }

  if (positional.length !== 2) {
    console.error(
      'Usage: benchmark-compare.ts [--pct N] [--output path] <baseline.json> <current.json>',
    );
    process.exit(2);
  }

  const [basePath, curPath] = positional;
  for (const p of positional) {
    if (!fs.existsSync(p)) {
      console.error(`File not found: ${p}`);
      process.exit(2);
    }
  }

  let baseline: BenchmarkMatrixReport;
  let current: BenchmarkMatrixReport;
  try {
    baseline = JSON.parse(fs.readFileSync(basePath, 'utf8'));
    current = JSON.parse(fs.readFileSync(curPath, 'utf8'));
  } catch (e) {
    console.error(`Failed to parse report files: ${(e as Error).message}`);
    process.exit(2);
  }

  const result = compareReports(baseline, current, {pct});

  const savePath =
    outputPath || curPath.replace(/\.json$/, '-comparison.json');
  fs.writeFileSync(savePath, JSON.stringify(result, null, 2));

  console.error(
    `\nBaseline: ${result.baseline_commit} (${result.baseline_device})  ->  Current: ${result.current_commit} (${result.current_device})`,
  );
  console.error(`Threshold: |delta%| > ${result.threshold_pct}% on pp OR tg\n`);

  const header =
    `${'model'.padEnd(14)} ${'quant'.padEnd(8)} ${'req'.padEnd(4)} ` +
    `${'base_pp'.padStart(8)} ${'cur_pp'.padStart(8)} ${'d_pp%'.padStart(8)} ` +
    `${'base_tg'.padStart(8)} ${'cur_tg'.padStart(8)} ${'d_tg%'.padStart(8)} ` +
    `${'base_eff'.padEnd(19)} ${'cur_eff'.padEnd(19)}`;
  console.error(header);
  console.error('-'.repeat(header.length));
  for (const r of result.rows) {
    const fmt = (n: number | null, width: number) =>
      (n === null ? 'n/a' : n.toFixed(1)).padStart(width);
    const flag = r.flagged ? '  <<' : '';
    console.error(
      `${r.model_id.padEnd(14)} ${r.quant.padEnd(8)} ${r.requested_backend.padEnd(4)} ` +
        `${fmt(r.baseline_pp, 8)} ${fmt(r.current_pp, 8)} ${fmt(r.delta_pp_pct, 8)} ` +
        `${fmt(r.baseline_tg, 8)} ${fmt(r.current_tg, 8)} ${fmt(r.delta_tg_pct, 8)} ` +
        `${r.baseline_effective.padEnd(19)} ${r.current_effective.padEnd(19)}${flag}`,
    );
  }

  if (result.missing_in_current.length > 0) {
    console.error(
      `\nMissing in current: ${result.missing_in_current.length} rows`,
    );
    for (const k of result.missing_in_current) console.error(`  - ${k}`);
  }
  if (result.missing_in_baseline.length > 0) {
    console.error(
      `\nMissing in baseline: ${result.missing_in_baseline.length} rows (new)`,
    );
    for (const k of result.missing_in_baseline) console.error(`  + ${k}`);
  }

  console.error(`\nSaved to: ${path.resolve(savePath)}`);

  if (result.pass) {
    console.error('\nPASS');
    process.exit(0);
  }
  const flagged = result.rows.filter(r => r.flagged);
  console.error(`\nFAIL: ${flagged.length} flagged row(s)`);
  for (const r of flagged) {
    console.error(`  ${r.key}: ${r.flags.join(', ')}`);
  }
  process.exit(1);
}

if (require.main === module) {
  main();
}
