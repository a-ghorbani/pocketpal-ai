#!/usr/bin/env npx ts-node

/**
 * Model Test Runner
 *
 * Runs E2E tests for each model in complete isolation.
 * Each model gets a fresh app instance, avoiding stale element issues.
 *
 * Usage:
 *   npx ts-node scripts/run-model-tests.ts --platform ios
 *   npx ts-node scripts/run-model-tests.ts --platform android
 *   npx ts-node scripts/run-model-tests.ts --platform ios --models smollm2-135m,qwen3-0.6b
 */

import {execSync} from 'child_process';
import {TEST_MODELS, ModelTestConfig} from '../fixtures/models';

interface TestResult {
  modelId: string;
  success: boolean;
  duration: number;
  error?: string;
}

function parseArgs(): {platform: 'ios' | 'android'; models?: string[]} {
  const args = process.argv.slice(2);
  let platform: 'ios' | 'android' = 'ios';
  let models: string[] | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--platform' && args[i + 1]) {
      platform = args[i + 1] as 'ios' | 'android';
      i++;
    } else if (args[i] === '--models' && args[i + 1]) {
      models = args[i + 1].split(',').map(m => m.trim());
      i++;
    }
  }

  return {platform, models};
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
): TestResult {
  const startTime = Date.now();
  const configFile =
    platform === 'ios' ? 'wdio.ios.local.conf.ts' : 'wdio.android.local.conf.ts';

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

async function main(): Promise<void> {
  const {platform, models: modelFilter} = parseArgs();
  const modelsToTest = getModelsToTest(modelFilter);

  console.log(`\nRunning E2E tests for ${modelsToTest.length} model(s) on ${platform}`);
  console.log(`Models: ${modelsToTest.map(m => m.id).join(', ')}\n`);

  const results: TestResult[] = [];

  for (const model of modelsToTest) {
    const result = runModelTest(model, platform);
    results.push(result);
  }

  printSummary(results);

  // Exit with error code if any tests failed
  const hasFailures = results.some(r => !r.success);
  process.exit(hasFailures ? 1 : 0);
}

main().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
