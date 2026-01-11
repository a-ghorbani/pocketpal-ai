#!/usr/bin/env npx ts-node

/**
 * Model Test Runner
 *
 * Runs E2E tests for each model in complete isolation.
 * Each model gets a fresh app instance, avoiding stale element issues.
 *
 * Usage (local):
 *   npx ts-node scripts/run-model-tests.ts --platform ios
 *   npx ts-node scripts/run-model-tests.ts --platform android
 *   npx ts-node scripts/run-model-tests.ts --platform ios --models smollm2-135m,qwen3-0.6b
 *
 * Usage (AWS Device Farm - called from testspec):
 *   npx ts-node scripts/run-model-tests.ts --platform ios --device-farm
 *   npx ts-node scripts/run-model-tests.ts --platform android --device-farm
 */

import {execSync} from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {TEST_MODELS, ModelTestConfig} from '../fixtures/models';

const DEBUG_OUTPUT_DIR = path.join(__dirname, '../debug-output');
const CUMULATIVE_REPORT_PATH = path.join(DEBUG_OUTPUT_DIR, 'all-models-report.json');

interface TestResult {
  modelId: string;
  success: boolean;
  duration: number;
  error?: string;
}

function parseArgs(): {
  platform: 'ios' | 'android';
  models?: string[];
  deviceFarm: boolean;
} {
  const args = process.argv.slice(2);
  let platform: 'ios' | 'android' = 'ios';
  let models: string[] | undefined;
  let deviceFarm = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--platform' && args[i + 1]) {
      platform = args[i + 1] as 'ios' | 'android';
      i++;
    } else if (args[i] === '--models' && args[i + 1]) {
      models = args[i + 1].split(',').map(m => m.trim());
      i++;
    } else if (args[i] === '--device-farm') {
      deviceFarm = true;
    }
  }

  return {platform, models, deviceFarm};
}

function getModelsToTest(filterIds?: string[]): ModelTestConfig[] {
  if (!filterIds) {
    return TEST_MODELS;
  }

  const filtered = TEST_MODELS.filter(m =>
    filterIds.some(id => m.id.toLowerCase() === id.toLowerCase()),
  );

  if (filtered.length === 0) {
    console.warn(
      `Warning: No models matched filter. Available: ${TEST_MODELS.map(m => m.id).join(', ')}`,
    );
    return TEST_MODELS;
  }

  return filtered;
}

function runModelTest(
  model: ModelTestConfig,
  platform: 'ios' | 'android',
  deviceFarm: boolean,
): TestResult {
  const startTime = Date.now();
  // Use Device Farm config (no local Appium) or local config (starts Appium)
  const configFile = deviceFarm
    ? platform === 'ios'
      ? 'wdio.ios.conf.ts'
      : 'wdio.android.conf.ts'
    : platform === 'ios'
      ? 'wdio.ios.local.conf.ts'
      : 'wdio.android.local.conf.ts';

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing model: ${model.id}`);
  console.log(`File: ${model.downloadFile}`);
  console.log(`${'='.repeat(60)}\n`);

  try {
    // Run the quick-smoke test with this specific model
    execSync(
      `TEST_MODELS=${model.id} npx wdio ${configFile} --spec specs/quick-smoke.spec.ts`,
      {
        stdio: 'inherit',
        cwd: process.cwd(),
        env: {
          ...process.env,
          TEST_MODELS: model.id,
        },
      },
    );

    const duration = Date.now() - startTime;
    console.log(`\n[PASS] ${model.id} completed in ${(duration / 1000).toFixed(1)}s\n`);

    return {
      modelId: model.id,
      success: true,
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.log(`\n[FAIL] ${model.id} failed after ${(duration / 1000).toFixed(1)}s\n`);

    return {
      modelId: model.id,
      success: false,
      duration,
      error: errorMessage,
    };
  }
}

function printSummary(results: TestResult[]): void {
  console.log(`\n${'='.repeat(60)}`);
  console.log('TEST SUMMARY');
  console.log(`${'='.repeat(60)}\n`);

  const passed = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`Total: ${results.length} models`);
  console.log(`Passed: ${passed.length}`);
  console.log(`Failed: ${failed.length}`);
  console.log(`Duration: ${(totalDuration / 1000 / 60).toFixed(1)} minutes\n`);

  if (passed.length > 0) {
    console.log('Passed models:');
    passed.forEach(r => {
      console.log(`  [PASS] ${r.modelId} (${(r.duration / 1000).toFixed(1)}s)`);
    });
    console.log();
  }

  if (failed.length > 0) {
    console.log('Failed models:');
    failed.forEach(r => {
      console.log(`  [FAIL] ${r.modelId} (${(r.duration / 1000).toFixed(1)}s)`);
    });
    console.log();
  }
}

function clearCumulativeReport(): void {
  // Clear the cumulative report at the start of a test run
  if (fs.existsSync(CUMULATIVE_REPORT_PATH)) {
    fs.unlinkSync(CUMULATIVE_REPORT_PATH);
  }
  // Ensure debug-output directory exists
  if (!fs.existsSync(DEBUG_OUTPUT_DIR)) {
    fs.mkdirSync(DEBUG_OUTPUT_DIR, {recursive: true});
  }
}

interface ModelReport {
  model: string;
  prompt: string;
  response: string;
  timing: string;
  timestamp: string;
  success: boolean;
}

function printModelReports(): void {
  if (!fs.existsSync(CUMULATIVE_REPORT_PATH)) {
    console.log('\nNo model reports generated.');
    return;
  }

  try {
    const reports: ModelReport[] = JSON.parse(
      fs.readFileSync(CUMULATIVE_REPORT_PATH, 'utf8'),
    );

    if (reports.length === 0) {
      return;
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log('MODEL INFERENCE RESULTS');
    console.log('='.repeat(60));

    for (const report of reports) {
      console.log(`\n${report.model}:`);
      console.log(`  Timing: ${report.timing}`);
      console.log(`  Response: ${report.response.substring(0, 100)}${report.response.length > 100 ? '...' : ''}`);
    }
    console.log();
  } catch {
    // Ignore parse errors
  }
}

async function main(): Promise<void> {
  const {platform, models: modelFilter, deviceFarm} = parseArgs();
  const modelsToTest = getModelsToTest(modelFilter);

  console.log(`\nRunning E2E tests for ${modelsToTest.length} model(s) on ${platform}`);
  console.log(`Mode: ${deviceFarm ? 'AWS Device Farm' : 'Local'}`);
  console.log(`Models: ${modelsToTest.map(m => m.id).join(', ')}\n`);

  // Clear previous cumulative report
  clearCumulativeReport();

  const results: TestResult[] = [];

  for (const model of modelsToTest) {
    const result = runModelTest(model, platform, deviceFarm);
    results.push(result);
  }

  printSummary(results);

  // Print detailed model inference results from the cumulative report
  printModelReports();

  // Exit with error code if any tests failed
  const hasFailures = results.some(r => !r.success);
  process.exit(hasFailures ? 1 : 0);
}

main().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
