#!/usr/bin/env npx tsx

/**
 * Memory Profile Comparison Script
 *
 * Compares a current memory profile against a baseline checkpoint-by-checkpoint.
 * Flags regressions when a checkpoint increases by BOTH more than --pct (default 10%)
 * AND more than --mb (default 200 MB). Both conditions must be true to flag.
 *
 * Usage:
 *   npx tsx scripts/memory-compare.ts <baseline.json> <current.json>
 *   npx tsx scripts/memory-compare.ts --pct 15 --mb 100 <baseline.json> <current.json>
 *
 * Exit codes:
 *   0 = pass (no regressions)
 *   1 = regression detected
 *   2 = error (bad input, missing files, etc.)
 */

import * as fs from 'fs';
import * as path from 'path';

export interface MemoryReport {
  version: string;
  commit: string;
  device: string;
  os_version: string;
  platform: 'ios' | 'android';
  timestamp: string;
  model: string;
  checkpoints: Array<{
    label: string;
    timestamp: string;
    native: Record<string, number>;
  }>;
  peak_memory_mb: number;
}

export interface Regression {
  checkpoint: string;
  metric: string;
  baseline_mb: number;
  current_mb: number;
  delta_mb: number;
  delta_pct: number;
}

export interface CheckpointDelta {
  checkpoint: string;
  metric: string;
  baseline_mb: number;
  current_mb: number;
  delta_mb: number;
  delta_pct: number;
}

export interface ComparisonResult {
  pass: boolean;
  regressions: Regression[];
  deltas: CheckpointDelta[];
  thresholds: {pct: number; mb: number};
  baseline_commit: string;
  current_commit: string;
  peak_baseline_mb: number;
  peak_current_mb: number;
}

export interface CompareOptions {
  pct?: number;
  mb?: number;
}

const DEFAULT_PCT = 10;
const DEFAULT_MB = 200;

/**
 * Get the total memory for comparison.
 * iOS: phys_footprint + metal_allocated (Metal is the dominant cost for LLMs)
 * Android: pss_total (includes everything)
 */
function getTotalMemoryBytes(native: Record<string, number>): number {
  if (native.phys_footprint !== undefined) {
    return native.phys_footprint + (native.metal_allocated ?? 0);
  }
  return native.pss_total ?? 0;
}

function getMetricName(native: Record<string, number>): string {
  if (native.phys_footprint !== undefined && native.metal_allocated) {
    return 'phys+metal';
  }
  return native.phys_footprint !== undefined ? 'phys_footprint' : 'pss_total';
}

/**
 * Compare two memory profile reports checkpoint-by-checkpoint.
 */
export function compareReports(
  baseline: MemoryReport,
  current: MemoryReport,
  options?: CompareOptions,
): ComparisonResult {
  const pct = options?.pct ?? DEFAULT_PCT;
  const mb = options?.mb ?? DEFAULT_MB;

  const regressions: Regression[] = [];
  const deltas: CheckpointDelta[] = [];

  const baselineMap = new Map(baseline.checkpoints.map(c => [c.label, c]));

  for (const checkpoint of current.checkpoints) {
    const baselineCheckpoint = baselineMap.get(checkpoint.label);
    if (!baselineCheckpoint) {
      continue;
    }

    const metric = getMetricName(checkpoint.native);
    const currentBytes = getTotalMemoryBytes(checkpoint.native);
    const baselineBytes = getTotalMemoryBytes(baselineCheckpoint.native);
    const currentMb = currentBytes / (1024 * 1024);
    const baselineMb = baselineBytes / (1024 * 1024);
    const deltaMb = currentMb - baselineMb;
    const deltaPct = baselineMb > 0 ? (deltaMb / baselineMb) * 100 : 0;

    const delta: CheckpointDelta = {
      checkpoint: checkpoint.label,
      metric,
      baseline_mb: Math.round(baselineMb * 100) / 100,
      current_mb: Math.round(currentMb * 100) / 100,
      delta_mb: Math.round(deltaMb * 100) / 100,
      delta_pct: Math.round(deltaPct * 10) / 10,
    };
    deltas.push(delta);

    // Flag regression only if BOTH thresholds exceeded
    if (deltaPct > pct && deltaMb > mb) {
      regressions.push(delta);
    }
  }

  return {
    pass: regressions.length === 0,
    regressions,
    deltas,
    thresholds: {pct, mb},
    baseline_commit: baseline.commit,
    current_commit: current.commit,
    peak_baseline_mb: baseline.peak_memory_mb,
    peak_current_mb: current.peak_memory_mb,
  };
}

