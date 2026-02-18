#!/usr/bin/env npx ts-node

/**
 * Unified E2E Test Runner
 *
 * Single entry point for all local E2E test execution patterns:
 * - Run a spec once on the default device
 * - Iterate a spec across multiple models (per-model isolation)
 * - Iterate a spec across multiple devices (multi-device pipeline)
 * - Full matrix: every model × every device
 *
 * Usage:
 *   # Simple run
 *   npx ts-node scripts/run-e2e.ts --platform ios --spec quick-smoke
 *
 *   # Per-model iteration
 *   npx ts-node scripts/run-e2e.ts --platform ios --each-model
 *   npx ts-node scripts/run-e2e.ts --platform ios --each-model --models smollm2-135m,qwen3-0.6b
 *
 *   # Crash repro (load-stress on specific model)
 *   npx ts-node scripts/run-e2e.ts --platform ios --spec load-stress --models gemma-2-2b
 *
 *   # Multi-device pipeline
 *   npx ts-node scripts/run-e2e.ts --platform ios --each-device
 *   npx ts-node scripts/run-e2e.ts --platform ios --each-device --devices virtual-only
 *
 *   # Full matrix
 *   npx ts-node scripts/run-e2e.ts --platform ios --each-device --each-model
 *
 *   # Device farm mode (switches wdio config, no local Appium)
 *   npx ts-node scripts/run-e2e.ts --platform ios --each-model --mode device-farm
 *
 *   # Info commands
 *   npx ts-node scripts/run-e2e.ts --list-models
 *   npx ts-node scripts/run-e2e.ts --help
 */

import {execSync} from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  TEST_MODELS,
  CRASH_REPRO_MODELS,
  ALL_MODELS,
  ModelTestConfig,
} from '../fixtures/models';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DeviceConfig {
  id: string;
  name: string;
  platform: 'ios' | 'android';
  type: 'simulator' | 'emulator' | 'real';
  enabled: boolean;
  deviceName: string;
  platformVersion: string;
  udid?: string;
  appPath?: string;
  xcodeOrgId?: string;
  xcodeSigningId?: string;
}

interface DeviceInventory {
  devices: DeviceConfig[];
}

interface RunArgs {
  platform: 'ios' | 'android' | 'both';
  spec: string;
  models?: string[];
  eachModel: boolean;
  allModels: boolean;
  devices: string;
  eachDevice: boolean;
  mode: 'local' | 'device-farm';
  skipBuild: boolean;
  dryRun: boolean;
  listModels: boolean;
  reportDir?: string;
  help: boolean;
}

interface TestRunResult {
  deviceId: string | null;
  deviceName: string | null;
  devicePlatform: 'ios' | 'android';
  deviceType: 'simulator' | 'emulator' | 'real' | null;
  modelId: string | null;
  spec: string;
  success: boolean;
  duration: number;
  error?: string;
  junitFile?: string;
}

