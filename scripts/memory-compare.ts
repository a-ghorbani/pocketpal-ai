#!/usr/bin/env npx ts-node

/**
 * Memory Profile Comparison Script
 *
 * Compares a current memory profile against a baseline and detects regressions.
 *
 * Checks:
 * 1. Absolute budget: fail if any checkpoint exceeds ceiling (default 1 GB)
 * 2. Baseline regression: flag if any checkpoint increased > threshold vs baseline
 * 3. Leak detection: flag if post-unload > 110% of pre-load baseline
 *
 * Usage:
 *   npx ts-node scripts/memory-compare.ts <baseline.json> <current.json>
 *   npx ts-node scripts/memory-compare.ts --budget-mb 800 --regression-pct 20 <baseline.json> <current.json>
 *
 * Exit codes:
 *   0 = pass (no regressions)
 *   1 = regression detected
 *   2 = error (bad input, missing files, etc.)
 */

import * as fs from 'fs';

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
    hermes?: Record<string, number>;
  }>;
  peak_memory_mb: number;
}

export interface BudgetViolation {
  checkpoint: string;
  metric: string;
  value_mb: number;
  ceiling_mb: number;
}

export interface RegressionViolation {
  checkpoint: string;
  metric: string;
  baseline_mb: number;
  current_mb: number;
  delta_mb: number;
  delta_pct: number;
  threshold_pct: number;
}

export interface ComparisonResult {
  pass: boolean;
  budget_violations: BudgetViolation[];
  regressions: RegressionViolation[];
  leak_detected: boolean;
  leak_details?: {
    pre_load_mb: number;
    post_unload_mb: number;
    ratio: number;
  };
}

export interface CompareOptions {
  budgetCeilingMb?: number;
  leakThreshold?: number;
  regressionPct?: number;
}

const DEFAULT_BUDGET_CEILING_MB = 1024; // 1 GB
const DEFAULT_LEAK_THRESHOLD = 1.1; // 110%
const DEFAULT_REGRESSION_PCT = 15; // 15% increase flags regression

/**
 * Get the primary memory metric value in bytes for a checkpoint.
 * Uses phys_footprint on iOS, pss_total on Android.
 */
function getPrimaryMemoryBytes(native: Record<string, number>): number {
  return native.phys_footprint ?? native.pss_total ?? 0;
}

function getPrimaryMetricName(native: Record<string, number>): string {
  return native.phys_footprint !== undefined ? 'phys_footprint' : 'pss_total';
}

/**
 * Compare a current memory profile against a baseline and detect regressions.
 */
export function compareReports(
  baseline: MemoryReport,
  current: MemoryReport,
  options?: CompareOptions,
): ComparisonResult {
  const budgetCeilingMb = options?.budgetCeilingMb ?? DEFAULT_BUDGET_CEILING_MB;
  const leakThreshold = options?.leakThreshold ?? DEFAULT_LEAK_THRESHOLD;
  const regressionPct = options?.regressionPct ?? DEFAULT_REGRESSION_PCT;

  const budgetViolations: BudgetViolation[] = [];
  const regressions: RegressionViolation[] = [];

  // Build baseline checkpoint map for comparison
  const baselineMap = new Map(baseline.checkpoints.map(c => [c.label, c]));

  // Check each checkpoint in current report
  for (const checkpoint of current.checkpoints) {
    const memBytes = getPrimaryMemoryBytes(checkpoint.native);
    const memMb = memBytes / (1024 * 1024);
    const metric = getPrimaryMetricName(checkpoint.native);

    // Absolute budget check
    if (memMb > budgetCeilingMb) {
      budgetViolations.push({
        checkpoint: checkpoint.label,
        metric,
        value_mb: Math.round(memMb * 100) / 100,
        ceiling_mb: budgetCeilingMb,
      });
    }

    // Baseline regression check
    const baselineCheckpoint = baselineMap.get(checkpoint.label);
    if (baselineCheckpoint) {
      const baselineBytes = getPrimaryMemoryBytes(baselineCheckpoint.native);
      const baselineMb = baselineBytes / (1024 * 1024);

      if (baselineMb > 0) {
        const deltaMb = memMb - baselineMb;
        const deltaPct = (deltaMb / baselineMb) * 100;

        if (deltaPct > regressionPct) {
          regressions.push({
            checkpoint: checkpoint.label,
            metric,
            baseline_mb: Math.round(baselineMb * 100) / 100,
            current_mb: Math.round(memMb * 100) / 100,
            delta_mb: Math.round(deltaMb * 100) / 100,
            delta_pct: Math.round(deltaPct * 10) / 10,
            threshold_pct: regressionPct,
          });
        }
      }
    }
  }

  // Leak detection: compare app_launch vs model_unloaded
  const appLaunch = current.checkpoints.find(c => c.label === 'app_launch');
  const modelUnloaded = current.checkpoints.find(
    c => c.label === 'model_unloaded',
  );

  let leakDetected = false;
  let leakDetails: ComparisonResult['leak_details'];

  if (appLaunch && modelUnloaded) {
    const preLoadBytes = getPrimaryMemoryBytes(appLaunch.native);
    const postUnloadBytes = getPrimaryMemoryBytes(modelUnloaded.native);
    const preLoadMb = preLoadBytes / (1024 * 1024);
    const postUnloadMb = postUnloadBytes / (1024 * 1024);

    if (preLoadBytes > 0) {
      const ratio = postUnloadBytes / preLoadBytes;
      if (ratio > leakThreshold) {
        leakDetected = true;
      }
      leakDetails = {
        pre_load_mb: Math.round(preLoadMb * 100) / 100,
        post_unload_mb: Math.round(postUnloadMb * 100) / 100,
        ratio: Math.round(ratio * 1000) / 1000,
      };
    }
  }

  const pass =
    budgetViolations.length === 0 && regressions.length === 0 && !leakDetected;

  return {
    pass,
    budget_violations: budgetViolations,
    regressions,
    leak_detected: leakDetected,
    leak_details: leakDetails,
  };
}

