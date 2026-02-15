#!/usr/bin/env npx ts-node

/**
 * E2E Multi-Device Pipeline Runner
 *
 * Runs E2E tests sequentially across multiple simulators, emulators,
 * and USB-connected real devices from a single command.
 *
 * Prerequisites:
 *   - Copy e2e/devices.template.json to e2e/devices.json and customize
 *   - Build apps before running (or omit --skip-build to build automatically)
 *
 * Usage:
 *   npx ts-node scripts/run-e2e-pipeline.ts --platform ios
 *   npx ts-node scripts/run-e2e-pipeline.ts --platform android --spec quick-smoke
 *   npx ts-node scripts/run-e2e-pipeline.ts --platform both --skip-build --dry-run
 *   npx ts-node scripts/run-e2e-pipeline.ts --platform ios --devices iphone-17-pro-sim
 *   npx ts-node scripts/run-e2e-pipeline.ts --platform ios --devices virtual-only
 *   npx ts-node scripts/run-e2e-pipeline.ts --help
 */

import {execSync} from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

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
}

interface DeviceInventory {
  devices: DeviceConfig[];
}

interface PipelineArgs {
  platform: 'ios' | 'android' | 'both';
  devices: 'all' | 'virtual-only' | 'real-only' | string;
  spec: string;
  skipBuild: boolean;
  dryRun: boolean;
  reportDir?: string;
  help: boolean;
}

interface DeviceTestResult {
  deviceId: string;
  deviceName: string;
  platform: 'ios' | 'android';
  type: 'simulator' | 'emulator' | 'real';
  success: boolean;
  duration: number;
  error?: string;
  junitFile?: string;
}