interface RunSummary {
  timestamp: string;
  branch: string;
  commit: string;
  platform: string;
  spec: string;
  mode: string;
  totalRuns: number;
  passed: number;
  failed: number;
  totalDuration: number;
  results: TestRunResult[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const E2E_DIR = path.join(__dirname, '..');
const REPO_ROOT = path.join(E2E_DIR, '..');
const DEVICES_FILE = path.join(E2E_DIR, 'devices.json');
const DEVICES_TEMPLATE = path.join(E2E_DIR, 'devices.template.json');
const REPORTS_DIR = path.join(E2E_DIR, 'reports');
const BASE_APPIUM_PORT = 4723;

// ---------------------------------------------------------------------------
// CLI Parsing
// ---------------------------------------------------------------------------

function printHelp(): void {
  console.log(`
Unified E2E Test Runner

USAGE:
  npx ts-node scripts/run-e2e.ts [OPTIONS]

OPTIONS:
  --platform <platform>    Platform: 'ios', 'android', or 'both' (required)
  --spec <spec>            Test spec: 'quick-smoke', 'load-stress', 'diagnostic',
                           'language', or 'all' (default: 'quick-smoke')
  --models <ids>           Comma-separated model IDs to test
  --each-model             Iterate spec once per model (isolated WDIO process each)
  --all-models             Include crash-repro models in the model pool
  --devices <filter>       Device filter: 'all', 'virtual-only', 'real-only',
                           'connected', or comma-separated device IDs (default: 'all')
  --each-device            Iterate across devices from devices.json
  --mode <mode>            Execution mode: 'local' or 'device-farm' (default: 'local')
  --skip-build             Skip app build step
  --dry-run                Print matched targets and commands without executing
  --list-models            List all available models
  --report-dir <path>      Custom report directory (default: e2e/reports/<timestamp>)
  --help                   Show this help message

EXAMPLES:
  # Quick smoke test on default device
  yarn e2e:ios --spec quick-smoke

  # Test each model in isolation
  yarn e2e:ios --each-model
  yarn e2e:ios --each-model --models smollm2-135m,qwen3-0.6b

  # Crash reproduction (load-stress on a specific model)
  yarn e2e --platform ios --spec load-stress --models gemma-2-2b

  # Multi-device pipeline
  yarn e2e:ios --each-device
  yarn e2e:ios --devices virtual-only --skip-build

  # Run on whatever real devices are currently plugged in
  yarn e2e:android --devices connected --skip-build

  # Full matrix: every model × every device
  yarn e2e:ios --each-device --each-model

  # Device farm mode (for running ON a Device Farm host)
  yarn e2e:ios --each-model --mode device-farm

  # Dry run to see what would execute
  yarn e2e --platform both --each-device --each-model --dry-run
`);
}

function parseArgs(): RunArgs {
  const args = process.argv.slice(2);
  const result: RunArgs = {
    platform: 'ios',
    spec: 'quick-smoke',
    eachModel: false,
    allModels: false,
    devices: 'all',
    eachDevice: false,
    mode: 'local',
    skipBuild: false,
    dryRun: false,
    listModels: false,
    help: false,
  };

  let platformSet = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--platform':
        if (
          nextArg &&
          (nextArg === 'ios' || nextArg === 'android' || nextArg === 'both')
        ) {
          result.platform = nextArg;
          platformSet = true;
          i++;
        }
        break;
      case '--spec':
        if (nextArg) {
          result.spec = nextArg;
          i++;
        }
        break;
      case '--model':
      case '--models':
        if (nextArg) {
          result.models = nextArg.split(',').map(m => m.trim());
          i++;
        }
        break;
      case '--each-model':
        result.eachModel = true;
        break;
      case '--all-models':
        result.allModels = true;
        break;
      case '--device':
      case '--devices':
        if (nextArg) {
          result.devices = nextArg;
          result.eachDevice = true; // --devices implies --each-device
          i++;
        }
        break;
      case '--each-device':
        result.eachDevice = true;
        break;
      case '--mode':
        if (nextArg && (nextArg === 'local' || nextArg === 'device-farm')) {
          result.mode = nextArg;
          i++;
        }
        break;
      case '--skip-build':
        result.skipBuild = true;
        break;
      case '--dry-run':
        result.dryRun = true;
        break;
      case '--list-models':
        result.listModels = true;
        break;
      case '--report-dir':
        if (nextArg) {
          result.reportDir = nextArg;
          i++;
        }
        break;
      case '--help':
      case '-h':
        result.help = true;
        break;
    }
  }

  if (!result.help && !result.listModels && !platformSet) {
    console.error('Error: --platform is required. Use --help for usage.');
    process.exit(1);
  }

