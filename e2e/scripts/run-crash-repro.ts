#!/usr/bin/env npx ts-node

/**
 * Crash Reproduction CLI Script
 *
 * Runs load-stress tests on specific models to reproduce and diagnose crashes.
 * Supports targeting specific device pools in AWS Device Farm.
 *
 * Usage:
 *   # Run specific model locally
 *   yarn crash-repro --model gemma-2-2b --local
 *   yarn crash-repro --model smolvlm2-500m --local --platform ios
 *
 *   # Run on AWS Device Farm with default device pool
 *   yarn crash-repro --model gemma-2-2b
 *
 *   # Run with custom device pool
 *   yarn crash-repro --model gemma-2-2b --device-pool arn:aws:devicefarm:...
 *
 *   # Run multiple models
 *   yarn crash-repro --models gemma-2-2b,llama-3.2-3b
 *
 *   # List available models
 *   yarn crash-repro --list-models
 *
 *   # List available device pools
 *   yarn crash-repro --list-pools
 */

import {execSync} from 'child_process';
import * as path from 'path';
import {config} from 'dotenv';
import {ALL_MODELS, CRASH_REPRO_MODELS, TEST_MODELS} from '../fixtures/models';

// Load environment variables
config({path: path.join(__dirname, '..', '.env')});

interface CrashReproArgs {
  models?: string[];
  devicePool?: string;
  local: boolean;
  platform: 'ios' | 'android';
  listModels: boolean;
  listPools: boolean;
  help: boolean;
}

function printHelp(): void {
  console.log(`
Crash Reproduction Test Runner

USAGE:
  yarn crash-repro [OPTIONS]

OPTIONS:
  --model <id>           Single model to test (e.g., gemma-2-2b)
  --models <ids>         Comma-separated list of models
  --device-pool <arn>    AWS Device Pool ARN for targeted testing
  --local                Run locally instead of AWS Device Farm
  --platform <platform>  Platform: 'android' (default) or 'ios'
  --list-models          List all available models for testing
  --list-pools           List AWS Device Farm device pools
  --help                 Show this help message

EXAMPLES:
  # Run locally on Android
  yarn crash-repro --model gemma-2-2b --local

  # Run locally on iOS
  yarn crash-repro --model smolvlm2-500m --local --platform ios

  # Run on AWS Device Farm
  yarn crash-repro --model gemma-2-2b

  # Run with specific device pool
  yarn crash-repro --model gemma-2-2b --device-pool arn:aws:devicefarm:us-west-2:...

  # Run multiple models
  yarn crash-repro --models gemma-2-2b,llama-3.2-3b --local

AVAILABLE MODELS:
  Regular test models:
${TEST_MODELS.map(m => `    - ${m.id}`).join('\n')}

  Crash reproduction models:
${CRASH_REPRO_MODELS.map(m => `    - ${m.id}${m.isVision ? ' (vision)' : ''}`).join('\n')}
`);
}

function parseArgs(): CrashReproArgs {
  const args = process.argv.slice(2);
  const result: CrashReproArgs = {
    local: false,
    platform: 'android',
    listModels: false,
    listPools: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--model':
        if (nextArg) {
          result.models = [nextArg];
          i++;
        }
        break;
      case '--models':
        if (nextArg) {
          result.models = nextArg.split(',').map(m => m.trim());
          i++;
        }
        break;
      case '--device-pool':
        if (nextArg) {
          result.devicePool = nextArg;
          i++;
        }
        break;
      case '--local':
        result.local = true;
        break;
      case '--platform':
        if (nextArg && (nextArg === 'ios' || nextArg === 'android')) {
          result.platform = nextArg;
          i++;
        }
        break;
      case '--list-models':
        result.listModels = true;
        break;
      case '--list-pools':
        result.listPools = true;
        break;
      case '--help':
      case '-h':
        result.help = true;
        break;
    }
  }

  return result;
}

function listModels(): void {
  console.log('\n=== Available Models ===\n');

  console.log('Regular Test Models:');
  console.log('-'.repeat(60));
  for (const model of TEST_MODELS) {
    const vision = model.isVision ? ' [vision]' : '';
    console.log(`  ${model.id}${vision}`);
    console.log(`    File: ${model.downloadFile}`);
    console.log(`    Query: ${model.searchQuery}`);
    console.log();
  }

  console.log('\nCrash Reproduction Models:');
  console.log('-'.repeat(60));
  for (const model of CRASH_REPRO_MODELS) {
    const vision = model.isVision ? ' [vision]' : '';
    const timeout = model.downloadTimeout
      ? ` (download timeout: ${model.downloadTimeout / 60000}min)`
      : '';
    console.log(`  ${model.id}${vision}${timeout}`);
    console.log(`    File: ${model.downloadFile}`);
    console.log(`    Query: ${model.searchQuery}`);
    console.log();
  }
}

