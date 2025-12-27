#!/usr/bin/env node
/**
 * AWS Device Farm Test Runner
 *
 * This script uploads the app and test package to AWS Device Farm
 * and schedules a test run on real devices.
 *
 * Prerequisites:
 * - AWS credentials configured (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
 * - AWS_DEVICE_FARM_PROJECT_ARN environment variable set
 *
 * Usage:
 *   node scripts/run-aws-device-farm.js --platform android --app path/to/app.apk
 *   node scripts/run-aws-device-farm.js --platform ios --app path/to/app.ipa
 */

const {
  DeviceFarmClient,
  CreateUploadCommand,
  GetUploadCommand,
  ScheduleRunCommand,
  GetRunCommand,
  ListDevicePoolsCommand,
} = require('@aws-sdk/client-device-farm');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

// Configuration
const REGION = process.env.AWS_REGION || 'us-west-2';
const PROJECT_ARN = process.env.AWS_DEVICE_FARM_PROJECT_ARN;

// Parse command line arguments
const args = process.argv.slice(2);
const platformIndex = args.indexOf('--platform');
const appIndex = args.indexOf('--app');

const platform = platformIndex !== -1 ? args[platformIndex + 1] : 'android';
const appPath = appIndex !== -1 ? args[appIndex + 1] : null;

if (!PROJECT_ARN) {
  console.error('Error: AWS_DEVICE_FARM_PROJECT_ARN environment variable is required');
  process.exit(1);
}

if (!appPath) {
  console.error('Error: --app argument is required');
  process.exit(1);
}

const client = new DeviceFarmClient({ region: REGION });

/**
 * Upload a file to AWS Device Farm
 */
async function uploadFile(filePath, type, name) {
  console.log(`Uploading ${name}...`);

  // Create upload
  const createUploadResponse = await client.send(
    new CreateUploadCommand({
      projectArn: PROJECT_ARN,
      name,
      type,
    })
  );

  const upload = createUploadResponse.upload;
  const uploadUrl = upload.url;

  // Upload file to presigned URL
  const fileContent = fs.readFileSync(filePath);

  await new Promise((resolve, reject) => {
    const url = new URL(uploadUrl);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': fileContent.length,
      },
    };

    const req = https.request(options, (res) => {
      if (res.statusCode === 200) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${res.statusCode}`));
      }
    });

    req.on('error', reject);
    req.write(fileContent);
    req.end();
  });

  // Wait for upload to complete
  let uploadStatus = 'PROCESSING';
  while (uploadStatus === 'PROCESSING' || uploadStatus === 'INITIALIZED') {
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const getUploadResponse = await client.send(
      new GetUploadCommand({ arn: upload.arn })
    );
    uploadStatus = getUploadResponse.upload.status;

    if (uploadStatus === 'FAILED') {
      throw new Error(`Upload failed: ${getUploadResponse.upload.message}`);
    }
  }

  console.log(`Upload complete: ${upload.arn}`);
  return upload.arn;
}

/**
 * Create test package zip
 */
function createTestPackage() {
  console.log('Creating test package...');

  const packageDir = path.join(__dirname, '..');
  const zipPath = path.join(packageDir, 'test-package.zip');

  // Remove existing zip
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  // Create zip with node_modules, specs, helpers, and config files
  execSync(
    `cd ${packageDir} && zip -r test-package.zip node_modules specs helpers wdio.*.conf.js`,
    { stdio: 'inherit' }
  );

  return zipPath;
}

/**
 * Get the default device pool ARN
 */
async function getDevicePoolArn() {
  const response = await client.send(
    new ListDevicePoolsCommand({
      arn: PROJECT_ARN,
      type: 'CURATED',
    })
  );

  // Find the "Top Devices" pool or first available
  const topDevices = response.devicePools.find((pool) =>
    pool.name.toLowerCase().includes('top')
  );

  if (topDevices) {
    return topDevices.arn;
  }

  if (response.devicePools.length > 0) {
    return response.devicePools[0].arn;
  }

  throw new Error('No device pools available');
}

/**
 * Wait for test run to complete
 */
async function waitForRunComplete(runArn) {
  console.log('Waiting for test run to complete...');

  let status = 'PENDING';
  while (!['COMPLETED', 'STOPPING', 'ERRORED'].includes(status)) {
    await new Promise((resolve) => setTimeout(resolve, 30000));

    const response = await client.send(new GetRunCommand({ arn: runArn }));
    status = response.run.status;
    const result = response.run.result;

    console.log(`Status: ${status}, Result: ${result || 'pending'}`);

    if (status === 'RUNNING') {
      const counters = response.run.counters;
      if (counters) {
        console.log(
          `  Passed: ${counters.passed}, Failed: ${counters.failed}, Errored: ${counters.errored}`
        );
      }
    }
  }

  const finalResponse = await client.send(new GetRunCommand({ arn: runArn }));
  return finalResponse.run;
}

/**
 * Main function
 */
async function main() {
  try {
    console.log(`\n=== AWS Device Farm Test Runner ===`);
    console.log(`Platform: ${platform}`);
    console.log(`App: ${appPath}`);
    console.log(`Project: ${PROJECT_ARN}\n`);

    // Determine app type
    const appType = platform === 'ios' ? 'IOS_APP' : 'ANDROID_APP';
    const testType = 'APPIUM_NODE_TEST_PACKAGE';

    // Upload app
    const appArn = await uploadFile(appPath, appType, path.basename(appPath));

    // Create and upload test package
    const testPackagePath = createTestPackage();
    const testPackageArn = await uploadFile(
      testPackagePath,
      testType,
      'test-package.zip'
    );

    // Get device pool
    const devicePoolArn = await getDevicePoolArn();
    console.log(`Using device pool: ${devicePoolArn}`);

    // Schedule run
    console.log('Scheduling test run...');
    const scheduleResponse = await client.send(
      new ScheduleRunCommand({
        projectArn: PROJECT_ARN,
        appArn,
        devicePoolArn,
        name: `PocketPal E2E - ${platform} - ${new Date().toISOString()}`,
        test: {
          type: 'APPIUM_NODE',
          testPackageArn,
          testSpec: {
            type: 'APPIUM_NODE_TEST_SPEC',
          },
        },
        configuration: {
          jobTimeoutMinutes: 60,
        },
      })
    );

    const runArn = scheduleResponse.run.arn;
    console.log(`Test run scheduled: ${runArn}`);

    // Wait for completion
    const finalRun = await waitForRunComplete(runArn);

    console.log('\n=== Test Run Complete ===');
    console.log(`Result: ${finalRun.result}`);
    console.log(`Status: ${finalRun.status}`);

    if (finalRun.counters) {
      console.log(`\nCounters:`);
      console.log(`  Total: ${finalRun.counters.total}`);
      console.log(`  Passed: ${finalRun.counters.passed}`);
      console.log(`  Failed: ${finalRun.counters.failed}`);
      console.log(`  Errored: ${finalRun.counters.errored}`);
      console.log(`  Skipped: ${finalRun.counters.skipped}`);
    }

    // Exit with error code if tests failed
    if (finalRun.result !== 'PASSED') {
      process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