  if (result.eachDevice && result.mode === 'device-farm') {
    console.error(
      'Error: --each-device cannot be used with --mode device-farm.',
    );
    console.error('Device Farm manages its own device. Remove --each-device.');
    process.exit(1);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Git Info
// ---------------------------------------------------------------------------

function getGitInfo(): {branch: string; commit: string} {
  try {
    const branch = execSync('git branch --show-current', {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }).trim();
    const commit = execSync('git rev-parse --short HEAD', {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }).trim();
    return {branch, commit};
  } catch {
    return {branch: 'unknown', commit: 'unknown'};
  }
}

// ---------------------------------------------------------------------------
// Device Loading & Filtering
// ---------------------------------------------------------------------------

function loadDevices(): DeviceConfig[] {
  if (!fs.existsSync(DEVICES_FILE)) {
    console.error(`Error: ${DEVICES_FILE} not found.`);
    console.error('Copy the template to get started:');
    console.error(`  cp ${DEVICES_TEMPLATE} ${DEVICES_FILE}`);
    console.error('Then edit devices.json for your machine.');
    process.exit(1);
  }

  const raw = fs.readFileSync(DEVICES_FILE, 'utf8');
  const inventory: DeviceInventory = JSON.parse(raw);

  if (!inventory.devices || !Array.isArray(inventory.devices)) {
    console.error('Error: devices.json must have a "devices" array.');
    process.exit(1);
  }

  return inventory.devices;
}

function getConnectedAndroidUdids(): Set<string> {
  try {
    const output = execSync('adb devices', {encoding: 'utf8', timeout: 5000});
    const udids = new Set<string>();
    for (const line of output.split('\n')) {
      const match = line.match(/^(\S+)\s+device$/);
      if (match) {
        udids.add(match[1]);
      }
    }
    return udids;
  } catch {
    return new Set();
  }
}

function getConnectedIosUdids(): Set<string> {
  try {
    const output = execSync('xcrun xctrace list devices 2>/dev/null', {
      encoding: 'utf8',
      timeout: 10000,
    });
    const udids = new Set<string>();
    // Matches lines like: "iPhone 15 (18.2) (00008110-XXXXXXXXXXXX)"
    for (const match of output.matchAll(/\(([0-9A-F-]{20,})\)/gi)) {
      udids.add(match[1]);
    }
    return udids;
  } catch {
    return new Set();
  }
}

function getConnectedUdids(platform: 'ios' | 'android' | 'both'): Set<string> {
  const udids = new Set<string>();
  if (platform === 'android' || platform === 'both') {
    for (const udid of getConnectedAndroidUdids()) {
      udids.add(udid);
    }
  }
  if (platform === 'ios' || platform === 'both') {
    for (const udid of getConnectedIosUdids()) {
      udids.add(udid);
    }
  }
  return udids;
}

function filterDevices(
  devices: DeviceConfig[],
  platform: 'ios' | 'android' | 'both',
  deviceFilter: string,
): DeviceConfig[] {
  let filtered = devices;
  if (platform !== 'both') {
    filtered = filtered.filter(d => d.platform === platform);
  }

  switch (deviceFilter) {
    case 'all':
      filtered = filtered.filter(d => d.enabled);
      break;
    case 'virtual-only':
      filtered = filtered.filter(
        d => d.enabled && (d.type === 'simulator' || d.type === 'emulator'),
      );
      break;
    case 'real-only':
      filtered = filtered.filter(d => d.enabled && d.type === 'real');
      break;
    case 'connected': {
      console.log('Detecting connected devices...');
      const connectedUdids = getConnectedUdids(platform);
      if (connectedUdids.size === 0) {
        console.log('  No connected devices detected.');
      } else {
        console.log(
          `  Found ${connectedUdids.size} connected device(s): ${[...connectedUdids].join(', ')}`,
        );
      }
      filtered = filtered.filter(d => {
        if (!d.udid) {
          return false;
        }
        return connectedUdids.has(d.udid);
      });
      break;
    }
    default: {
      const ids = deviceFilter.split(',').map(id => id.trim());
      filtered = filtered.filter(d => ids.includes(d.id));
      break;
    }
  }

  return filtered;
}

// ---------------------------------------------------------------------------
// Model Loading & Filtering
// ---------------------------------------------------------------------------

function getModelsForIteration(
  filterIds?: string[],
  useAllModels = false,
): ModelTestConfig[] {
  const modelPool = useAllModels ? ALL_MODELS : TEST_MODELS;

  if (!filterIds) {
    return modelPool;
  }

  const filtered = modelPool.filter(m =>
    filterIds.some(id => m.id.toLowerCase() === id.toLowerCase()),
  );

  if (filtered.length === 0) {
    console.error(
      `Error: No models matched filter. Available: ${modelPool.map(m => m.id).join(', ')}`,
    );
    process.exit(1);
  }

  return filtered;
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

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function buildApps(
  platform: 'ios' | 'android' | 'both',
  dryRun: boolean,
): void {
  if (platform === 'ios' || platform === 'both') {
    const cmd = 'yarn ios:build:e2e';
    if (dryRun) {
      console.log(`[DRY RUN] Would run: ${cmd} (cwd: ${REPO_ROOT})`);
    } else {
      console.log('Building iOS E2E app...');
      execSync(cmd, {stdio: 'inherit', cwd: REPO_ROOT});
    }
  }
  if (platform === 'android' || platform === 'both') {
    const cmd = 'cd android && ./gradlew assembleRelease';
    if (dryRun) {
      console.log(`[DRY RUN] Would run: ${cmd} (cwd: ${REPO_ROOT})`);
    } else {
      console.log('Building Android release APK...');
      execSync(cmd, {stdio: 'inherit', cwd: REPO_ROOT});
    }
  }
}

// ---------------------------------------------------------------------------
// WDIO Config Selection
// ---------------------------------------------------------------------------

/**
 * Resolve a spec name to its file path.
 * Checks specs/{name}.spec.ts first, then specs/features/{name}.spec.ts.
 */
function resolveSpecPath(spec: string): string {
  if (spec === 'all') {
    return '';
  }

  const direct = path.join(E2E_DIR, 'specs', `${spec}.spec.ts`);
  if (fs.existsSync(direct)) {
    return `specs/${spec}.spec.ts`;
  }

  const feature = path.join(E2E_DIR, 'specs', 'features', `${spec}.spec.ts`);
  if (fs.existsSync(feature)) {
    return `specs/features/${spec}.spec.ts`;
  }

  // Fallback: assume top-level (WDIO will report the error if missing)
  return `specs/${spec}.spec.ts`;
}

function getWdioConfig(
  platform: 'ios' | 'android',
  mode: 'local' | 'device-farm',
): string {
  if (mode === 'device-farm') {
    return platform === 'ios' ? 'wdio.ios.conf.ts' : 'wdio.android.conf.ts';
  }
  return platform === 'ios'
    ? 'wdio.ios.local.conf.ts'
    : 'wdio.android.local.conf.ts';
}

// ---------------------------------------------------------------------------
// Test Execution
// ---------------------------------------------------------------------------

function getRunSubdir(
  device: DeviceConfig | null,
  model: ModelTestConfig | null,
): string {
  const parts: string[] = [];
  if (device) {
    parts.push(device.id);
  }
  if (model) {
    parts.push(model.id);
  }
  return parts.length > 0 ? parts.join(path.sep) : '.';
}

function getRunLabel(
  device: DeviceConfig | null,
  model: ModelTestConfig | null,
  platform: 'ios' | 'android',
): string {
  const parts: string[] = [];
  if (device) {
    parts.push(device.name);
  } else {
    parts.push(platform);
  }
  if (model) {
    parts.push(model.id);
  }
  return parts.join(' / ');
}

function findJunitFiles(dir: string): string[] {
  const results: string[] = [];

  try {
    const entries = fs.readdirSync(dir, {withFileTypes: true});
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findJunitFiles(fullPath));
      } else if (
        entry.name.startsWith('junit-') &&
        entry.name.endsWith('.xml')
      ) {
        results.push(fullPath);
      }
    }
  } catch {
    // Directory may not exist
  }