async function listDevicePools(): Promise<void> {
  console.log('\n=== AWS Device Farm Device Pools ===\n');

  const projectArn = process.env.AWS_DEVICE_FARM_PROJECT_ARN;
  if (!projectArn) {
    console.error('Error: AWS_DEVICE_FARM_PROJECT_ARN not set in .env');
    console.error('Please configure your AWS Device Farm project.');
    process.exit(1);
  }

  try {
    // Dynamic import of AWS SDK
    const {DeviceFarmClient, ListDevicePoolsCommand} = await import(
      '@aws-sdk/client-device-farm'
    );

    const region = process.env.AWS_REGION || 'us-west-2';
    const client = new DeviceFarmClient({region});

    console.log('Private Device Pools:');
    console.log('-'.repeat(60));

    const privateResponse = await client.send(
      new ListDevicePoolsCommand({
        arn: projectArn,
        type: 'PRIVATE',
      }),
    );

    const privatePools = privateResponse.devicePools || [];
    if (privatePools.length === 0) {
      console.log('  (none)');
    } else {
      for (const pool of privatePools) {
        console.log(`  ${pool.name}`);
        console.log(`    ARN: ${pool.arn}`);
        console.log(`    Description: ${pool.description || '(none)'}`);
        console.log();
      }
    }

    console.log('\nCurated Device Pools:');
    console.log('-'.repeat(60));

    const curatedResponse = await client.send(
      new ListDevicePoolsCommand({
        arn: projectArn,
        type: 'CURATED',
      }),
    );

    const curatedPools = curatedResponse.devicePools || [];
    for (const pool of curatedPools) {
      console.log(`  ${pool.name}`);
      console.log(`    ARN: ${pool.arn}`);
      console.log();
    }
  } catch (error) {
    console.error('Error listing device pools:', (error as Error).message);
    console.error('Make sure AWS credentials are configured.');
    process.exit(1);
  }
}

function validateModels(modelIds: string[]): void {
  const availableIds = ALL_MODELS.map(m => m.id.toLowerCase());
  const invalid = modelIds.filter(id => !availableIds.includes(id.toLowerCase()));

  if (invalid.length > 0) {
    console.error(`Error: Unknown model(s): ${invalid.join(', ')}`);
    console.error(`\nAvailable models:`);
    console.error(ALL_MODELS.map(m => `  - ${m.id}`).join('\n'));
    process.exit(1);
  }
}

function runTests(args: CrashReproArgs): void {
  if (!args.models || args.models.length === 0) {
    console.error('Error: No model specified. Use --model or --models.');
    console.error('Run with --help for usage information.');
    process.exit(1);
  }

  validateModels(args.models);

  const modelFilter = args.models.join(',');
  console.log(`\n${'='.repeat(60)}`);
  console.log('Crash Reproduction Test');
  console.log('='.repeat(60));
  console.log(`Models: ${modelFilter}`);
  console.log(`Platform: ${args.platform}`);
  console.log(`Mode: ${args.local ? 'Local' : 'AWS Device Farm'}`);

  if (args.devicePool) {
    console.log(`Device Pool: ${args.devicePool}`);
  }

  console.log('='.repeat(60) + '\n');

  // Build environment variables
  const env: Record<string, string> = {
    ...process.env,
    TEST_MODELS: modelFilter,
  } as Record<string, string>;

  if (args.devicePool) {
    if (args.platform === 'android') {
      env.AWS_DEVICE_POOL_ARN_ANDROID = args.devicePool;
    } else {
      env.AWS_DEVICE_POOL_ARN_IOS = args.devicePool;
    }
  }

  // Determine which config to use
  let configFile: string;
  if (args.local) {
    configFile =
      args.platform === 'ios'
        ? 'wdio.ios.local.conf.ts'
        : 'wdio.android.local.conf.ts';
  } else {
    configFile =
      args.platform === 'ios' ? 'wdio.ios.conf.ts' : 'wdio.android.conf.ts';
  }

  // Run the tests
  const specPath = 'specs/load-stress.spec.ts';
  const command = `npx wdio ${configFile} --spec ${specPath}`;

  console.log(`Running: ${command}\n`);

  try {
    execSync(command, {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..'),
      env,
    });

    console.log('\n[SUCCESS] Crash reproduction test completed.');
  } catch (error) {
    console.error('\n[FAILED] Crash reproduction test failed.');
    console.error('Check debug-output/ for screenshots and reports.');
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.help) {
    printHelp();
    return;
  }

  if (args.listModels) {
    listModels();
    return;
  }

  if (args.listPools) {
    await listDevicePools();
    return;
  }

  runTests(args);
}

main().catch(error => {
  console.error('Error:', (error as Error).message);
  process.exit(1);
});
