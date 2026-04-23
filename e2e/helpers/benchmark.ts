/**
 * E2E helpers for the benchmark-matrix spec.
 *
 * Thin wrapper around the BenchmarkResultTrigger product-code component:
 * sends a one-shot command via setValue() on the hidden TextInput, then
 * reads the Text element's content-desc (Android) / text (iOS) for the
 * response.
 *
 * Android-only in v1. iOS triggers exist via deep link in MemorySnapshot;
 * the benchmark-matrix spec is Android-only per the story's scope.
 */

import {byTestId} from './selectors';

declare const driver: WebdriverIO.Browser;

/**
 * Shape of the BenchmarkResult the app serialises via read::latest.
 * Mirror of the structural subset of `src/utils/types.ts:BenchmarkResult`
 * we actually consume. Kept local to avoid pulling the app's type tree
 * into the e2e tsconfig's rootDir.
 */
export interface BenchmarkResult {
  ppAvg: number;
  tgAvg: number;
  timestamp: string;
  wallTimeMs?: number;
  peakMemoryUsage?: {
    total: number;
    used: number;
    percentage: number;
  };
  modelId?: string;
  modelName?: string;
  [key: string]: unknown;
}

const READ_LATEST = 'read::latest';
const READ_INIT_SETTINGS = 'read::initSettings';
const LIST_MODELS = 'list::models';

/** Max total polling time for a response on the result element. */
const READ_TIMEOUT_MS = 10_000;
/** Poll interval. */
const READ_POLL_MS = 500;

async function sendBenchCommand(cmd: string): Promise<void> {
  const input = await driver.$(byTestId('benchmark-result-label'));
  await input.setValue(cmd);
}

/**
 * Read the result element's current value. Polls up to READ_TIMEOUT_MS for a
 * non-empty string, trying both Android's content-desc and iOS's label/text
 * attributes (Android is the primary path for v1).
 */
async function readResultRaw(): Promise<string> {
  const el = await driver.$(byTestId('benchmark-result-value'));
  const attempts = Math.max(1, Math.floor(READ_TIMEOUT_MS / READ_POLL_MS));
  for (let i = 0; i < attempts; i++) {
    await driver.pause(READ_POLL_MS);
    // Android: the accessibilityLabel lands in content-desc.
    let data: string | null = null;
    try {
      data = await el.getAttribute('content-desc');
    } catch {
      // Attribute not present on this platform; try getText as fallback.
    }
    if (data && data.length > 0) {
      return data;
    }
    try {
      const text = await el.getText();
      if (text && text.length > 0) {
        return text;
      }
    } catch {
      // Keep polling.
    }
  }
  throw new Error(
    `BenchmarkResultTrigger read timeout after ${READ_TIMEOUT_MS}ms`,
  );
}

/**
 * Ask the product code for `benchmarkStore.latestResult`. Returns null when
 * the store is empty (no benchmarks have been run yet), or the parsed
 * BenchmarkResult object otherwise.
 */
export async function readLatestBenchmark(): Promise<BenchmarkResult | null> {
  await sendBenchCommand(READ_LATEST);
  const raw = await readResultRaw();
  if (raw === 'null') {
    return null;
  }
  return JSON.parse(raw) as BenchmarkResult;
}

/**
 * Ask the product code for the current `modelStore.contextInitParams`. Used
 * by the spec to assert tier-switch correctness before each bench run.
 */
export async function readInitSettings(): Promise<Record<string, unknown>> {
  await sendBenchCommand(READ_INIT_SETTINGS);
  const raw = await readResultRaw();
  return JSON.parse(raw) as Record<string, unknown>;
}

/**
 * List the basenames of every .gguf file under the app's hf/ subtree.
 * Used by the preseed pre-flight check to fail-fast when a required model
 * file is missing.
 */
export async function listPreseededModels(): Promise<string[]> {
  await sendBenchCommand(LIST_MODELS);
  const raw = await readResultRaw();
  return JSON.parse(raw) as string[];
}