interface PipelineSummary {
  timestamp: string;
  branch: string;
  commit: string;
  platform: string;
  spec: string;
  totalDevices: number;
  passed: number;
  failed: number;
  totalDuration: number;
  results: DeviceTestResult[];
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
// CLI Arg Parsing (pattern from run-crash-repro.ts)
// ---------------------------------------------------------------------------

function printHelp(): void {
  console.log(`
E2E Multi-Device Pipeline Runner

USAGE:
  npx ts-node scripts/run-e2e-pipeline.ts [OPTIONS]

OPTIONS:
  --platform <platform>    Platform to test: 'ios', 'android', or 'both' (required)
  --devices <filter>       Device filter: 'all', 'virtual-only', 'real-only',
                           or comma-separated device IDs (default: 'all')
  --spec <spec>            Test spec: 'quick-smoke', 'load-stress', 'diagnostic',
                           or 'all' (default: 'quick-smoke')
  --skip-build             Skip app build step
  --dry-run                Print matched devices and commands without executing
  --report-dir <path>      Custom report directory (default: e2e/reports/<timestamp>)
  --help                   Show this help message

EXAMPLES:
  # Run iOS tests on all enabled devices
  npx ts-node scripts/run-e2e-pipeline.ts --platform ios

  # Run quick-smoke on a specific simulator
  npx ts-node scripts/run-e2e-pipeline.ts --platform ios --devices iphone-17-pro-sim

  # Dry run to see what would execute
  npx ts-node scripts/run-e2e-pipeline.ts --platform both --dry-run

  # Run on virtual devices only (simulators + emulators), skip build
  npx ts-node scripts/run-e2e-pipeline.ts --platform both --devices virtual-only --skip-build

  # Run all specs on real devices
  npx ts-node scripts/run-e2e-pipeline.ts --platform ios --devices real-only --spec all

SETUP:
  1. Copy devices.template.json to devices.json
  2. Edit devices.json for your machine (device names, UDIDs, paths)
  3. Enable the devices you want to test
  4. Run the pipeline
`);
}

function parseArgs(): PipelineArgs {
  const args = process.argv.slice(2);
  const result: PipelineArgs = {
    platform: 'ios',
    devices: 'all',
    spec: 'quick-smoke',
    skipBuild: false,
    dryRun: false,
    help: false,
  };

  let platformSet = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--platform':
        if (nextArg && (nextArg === 'ios' || nextArg === 'android' || nextArg === 'both')) {
          result.platform = nextArg;
          platformSet = true;
          i++;
        }
        break;
      case '--devices':
        if (nextArg) {
          result.devices = nextArg;
          i++;
        }
        break;
      case '--spec':
        if (nextArg) {
          result.spec = nextArg;
          i++;
        }
        break;
      case '--skip-build':
        result.skipBuild = true;
        break;
      case '--dry-run':
        result.dryRun = true;
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

  if (!result.help && !platformSet) {
    console.error('Error: --platform is required. Use --help for usage.');
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
    console.error(`Copy the template to get started:`);
    console.error(`  cp ${DEVICES_TEMPLATE} ${DEVICES_FILE}`);
    console.error(`Then edit devices.json for your machine.`);
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

function filterDevices(
  devices: DeviceConfig[],
  platform: 'ios' | 'android' | 'both',
  deviceFilter: string,
): DeviceConfig[] {
  // Filter by platform
  let filtered = devices;
  if (platform !== 'both') {
    filtered = filtered.filter(d => d.platform === platform);
  }

  // Filter by device selection
  switch (deviceFilter) {
    case 'all':
      // Only enabled devices
      filtered = filtered.filter(d => d.enabled);
      break;
    case 'virtual-only':
      filtered = filtered.filter(d => d.enabled && (d.type === 'simulator' || d.type === 'emulator'));
      break;
    case 'real-only':
      filtered = filtered.filter(d => d.enabled && d.type === 'real');
      break;
    default: {
      // Comma-separated device IDs - include even if disabled (explicit selection)
      const ids = deviceFilter.split(',').map(id => id.trim());
      filtered = filtered.filter(d => ids.includes(d.id));
      break;
    }
  }

  return filtered;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function buildApps(platform: 'ios' | 'android' | 'both', dryRun: boolean): void {
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
// Device Test Execution
// ---------------------------------------------------------------------------

function runDeviceTest(
  device: DeviceConfig,
  spec: string,
  appiumPort: number,
  reportDir: string,
): DeviceTestResult {
  const startTime = Date.now();
  const configFile = device.platform === 'ios'
    ? 'wdio.ios.local.conf.ts'
    : 'wdio.android.local.conf.ts';

  // Determine spec file(s)
  const specArg = spec === 'all' ? '' : `--spec specs/${spec}.spec.ts`;

  // Per-device report directory
  const deviceReportDir = path.join(reportDir, device.id);
  fs.mkdirSync(deviceReportDir, {recursive: true});
  fs.mkdirSync(path.join(deviceReportDir, 'screenshots'), {recursive: true});

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Device: ${device.name} (${device.id})`);
  console.log(`Platform: ${device.platform} | Type: ${device.type}`);
  console.log(`Appium port: ${appiumPort}`);
  console.log(`${'='.repeat(60)}\n`);

  try {
    execSync(
      `npx wdio ${configFile} ${specArg}`,
      {
        stdio: 'inherit',
        cwd: E2E_DIR,
        env: {
          ...process.env,
          E2E_DEVICE_NAME: device.deviceName,
          E2E_PLATFORM_VERSION: device.platformVersion,
          ...(device.udid && {E2E_DEVICE_UDID: device.udid}),
          ...(device.appPath && {E2E_APP_PATH: device.appPath}),
          E2E_APPIUM_PORT: String(appiumPort),
          // Direct JUnit output to device-specific directory
          DEVICEFARM_LOG_DIR: deviceReportDir,
          DEVICEFARM_SCREENSHOT_PATH: path.join(deviceReportDir, 'screenshots'),
        },
      },
    );

    const duration = Date.now() - startTime;
    console.log(`\n[PASS] ${device.name} completed in ${(duration / 1000).toFixed(1)}s\n`);

    // Find the JUnit file generated for this device
    const junitFile = findJunitFile(deviceReportDir);

    return {
      deviceId: device.id,
      deviceName: device.name,
      platform: device.platform,
      type: device.type,
      success: true,
      duration,
      junitFile,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.log(`\n[FAIL] ${device.name} failed after ${(duration / 1000).toFixed(1)}s\n`);

    const junitFile = findJunitFile(deviceReportDir);

    return {
      deviceId: device.id,
      deviceName: device.name,
      platform: device.platform,
      type: device.type,
      success: false,
      duration,
      error: errorMessage,
      junitFile,
    };
  }
}

function findJunitFile(dir: string): string | undefined {
  try {
    const files = fs.readdirSync(dir).filter(f => f.startsWith('junit-') && f.endsWith('.xml'));
    if (files.length > 0) {
      return path.join(dir, files[0]);
    }
  } catch {
    // Directory may not exist yet
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// JUnit Merging (pattern from run-model-tests.ts:227-275)
// ---------------------------------------------------------------------------

function mergeJUnitReports(reportDir: string): void {
  // Walk subdirectories and find junit-*.xml files
  const junitFiles: string[] = [];

  try {
    const subdirs = fs.readdirSync(reportDir).filter(f => {
      const fullPath = path.join(reportDir, f);
      return fs.statSync(fullPath).isDirectory();
    });

    for (const subdir of subdirs) {
      const subdirPath = path.join(reportDir, subdir);
      const files = fs.readdirSync(subdirPath)
        .filter(f => f.startsWith('junit-') && f.endsWith('.xml'));
      for (const file of files) {
        junitFiles.push(path.join(subdirPath, file));
      }
    }
  } catch {
    // Ignore errors reading directories
  }

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

    // Extract testsuite elements (everything between <testsuite and </testsuite>)
    const suiteMatch = content.match(/<testsuite[\s\S]*?<\/testsuite>/g);
    if (suiteMatch) {
      for (const suite of suiteMatch) {
        testSuites.push(suite);

        // Parse counts from testsuite attributes
        const testsMatch = suite.match(/tests="(\d+)"/);
        const failuresMatch = suite.match(/failures="(\d+)"/);
        const errorsMatch = suite.match(/errors="(\d+)"/);
        const skippedMatch = suite.match(/skipped="(\d+)"/);

        if (testsMatch) totalTests += parseInt(testsMatch[1], 10);
        if (failuresMatch) totalFailures += parseInt(failuresMatch[1], 10);
        if (errorsMatch) totalErrors += parseInt(errorsMatch[1], 10);
        if (skippedMatch) totalSkipped += parseInt(skippedMatch[1], 10);
      }
    }
  }

  // Create merged JUnit XML
  const mergedXml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites tests="${totalTests}" failures="${totalFailures}" errors="${totalErrors}" skipped="${totalSkipped}">
${testSuites.join('\n')}
</testsuites>`;

  const mergedPath = path.join(reportDir, 'junit-results.xml');
  fs.writeFileSync(mergedPath, mergedXml);
  console.log(`\nMerged ${junitFiles.length} JUnit reports into: ${mergedPath}`);
  console.log(`  Total: ${totalTests} tests, ${totalFailures} failures, ${totalErrors} errors, ${totalSkipped} skipped`);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function printSummary(results: DeviceTestResult[]): void {
  console.log(`\n${'='.repeat(60)}`);
  console.log('PIPELINE SUMMARY');
  console.log(`${'='.repeat(60)}\n`);

  const passed = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`Total devices: ${results.length}`);
  console.log(`Passed: ${passed.length}`);
  console.log(`Failed: ${failed.length}`);
  console.log(`Duration: ${(totalDuration / 1000 / 60).toFixed(1)} minutes\n`);

  if (passed.length > 0) {
    console.log('Passed:');
    passed.forEach(r => {
      console.log(`  [PASS] ${r.deviceName} (${(r.duration / 1000).toFixed(1)}s)`);
    });
    console.log();
  }

  if (failed.length > 0) {
    console.log('Failed:');
    failed.forEach(r => {
      console.log(`  [FAIL] ${r.deviceName} (${(r.duration / 1000).toFixed(1)}s)`);
    });
    console.log();
  }
}

function writeSummary(
  reportDir: string,
  args: PipelineArgs,
  results: DeviceTestResult[],
  gitInfo: {branch: string; commit: string},
  timestamp: string,
): void {
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  const summary: PipelineSummary = {
    timestamp,
    branch: gitInfo.branch,
    commit: gitInfo.commit,
    platform: args.platform,
    spec: args.spec,
    totalDevices: results.length,
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
  devices: DeviceConfig[],
  args: PipelineArgs,
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
  console.log(`Report dir: ${reportDir}`);
  console.log(`Skip build: ${args.skipBuild}`);
  console.log(`Matched devices: ${devices.length}\n`);

  if (!args.skipBuild) {
    console.log('Build commands:');
    if (args.platform === 'ios' || args.platform === 'both') {
      console.log(`  yarn ios:build:e2e (cwd: ${REPO_ROOT})`);
    }
    if (args.platform === 'android' || args.platform === 'both') {
      console.log(`  cd android && ./gradlew assembleRelease (cwd: ${REPO_ROOT})`);
    }
    console.log();
  }

  console.log('Device test commands:');
  devices.forEach((device, index) => {
    const configFile = device.platform === 'ios'
      ? 'wdio.ios.local.conf.ts'
      : 'wdio.android.local.conf.ts';
    const specArg = args.spec === 'all' ? '' : `--spec specs/${args.spec}.spec.ts`;
    const port = BASE_APPIUM_PORT + index;

    console.log(`\n  ${index + 1}. ${device.name} (${device.id})`);
    console.log(`     Platform: ${device.platform} | Type: ${device.type}`);
    console.log(`     Command: npx wdio ${configFile} ${specArg}`);
    console.log(`     Env: E2E_DEVICE_NAME=${device.deviceName}`);
    console.log(`          E2E_PLATFORM_VERSION=${device.platformVersion}`);
    console.log(`          E2E_APPIUM_PORT=${port}`);
    if (device.udid) {
      console.log(`          E2E_DEVICE_UDID=${device.udid}`);
    }
    if (device.appPath) {
      console.log(`          E2E_APP_PATH=${device.appPath}`);
    }
  });

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

  // Print git info for visibility
  const gitInfo = getGitInfo();
  console.log(`\n${'='.repeat(60)}`);
  console.log('E2E Multi-Device Pipeline');
  console.log(`${'='.repeat(60)}`);
  console.log(`Branch: ${gitInfo.branch}`);
  console.log(`Commit: ${gitInfo.commit}`);
  console.log(`Platform: ${args.platform}`);
  console.log(`Spec: ${args.spec}`);
  console.log(`${'='.repeat(60)}\n`);

  // Load and filter devices
  const allDevices = loadDevices();
  const devices = filterDevices(allDevices, args.platform, args.devices);

  if (devices.length === 0) {
    console.error('Error: No devices matched the filter criteria.');
    console.error(`Platform: ${args.platform}, Filter: ${args.devices}`);
    console.error(`Total devices in inventory: ${allDevices.length}`);
    console.error(`\nCheck devices.json and ensure matching devices have "enabled": true`);
    process.exit(1);
  }

  // Create timestamped report directory
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '');
  const reportDir = args.reportDir || path.join(REPORTS_DIR, timestamp);

  // Dry run mode
  if (args.dryRun) {
    printDryRun(devices, args, reportDir, gitInfo);
    if (!args.skipBuild) {
      buildApps(args.platform, true);
    }
    return;
  }

  // Create report directory
  fs.mkdirSync(reportDir, {recursive: true});

  // Build step
  if (!args.skipBuild) {
    console.log('Building apps...\n');
    buildApps(args.platform, false);
  } else {
    console.log('Skipping build step (--skip-build)\n');
  }

  // Run tests on each device sequentially
  console.log(`Running tests on ${devices.length} device(s)...\n`);
  const results: DeviceTestResult[] = [];

  for (let i = 0; i < devices.length; i++) {
    const device = devices[i];
    const appiumPort = BASE_APPIUM_PORT + i;
    const result = runDeviceTest(device, args.spec, appiumPort, reportDir);
    results.push(result);
  }

  // Print summary
  printSummary(results);

  // Merge JUnit reports
  mergeJUnitReports(reportDir);

  // Write summary.json
  writeSummary(reportDir, args, results, gitInfo, timestamp);

  // Exit with error code if any tests failed
  const hasFailures = results.some(r => !r.success);
  process.exit(hasFailures ? 1 : 0);
}

main().catch(error => {
  console.error('Pipeline failed:', error);
  process.exit(1);
});