/**
 * CLI entry point
 */
function main(): void {
  const args = process.argv.slice(2);
  let budgetCeilingMb: number | undefined;
  let regressionPct: number | undefined;

  // Parse flags
  const positionalArgs: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--budget-mb' && i + 1 < args.length) {
      budgetCeilingMb = Number(args[i + 1]);
      i++;
    } else if (args[i] === '--regression-pct' && i + 1 < args.length) {
      regressionPct = Number(args[i + 1]);
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.error(
        'Usage: memory-compare.ts [--budget-mb N] [--regression-pct N] <baseline.json> <current.json>',
      );
      process.exit(0);
    } else {
      positionalArgs.push(args[i]);
    }
  }

  if (positionalArgs.length !== 2) {
    console.error(
      'Usage: memory-compare.ts [--budget-mb N] [--regression-pct N] <baseline.json> <current.json>',
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

  const result = compareReports(baseline, current, {
    budgetCeilingMb,
    regressionPct,
  });

  // Structured output to stdout
  console.log(JSON.stringify(result, null, 2));

  // Human-readable summary to stderr
  if (result.pass) {
    console.error('PASS: No memory regressions detected.');
  } else {
    console.error('FAIL: Memory regression detected!');

    if (result.budget_violations.length > 0) {
      console.error('\nBudget violations:');
      for (const v of result.budget_violations) {
        console.error(
          `  ${v.checkpoint}: ${v.metric} = ${v.value_mb} MB (ceiling: ${v.ceiling_mb} MB)`,
        );
      }
    }

    if (result.regressions.length > 0) {
      console.error('\nBaseline regressions:');
      for (const r of result.regressions) {
        console.error(
          `  ${r.checkpoint}: ${r.metric} ${r.baseline_mb} → ${r.current_mb} MB (+${r.delta_mb} MB, +${r.delta_pct}%, threshold: ${r.threshold_pct}%)`,
        );
      }
    }

    if (result.leak_detected && result.leak_details) {
      console.error(
        `\nMemory leak detected: app_launch=${result.leak_details.pre_load_mb} MB, ` +
          `model_unloaded=${result.leak_details.post_unload_mb} MB ` +
          `(ratio: ${result.leak_details.ratio}, threshold: 1.1)`,
      );
    }
  }

  // Comparison summary
  console.error(`\nBaseline: ${baseline.commit} (${baseline.timestamp})`);
  console.error(`Current:  ${current.commit} (${current.timestamp})`);
  console.error(`Peak: ${current.peak_memory_mb} MB`);

  process.exit(result.pass ? 0 : 1);
}

// Only run CLI when executed directly (not imported for testing)
if (require.main === module) {
  main();
}
