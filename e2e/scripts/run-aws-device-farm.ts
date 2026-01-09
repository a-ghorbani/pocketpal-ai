#!/usr/bin/env npx ts-node
/**
 * AWS Device Farm Test Runner
 *
 * Uploads the app and test package to AWS Device Farm
 * and schedules a test run on real devices.
 *
 * Prerequisites:
 * - AWS credentials configured (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
 * - AWS_DEVICE_FARM_PROJECT_ARN environment variable set
 *
 * Usage:
 *   npx ts-node scripts/run-aws-device-farm.ts --platform android --app path/to/app.apk
 *   npx ts-node scripts/run-aws-device-farm.ts --platform ios --app path/to/app.ipa
 */

import {
  DeviceFarmClient,
  CreateUploadCommand,
  GetUploadCommand,
  ScheduleRunCommand,
  GetRunCommand,
  ListDevicePoolsCommand,
  Upload,
  Run,
} from '@aws-sdk/client-device-farm';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import {execSync} from 'child_process';

const REGION = process.env.AWS_REGION || 'us-west-2';
const PROJECT_ARN = process.env.AWS_DEVICE_FARM_PROJECT_ARN;

const args = process.argv.slice(2);
const platformIndex = args.indexOf('--platform');
const appIndex = args.indexOf('--app');

const platform = platformIndex !== -1 ? args[platformIndex + 1] : 'android';
const appPath = appIndex !== -1 ? args[appIndex + 1] : null;

if (!PROJECT_ARN) {
  console.error(
    'Error: AWS_DEVICE_FARM_PROJECT_ARN environment variable is required',
  );
  process.exit(1);
}

if (!appPath) {
  console.error('Error: --app argument is required');
  process.exit(1);
}

const client = new DeviceFarmClient({region: REGION});

async function uploadFile(
  filePath: string,
  type: string,
  name: string,
): Promise<string> {
  console.log(`Uploading ${name}...`);

  const createUploadResponse = await client.send(
    new CreateUploadCommand({
      projectArn: PROJECT_ARN,
      name,
      type,
    }),
  );

  const upload = createUploadResponse.upload as Upload;
  const uploadUrl = upload.url as string;

  const fileContent = fs.readFileSync(filePath);

  await new Promise<void>((resolve, reject) => {
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

    const req = https.request(options, res => {
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

  let uploadStatus = 'PROCESSING';
  while (uploadStatus === 'PROCESSING' || uploadStatus === 'INITIALIZED') {
    await new Promise(resolve => setTimeout(resolve, 5000));

    const getUploadResponse = await client.send(
      new GetUploadCommand({arn: upload.arn}),
    );
    uploadStatus = getUploadResponse.upload?.status || '';

    if (uploadStatus === 'FAILED') {
      throw new Error(`Upload failed: ${getUploadResponse.upload?.message}`);
    }
  }

  console.log(`Upload complete: ${upload.arn}`);
  return upload.arn as string;
}

function createTestPackage(): string {
  console.log('Creating test package...');

  const packageDir = path.join(__dirname, '..');
  const zipPath = path.join(packageDir, 'test-package.zip');

  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  // Include TypeScript files and configs
  execSync(
    `cd ${packageDir} && zip -r test-package.zip node_modules specs pages helpers wdio.*.conf.ts tsconfig.json package.json`,
    {stdio: 'inherit'},
  );

  return zipPath;
}

async function getDevicePoolArn(): Promise<string> {
  const response = await client.send(
    new ListDevicePoolsCommand({
      arn: PROJECT_ARN,
      type: 'CURATED',
    }),
  );

  const pools = response.devicePools || [];
  const topDevices = pools.find(pool =>
    pool.name?.toLowerCase().includes('top'),
  );

  if (topDevices?.arn) {
    return topDevices.arn;
  }

  if (pools.length > 0 && pools[0].arn) {
    return pools[0].arn;
  }

  throw new Error('No device pools available');
}

async function waitForRunComplete(runArn: string): Promise<Run> {
  console.log('Waiting for test run to complete...');

  let status = 'PENDING';
  while (!['COMPLETED', 'STOPPING', 'ERRORED'].includes(status)) {
    await new Promise(resolve => setTimeout(resolve, 30000));

    const response = await client.send(new GetRunCommand({arn: runArn}));
    status = response.run?.status || '';
    const result = response.run?.result;

    console.log(`Status: ${status}, Result: ${result || 'pending'}`);

    if (status === 'RUNNING') {
      const counters = response.run?.counters;
      if (counters) {
        console.log(
          `  Passed: ${counters.passed}, Failed: ${counters.failed}, Errored: ${counters.errored}`,
        );
      }
    }
  }

  const finalResponse = await client.send(new GetRunCommand({arn: runArn}));
  return finalResponse.run as Run;
}

async function main(): Promise<void> {
  try {
    console.log(`\n=== AWS Device Farm Test Runner ===`);
    console.log(`Platform: ${platform}`);
    console.log(`App: ${appPath}`);
    console.log(`Project: ${PROJECT_ARN}\n`);

    const appType = platform === 'ios' ? 'IOS_APP' : 'ANDROID_APP';
    const testType = 'APPIUM_NODE_TEST_PACKAGE';

    const appArn = await uploadFile(
      appPath as string,
      appType,
      path.basename(appPath as string),
    );

    const testPackagePath = createTestPackage();
    const testPackageArn = await uploadFile(
      testPackagePath,
      testType,
      'test-package.zip',
    );

    const devicePoolArn = await getDevicePoolArn();
    console.log(`Using device pool: ${devicePoolArn}`);

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
        },
        configuration: {
          jobTimeoutMinutes: 60,
        },
      }),
    );

    const runArn = scheduleResponse.run?.arn as string;
    console.log(`Test run scheduled: ${runArn}`);

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

    if (finalRun.result !== 'PASSED') {
      process.exit(1);
    }
  } catch (error) {
    console.error('Error:', (error as Error).message);
    process.exit(1);
  }
}

main();
