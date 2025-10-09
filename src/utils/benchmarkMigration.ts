/**
 * Migration utilities for benchmark results
 * Handles schema changes in benchmark result data structure
 */

import {BenchmarkResult} from './types';
import {migrateContextInitParams} from './contextInitParamsVersions';

/**
 * Migrates benchmark result initSettings from legacy format to current format
 */
export function migrateBenchmarkResult(
  result: BenchmarkResult,
): BenchmarkResult {
  if (!result.initSettings) {
    return result;
  }

  const migratedResult = {...result};

  migratedResult.initSettings = migrateContextInitParams(result.initSettings);

  return migratedResult;
}

/**
 * Migrates an array of benchmark results
 */
export function migrateBenchmarkResults(
  results: BenchmarkResult[],
): BenchmarkResult[] {
  return results.map(migrateBenchmarkResult);
}