/**
 * CLI entry point
 */
function main(): void {
  const args = process.argv.slice(2);
  let pct: number | undefined;
  let mb: number | undefined;
  let outputPath: string | undefined;

  const positionalArgs: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--pct' && i + 1 < args.length) {
      pct = Number(args[i + 1]);
      i++;
    } else if (args[i] === '--mb' && i + 1 < args.length) {
      mb = Number(args[i + 1]);
      i++;
    } else if (args[i] === '--output' && i + 1 < args.length) {
      outputPath = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.error(
        'Usage: memory-compare.ts [--pct N] [--mb N] [--output path] <baseline.json> <current.json>',
      );
      process.exit(0);
    } else {
      positionalArgs.push(args[i]);
    }
  }

  if (positionalArgs.length !== 2) {
    console.error(
      'Usage: memory-compare.ts [--pct N] [--mb N] [--output path] <baseline.json> <current.json>',
    );
    process.exit(2);
  }

  const [baselinePath, currentPath] = positionalArgs;

  if (!fs.existsSync(baselinePath)) {
    console.error(`Baseline file not found: ${baselinePath}`);
    process.exit(2);
  }
  if (!fs.existsSync(currentPath)) {
    console.error(`Current file not found: ${currentPath}`);
    process.exit(2);
  }

  let baseline: MemoryReport;
  let current: MemoryReport;
  try {
    baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    current = JSON.parse(fs.readFileSync(currentPath, 'utf8'));
  } catch (e) {
    console.error(`Failed to parse report files: ${(e as Error).message}`);
    process.exit(2);
  }

  const result = compareReports(baseline, current, {pct, mb});

  // Save result
  const resultJson = JSON.stringify(result, null, 2);
  const savePath =
    outputPath || currentPath.replace(/\.json$/, '-comparison.json');
  fs.writeFileSync(savePath, resultJson);

  // Human-readable table to stderr
  console.error(
    `\nBaseline: ${result.baseline_commit} → Current: ${result.current_commit}`,
  );
  console.error(
    `Thresholds: >${result.thresholds.pct}% AND >${result.thresholds.mb} MB\n`,
  );

  const header = `${'checkpoint'.padEnd(20)}  ${'baseline'.padStart(10)}  ${'current'.padStart(10)}  ${'delta'.padStart(10)}  ${'delta%'.padStart(8)}`;
  console.error(header);
  console.error('-'.repeat(header.length));

  for (const d of result.deltas) {
    const flag = result.regressions.some(r => r.checkpoint === d.checkpoint)
      ? ' !!!'
      : '';
    console.error(
      `${d.checkpoint.padEnd(20)}  ${(d.baseline_mb.toFixed(1) + ' MB').padStart(10)}  ${(d.current_mb.toFixed(1) + ' MB').padStart(10)}  ${((d.delta_mb >= 0 ? '+' : '') + d.delta_mb.toFixed(1) + ' MB').padStart(10)}  ${((d.delta_pct >= 0 ? '+' : '') + d.delta_pct.toFixed(1) + '%').padStart(8)}${flag}`,
    );
  }

  const peakDelta = result.peak_current_mb - result.peak_baseline_mb;
  const peakPct =
    result.peak_baseline_mb > 0
      ? (peakDelta / result.peak_baseline_mb) * 100
      : 0;
  console.error('-'.repeat(header.length));
  console.error(
    `${'Peak'.padEnd(20)}  ${(result.peak_baseline_mb.toFixed(1) + ' MB').padStart(10)}  ${(result.peak_current_mb.toFixed(1) + ' MB').padStart(10)}  ${((peakDelta >= 0 ? '+' : '') + peakDelta.toFixed(1) + ' MB').padStart(10)}  ${((peakPct >= 0 ? '+' : '') + peakPct.toFixed(1) + '%').padStart(8)}`,
  );

  console.error(`\nSaved to: ${path.resolve(savePath)}`);

  if (result.pass) {
    console.error('\nPASS');
  } else {
    console.error(`\nFAIL: ${result.regressions.length} regression(s)`);
    for (const r of result.regressions) {
      console.error(
        `  ${r.checkpoint}: ${r.baseline_mb} → ${r.current_mb} MB (+${r.delta_mb} MB, +${r.delta_pct}%)`,
      );
    }
  }

  process.exit(result.pass ? 0 : 1);
}

if (require.main === module) {
  main();
}