  return results;
}

function runSingleTest(opts: {
  spec: string;
  platform: 'ios' | 'android';
  mode: 'local' | 'device-farm';
  model: ModelTestConfig | null;
  device: DeviceConfig | null;
  appiumPort: number;
  reportDir: string;
}): TestRunResult {
  const {spec, platform, mode, model, device, appiumPort, reportDir} = opts;
  const startTime = Date.now();

  const configFile = getWdioConfig(platform, mode);
  const specArg = spec === 'all' ? '' : `--spec ${resolveSpecPath(spec)}`;
  const label = getRunLabel(device, model, platform);

  // Per-run report subdirectory
  const subdir = getRunSubdir(device, model);
  const runReportDir =
    subdir === '.' ? reportDir : path.join(reportDir, subdir);
  fs.mkdirSync(runReportDir, {recursive: true});
  fs.mkdirSync(path.join(runReportDir, 'screenshots'), {recursive: true});

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Run: ${label}`);
  console.log(`Spec: ${spec} | Config: ${configFile}`);
  if (device) {
    console.log(
      `Device: ${device.deviceName} (${device.type}) | Port: ${appiumPort}`,
    );
  }
  if (model) {
    console.log(`Model: ${model.id} (${model.downloadFile})`);
  }
  console.log(`${'='.repeat(60)}\n`);

  // Build env vars
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    DEVICEFARM_LOG_DIR: runReportDir,
    DEVICEFARM_SCREENSHOT_PATH: path.join(runReportDir, 'screenshots'),
  };

  if (model) {
    env.TEST_MODELS = model.id;
  }

  if (device) {
    env.E2E_DEVICE_NAME = device.deviceName;
    env.E2E_PLATFORM_VERSION = device.platformVersion;
    env.E2E_APPIUM_PORT = String(appiumPort);
    if (device.udid) {
      env.E2E_DEVICE_UDID = device.udid;
    }
    if (device.appPath) {
      env.E2E_APP_PATH = device.appPath;
    }
    if (device.xcodeOrgId) {
      env.E2E_XCODE_ORG_ID = device.xcodeOrgId;
    }
    if (device.xcodeSigningId) {
      env.E2E_XCODE_SIGNING_ID = device.xcodeSigningId;
    }
  }

  try {
    execSync(`npx wdio ${configFile} ${specArg}`, {
      stdio: 'inherit',
      cwd: E2E_DIR,
      env,
    });

    const duration = Date.now() - startTime;
    console.log(
      `\n[PASS] ${label} completed in ${(duration / 1000).toFixed(1)}s\n`,
    );

    return {
      deviceId: device?.id ?? null,
      deviceName: device?.name ?? null,
      devicePlatform: platform,
      deviceType: device?.type ?? null,
      modelId: model?.id ?? null,
      spec,
      success: true,
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.log(
      `\n[FAIL] ${label} failed after ${(duration / 1000).toFixed(1)}s\n`,
    );

    return {
      deviceId: device?.id ?? null,
      deviceName: device?.name ?? null,
      devicePlatform: platform,
      deviceType: device?.type ?? null,
      modelId: model?.id ?? null,
      spec,
      success: false,
      duration,
      error: errorMessage,
    };
  }
}

// ---------------------------------------------------------------------------
// JUnit Merging
// ---------------------------------------------------------------------------

function mergeJUnitReports(reportDir: string): void {
  const junitFiles = findJunitFiles(reportDir);

  if (junitFiles.length === 0) {
    console.log('No JUnit files found to merge');
    return;
  }

  let totalTests = 0;
  let totalFailures = 0;
  let totalErrors = 0;
  let totalSkipped = 0;
  const testSuites: string[] = [];

  for (const filePath of junitFiles) {
    const content = fs.readFileSync(filePath, 'utf8');

    const suiteMatch = content.match(/<testsuite[\s\S]*?<\/testsuite>/g);
    if (suiteMatch) {
      for (const suite of suiteMatch) {
        testSuites.push(suite);

        const testsMatch = suite.match(/tests="(\d+)"/);
        const failuresMatch = suite.match(/failures="(\d+)"/);
        const errorsMatch = suite.match(/errors="(\d+)"/);
        const skippedMatch = suite.match(/skipped="(\d+)"/);

        if (testsMatch) {
          totalTests += parseInt(testsMatch[1], 10);
        }
        if (failuresMatch) {
          totalFailures += parseInt(failuresMatch[1], 10);
        }
        if (errorsMatch) {
          totalErrors += parseInt(errorsMatch[1], 10);
        }
        if (skippedMatch) {
          totalSkipped += parseInt(skippedMatch[1], 10);
        }
      }
    }
  }

  const mergedXml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites tests="${totalTests}" failures="${totalFailures}" errors="${totalErrors}" skipped="${totalSkipped}">
${testSuites.join('\n')}
</testsuites>`;

  const mergedPath = path.join(reportDir, 'junit-results.xml');
  fs.writeFileSync(mergedPath, mergedXml);
  console.log(
    `\nMerged ${junitFiles.length} JUnit reports into: ${mergedPath}`,
  );
  console.log(
    `  Total: ${totalTests} tests, ${totalFailures} failures, ${totalErrors} errors, ${totalSkipped} skipped`,
  );
}

// ---------------------------------------------------------------------------
// Model Reports (cumulative report from quick-smoke / load-stress specs)
// ---------------------------------------------------------------------------

interface ModelReport {
  model: string;
  prompt: string;
  response: string;
  timing: string;
  timestamp: string;
  success: boolean;
}

function printModelReports(reportDir: string): void {
  const reportPath = path.join(reportDir, 'all-models-report.json');
  if (!fs.existsSync(reportPath)) {
    return;
  }

  try {
    const reports: ModelReport[] = JSON.parse(
      fs.readFileSync(reportPath, 'utf8'),
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
      console.log(
        `  Response: ${report.response.substring(0, 100)}${report.response.length > 100 ? '...' : ''}`,
      );
    }
    console.log();
  } catch {
    // Ignore parse errors
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function printSummary(results: TestRunResult[]): void {
  console.log(`\n${'='.repeat(60)}`);
  console.log('TEST SUMMARY');
  console.log(`${'='.repeat(60)}\n`);

  const passed = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`Total runs: ${results.length}`);
  console.log(`Passed: ${passed.length}`);
  console.log(`Failed: ${failed.length}`);
  console.log(`Duration: ${(totalDuration / 1000 / 60).toFixed(1)} minutes\n`);

  if (passed.length > 0) {
    console.log('Passed:');
    passed.forEach(r => {
      const label = [r.deviceName, r.modelId].filter(Boolean).join(' / ');
      console.log(
        `  [PASS] ${label || r.devicePlatform} (${(r.duration / 1000).toFixed(1)}s)`,
      );
    });
    console.log();
  }

  if (failed.length > 0) {
    console.log('Failed:');
    failed.forEach(r => {
      const label = [r.deviceName, r.modelId].filter(Boolean).join(' / ');
      console.log(
        `  [FAIL] ${label || r.devicePlatform} (${(r.duration / 1000).toFixed(1)}s)`,
      );
    });
    console.log();
  }
}

function writeSummary(
  reportDir: string,
  args: RunArgs,
  results: TestRunResult[],
  gitInfo: {branch: string; commit: string},
  timestamp: string,
): void {
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  const summary: RunSummary = {
    timestamp,
    branch: gitInfo.branch,
    commit: gitInfo.commit,
    platform: args.platform,
    spec: args.spec,
    mode: args.mode,
    totalRuns: results.length,
    passed,
    failed,
    totalDuration,
    results,
  };

  const summaryPath = path.join(reportDir, 'summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`Summary written to: ${summaryPath}`);
}

// ---------------------------------------------------------------------------
// Dry Run
// ---------------------------------------------------------------------------

function printDryRun(
  args: RunArgs,
  platforms: Array<'ios' | 'android'>,
  devices: Array<DeviceConfig | null>,
  models: Array<ModelTestConfig | null>,
  reportDir: string,
  gitInfo: {branch: string; commit: string},
): void {
  console.log(`\n${'='.repeat(60)}`);
  console.log('DRY RUN - No tests will be executed');
  console.log(`${'='.repeat(60)}\n`);

  console.log(`Branch: ${gitInfo.branch}`);
  console.log(`Commit: ${gitInfo.commit}`);
  console.log(`Platform: ${args.platform}`);
  console.log(`Spec: ${args.spec}`);
  console.log(`Mode: ${args.mode}`);
  console.log(`Report dir: ${reportDir}`);
  console.log(`Skip build: ${args.skipBuild}`);
  console.log(
    `Devices: ${devices[0] === null ? 'default (1)' : `${devices.length} matched`}`,
  );
  console.log(
    `Models: ${models[0] === null ? 'default (spec decides)' : `${models.length} matched`}`,
  );

  if (!args.skipBuild && args.mode === 'local') {
    console.log('\nBuild commands:');
    if (args.platform === 'ios' || args.platform === 'both') {
      console.log(`  yarn ios:build:e2e (cwd: ${REPO_ROOT})`);
    }
    if (args.platform === 'android' || args.platform === 'both') {
      console.log(
        `  cd android && ./gradlew assembleRelease (cwd: ${REPO_ROOT})`,
      );
    }
  }

  console.log('\nTest runs:');
  let runIndex = 0;
  let portIndex = 0;

  for (const device of devices) {
    const runPlatforms = device ? [device.platform] : platforms;

    for (const platform of runPlatforms) {
      for (const model of models) {
        runIndex++;
        const configFile = getWdioConfig(platform, args.mode);
        const specArg =
          args.spec === 'all' ? '' : `--spec ${resolveSpecPath(args.spec)}`;
        const port = BASE_APPIUM_PORT + portIndex;
        const label = getRunLabel(device, model, platform);

        console.log(`\n  ${runIndex}. ${label}`);
        console.log(`     Command: npx wdio ${configFile} ${specArg}`);

        if (model) {
          console.log(`     Env: TEST_MODELS=${model.id}`);
        }
        if (device) {
          console.log(`          E2E_DEVICE_NAME=${device.deviceName}`);
          console.log(
            `          E2E_PLATFORM_VERSION=${device.platformVersion}`,
          );
          console.log(`          E2E_APPIUM_PORT=${port}`);
          if (device.udid) {
            console.log(`          E2E_DEVICE_UDID=${device.udid}`);
          }
          if (device.appPath) {
            console.log(`          E2E_APP_PATH=${device.appPath}`);
          }
          if (device.xcodeOrgId) {
            console.log(`          E2E_XCODE_ORG_ID=${device.xcodeOrgId}`);
          }
        }
      }
    }
    portIndex++;
  }

  console.log();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

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

  const gitInfo = getGitInfo();
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('Z', '');
  const reportDir = args.reportDir || path.join(REPORTS_DIR, timestamp);

  // Resolve platforms
  const platforms: Array<'ios' | 'android'> =
    args.platform === 'both' ? ['ios', 'android'] : [args.platform];

  // Resolve devices
  let devices: Array<DeviceConfig | null>;
  if (args.eachDevice) {
    const allDevices = loadDevices();
    const filtered = filterDevices(allDevices, args.platform, args.devices);
    if (filtered.length === 0) {
      console.error('Error: No devices matched the filter criteria.');
      console.error(`Platform: ${args.platform}, Filter: ${args.devices}`);
      console.error(
        'Check devices.json and ensure matching devices have "enabled": true',
      );
      process.exit(1);
    }
    devices = filtered;
  } else {
    devices = [null];
  }

  // Resolve models
  let models: Array<ModelTestConfig | null>;
  if (args.eachModel || args.models) {
    const pool = getModelsForIteration(args.models, args.allModels);
    models = pool;
  } else {
    models = [null];
  }

  // Dry run
  if (args.dryRun) {
    printDryRun(args, platforms, devices, models, reportDir, gitInfo);
    if (!args.skipBuild && args.mode === 'local') {
      buildApps(args.platform, true);
    }
    return;
  }

  // Create report directory
  fs.mkdirSync(reportDir, {recursive: true});

  // Build step
  if (!args.skipBuild && args.mode === 'local') {
    console.log('Building apps...\n');
    buildApps(args.platform, false);
  } else if (args.skipBuild) {
    console.log('Skipping build step (--skip-build)\n');
  }

  // Print banner
  console.log(`\n${'='.repeat(60)}`);
  console.log('E2E Test Runner');
  console.log(`${'='.repeat(60)}`);
  console.log(`Branch: ${gitInfo.branch} | Commit: ${gitInfo.commit}`);
  console.log(
    `Platform: ${args.platform} | Spec: ${args.spec} | Mode: ${args.mode}`,
  );
  console.log(
    `Devices: ${devices[0] === null ? 'default' : devices.length}`,
  );
  console.log(
    `Models: ${models[0] === null ? 'default' : (models as ModelTestConfig[]).map(m => m.id).join(', ')}`,
  );
  console.log(`${'='.repeat(60)}\n`);

  // Run tests
  const results: TestRunResult[] = [];
  let portIndex = 0;

  for (const device of devices) {
    const appiumPort = BASE_APPIUM_PORT + portIndex;
    const runPlatforms = device ? [device.platform] : platforms;

    for (const platform of runPlatforms) {
      for (const model of models) {
        const result = runSingleTest({
          spec: args.spec,
          platform,
          mode: args.mode,
          model,
          device,
          appiumPort,
          reportDir,
        });
        results.push(result);
      }
    }
    portIndex++;
  }

  // Print results
  printSummary(results);
  printModelReports(reportDir);
  mergeJUnitReports(reportDir);
  writeSummary(reportDir, args, results, gitInfo, timestamp);

  // Exit with error code if any tests failed
  const hasFailures = results.some(r => !r.success);
  process.exit(hasFailures ? 1 : 0);
}

main().catch(error => {
  console.error('Runner failed:', error);
  process.exit(1);
});
