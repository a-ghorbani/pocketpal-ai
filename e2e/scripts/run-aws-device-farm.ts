#!/usr/bin/env npx ts-node
/**
 * AWS Device Farm Test Runner
 *
 * Uploads the app and test package to AWS Device Farm
 * and schedules a test run on real devices.
 *
 * Prerequisites:
 * - AWS credentials configured via .env file or environment variables
 * - Required: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 * - Required: AWS_DEVICE_FARM_PROJECT_ARN
 * - Optional: AWS_DEVICE_POOL_ARN_ANDROID, AWS_DEVICE_POOL_ARN_IOS
 *
 * Usage:
 *   yarn test:aws --platform android --app path/to/app.apk
 *   yarn test:aws --platform ios --app path/to/app.ipa
 *
 * Or with default app paths:
 *   yarn test:aws --platform android
 *   yarn test:aws --platform ios
 */

import {config} from 'dotenv';
import {
  DeviceFarmClient,
  CreateUploadCommand,
  GetUploadCommand,
  ScheduleRunCommand,
  GetRunCommand,
  ListDevicePoolsCommand,
  ListJobsCommand,
  ListArtifactsCommand,
  Upload,
  Run,
  UploadType,
  ArtifactCategory,
} from '@aws-sdk/client-device-farm';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import {execSync} from 'child_process';

// Load environment variables from .env file
config({path: path.join(__dirname, '..', '.env')});

// Configuration from environment
const REGION = process.env.AWS_REGION || 'us-west-2';
const PROJECT_ARN = process.env.AWS_DEVICE_FARM_PROJECT_ARN;
const DEVICE_POOL_ARN_ANDROID = process.env.AWS_DEVICE_POOL_ARN_ANDROID;
const DEVICE_POOL_ARN_IOS = process.env.AWS_DEVICE_POOL_ARN_IOS;

// Default app paths
// Note: iOS requires an IPA built for real devices (not simulator)
// The simulator .app from yarn ios:build:e2e will NOT work on Device Farm
const DEFAULT_ANDROID_APP = '../android/app/build/outputs/apk/release/app-release.apk';
const DEFAULT_IOS_APP = '../ios/build/PocketPal.ipa';

// Parse command line arguments
function parseArgs(): {platform: 'ios' | 'android'; appPath: string; allModels: boolean} {
  const args = process.argv.slice(2);
  const platformIndex = args.indexOf('--platform');
  const appIndex = args.indexOf('--app');
  const allModels = args.includes('--all-models');

  const platform = (platformIndex !== -1 ? args[platformIndex + 1] : 'android') as 'ios' | 'android';

  let appPath: string;
  if (appIndex !== -1 && args[appIndex + 1]) {
    appPath = args[appIndex + 1];
  } else {
    // Use default app path based on platform
    appPath = platform === 'ios' ? DEFAULT_IOS_APP : DEFAULT_ANDROID_APP;
  }

  // Resolve relative paths from the e2e directory
  if (!path.isAbsolute(appPath)) {
    appPath = path.resolve(__dirname, '..', appPath);
  }

  return {platform, appPath, allModels};
}

// Validate required environment variables
function validateEnvironment(): void {
  const missing: string[] = [];

  if (!process.env.AWS_ACCESS_KEY_ID) {
    missing.push('AWS_ACCESS_KEY_ID');
  }
  if (!process.env.AWS_SECRET_ACCESS_KEY) {
    missing.push('AWS_SECRET_ACCESS_KEY');
  }
  if (!PROJECT_ARN) {
    missing.push('AWS_DEVICE_FARM_PROJECT_ARN');
  }

  if (missing.length > 0) {
    console.error('Error: Missing required environment variables:');
    missing.forEach(v => console.error(`  - ${v}`));
    console.error('\nPlease set these in e2e/.env or as environment variables.');
    console.error('See e2e/.env.example for reference.');
    process.exit(1);
  }
}

const {platform, appPath, allModels} = parseArgs();

// Validate environment before proceeding
validateEnvironment();

// Validate app file exists
if (!fs.existsSync(appPath)) {
  console.error(`Error: App file not found: ${appPath}`);
  console.error('\nMake sure to build the app first:');
  console.error('  Android: yarn build:android:release (creates APK)');
  console.error('  iOS:     yarn ios:build:ipa (creates IPA via Fastlane)');
  console.error('\nOr specify a custom path: yarn test:aws --platform ios --app /path/to/app.ipa');
  process.exit(1);
}

const client = new DeviceFarmClient({region: REGION});

// Helper to upload file content to S3 URL with retry logic
async function uploadToS3WithRetry(
  uploadUrl: string,
  fileContent: Buffer,
  maxRetries = 3,
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
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
      return; // Success
    } catch (error) {
      const errorMessage = (error as Error).message;
      if (attempt < maxRetries) {
        console.log(`  Upload attempt ${attempt} failed: ${errorMessage}. Retrying...`);
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt)); // Exponential backoff
      } else {
        throw new Error(`Upload failed after ${maxRetries} attempts: ${errorMessage}`);
      }
    }
  }
}

async function uploadFile(
  filePath: string,
  type: UploadType,
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

  await uploadToS3WithRetry(uploadUrl, fileContent);

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

  // Include source files and configs, but NOT node_modules (too large - 4GB+)
  // Dependencies will be installed on Device Farm during the install phase
  // This keeps the package small (~1MB vs 500MB+)
  // Note: scripts/ is included for run-model-tests.ts
  execSync(
    `cd "${packageDir}" && zip -r test-package.zip specs pages helpers fixtures scripts wdio.*.conf.ts tsconfig.json package.json yarn.lock`,
    {stdio: 'inherit'},
  );

  return zipPath;
}

/**
 * Create a modified testspec with --all-models flag if needed.
 * Returns path to the testspec file to upload.
 */
function prepareTestSpec(targetPlatform: 'ios' | 'android', useAllModels: boolean): string {
  const packageDir = path.join(__dirname, '..');
  const originalPath = path.join(packageDir, `testspec-${targetPlatform}.yml`);

  if (!useAllModels) {
    return originalPath;
  }

  // Read original testspec and add --all-models flag
  let content = fs.readFileSync(originalPath, 'utf8');

  // Replace the run-model-tests.ts command to include --all-models
  content = content.replace(
    /npx ts-node scripts\/run-model-tests\.ts --platform (ios|android) --device-farm/g,
    'npx ts-node scripts/run-model-tests.ts --platform $1 --device-farm --all-models',
  );

  // Write to temporary file
  const tempPath = path.join(packageDir, `testspec-${targetPlatform}-allmodels.yml`);
  fs.writeFileSync(tempPath, content);
  console.log(`Created modified testspec with --all-models: ${tempPath}`);

  return tempPath;
}

/**
 * Get device pool ARN based on platform.
 * Priority:
 * 1. Environment variable (AWS_DEVICE_POOL_ARN_ANDROID or AWS_DEVICE_POOL_ARN_IOS)
 * 2. Private pool matching platform name (Android-Test-Devices or iOS-Test-Devices)
 * 3. Curated "Top Devices" pool
 * 4. First available pool
 */
async function getDevicePoolArn(targetPlatform: 'ios' | 'android'): Promise<string> {
  // Check for explicit device pool ARN in environment
  const envPoolArn = targetPlatform === 'ios' ? DEVICE_POOL_ARN_IOS : DEVICE_POOL_ARN_ANDROID;
  if (envPoolArn) {
    console.log(`Using device pool from environment: ${envPoolArn}`);
    return envPoolArn;
  }

  // Try to find a private pool matching the platform
  const privateResponse = await client.send(
    new ListDevicePoolsCommand({
      arn: PROJECT_ARN,
      type: 'PRIVATE',
    }),
  );

  const privatePools = privateResponse.devicePools || [];
  const platformPoolName = targetPlatform === 'ios' ? 'iOS-Test-Devices' : 'Android-Test-Devices';
  const matchingPool = privatePools.find(
    pool => pool.name?.toLowerCase() === platformPoolName.toLowerCase(),
  );

  if (matchingPool?.arn) {
    console.log(`Using private device pool: ${matchingPool.name}`);
    return matchingPool.arn;
  }

  // Fall back to curated pools
  const curatedResponse = await client.send(
    new ListDevicePoolsCommand({
      arn: PROJECT_ARN,
      type: 'CURATED',
    }),
  );

  const curatedPools = curatedResponse.devicePools || [];
  const topDevices = curatedPools.find(pool =>
    pool.name?.toLowerCase().includes('top'),
  );

  if (topDevices?.arn) {
    console.log(`Using curated device pool: ${topDevices.name}`);
    return topDevices.arn;
  }

  if (curatedPools.length > 0 && curatedPools[0].arn) {
    console.log(`Using first available pool: ${curatedPools[0].name}`);
    return curatedPools[0].arn;
  }

  throw new Error('No device pools available. Please create a device pool in AWS Device Farm console.');
}

/**
 * Download a file from a URL to a local path
 */
async function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, response => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          https.get(redirectUrl, redirectResponse => {
            redirectResponse.pipe(file);
            file.on('finish', () => {
              file.close();
              resolve();
            });
          }).on('error', err => {
            fs.unlink(destPath, () => {});
            reject(err);
          });
          return;
        }
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', err => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

/**
 * Download test artifacts (JUnit XML, screenshots, logs) from Device Farm
 */
async function downloadArtifacts(runArn: string, outputDir: string): Promise<void> {
  console.log('\nDownloading test artifacts...');

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, {recursive: true});
  }

  // Get all jobs for this run
  const jobsResponse = await client.send(new ListJobsCommand({arn: runArn}));
  const jobs = jobsResponse.jobs || [];

  console.log(`Found ${jobs.length} job(s) in the test run`);

  for (const job of jobs) {
    if (!job.arn) continue;

    // Create a safe device name for the directory
    const deviceName = job.device?.name || 'unknown-device';
    const safeDeviceName = deviceName.replace(/[^a-zA-Z0-9.-]/g, '_');
    console.log(`  Processing job: ${deviceName}`);

    // Create device-specific directory
    const deviceDir = path.join(outputDir, safeDeviceName);
    if (!fs.existsSync(deviceDir)) {
      fs.mkdirSync(deviceDir, {recursive: true});
    }

    // Artifact categories we want to download
    const artifactCategories: ArtifactCategory[] = ['FILE', 'LOG', 'SCREENSHOT'];

    for (const artifactCategory of artifactCategories) {
      try {
        const artifactsResponse = await client.send(
          new ListArtifactsCommand({
            arn: job.arn,
            type: artifactCategory,
          }),
        );

        const artifacts = artifactsResponse.artifacts || [];

        for (const artifact of artifacts) {
          if (!artifact.url || !artifact.name) continue;

          // Create subdirectory for artifact category within device directory
          const typeDir = path.join(deviceDir, artifactCategory.toLowerCase());
          if (!fs.existsSync(typeDir)) {
            fs.mkdirSync(typeDir, {recursive: true});
          }

          // Determine file extension from artifact name or type
          const artifactName = artifact.name.replace(/[^a-zA-Z0-9.-]/g, '_');
          const extension = artifact.extension || '';
          const filename = extension ? `${artifactName}.${extension}` : artifactName;
          const destPath = path.join(typeDir, filename);

          try {
            await downloadFile(artifact.url, destPath);
            console.log(`    Downloaded: ${filename}`);
          } catch (downloadErr) {
            console.log(`    Failed to download ${filename}: ${(downloadErr as Error).message}`);
          }
        }
      } catch (listErr) {
        console.log(`    Error listing ${artifactCategory} artifacts: ${(listErr as Error).message}`);
      }
    }
  }

  // Look for JUnit XML files in device subdirectories and merge them
  // Structure: outputDir/<device-name>/file/junit*.xml
  const deviceDirs = fs.readdirSync(outputDir).filter(d => {
    const fullPath = path.join(outputDir, d);
    return fs.statSync(fullPath).isDirectory();
  });

  const junitFiles: string[] = [];
  for (const deviceDir of deviceDirs) {
    const fileDir = path.join(outputDir, deviceDir, 'file');
    if (fs.existsSync(fileDir)) {
      const files = fs.readdirSync(fileDir);
      for (const file of files) {
        if (file.includes('junit') && file.endsWith('.xml')) {
          junitFiles.push(path.join(fileDir, file));
        }
      }
    }
  }

  if (junitFiles.length > 0) {
    // Merge all JUnit files into one
    let totalTests = 0;
    let totalFailures = 0;
    let totalErrors = 0;
    let totalSkipped = 0;
    const testSuites: string[] = [];

    for (const junitFile of junitFiles) {
      const content = fs.readFileSync(junitFile, 'utf8');
      const suiteMatch = content.match(/<testsuite[\s\S]*?<\/testsuite>/g);
      if (suiteMatch) {
        for (const suite of suiteMatch) {
          testSuites.push(suite);
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

    const mergedXml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites tests="${totalTests}" failures="${totalFailures}" errors="${totalErrors}" skipped="${totalSkipped}">
${testSuites.join('\n')}
</testsuites>`;

    const mergedPath = path.join(outputDir, 'junit-results.xml');
    fs.writeFileSync(mergedPath, mergedXml);
    console.log(`  Merged ${junitFiles.length} JUnit file(s) into: ${mergedPath}`);
    console.log(`    Total: ${totalTests} tests, ${totalFailures} failures, ${totalErrors} errors`);
  }

  console.log(`Artifacts saved to: ${outputDir}`);
}

async function waitForRunComplete(runArn: string): Promise<Run> {
  console.log('Waiting for test run to complete...');
  console.log('(This may take several minutes. You can also monitor progress in the AWS Console.)\n');

  let status = 'PENDING';
  while (!['COMPLETED', 'STOPPING', 'ERRORED'].includes(status)) {
    await new Promise(resolve => setTimeout(resolve, 30000));

    const response = await client.send(new GetRunCommand({arn: runArn}));
    status = response.run?.status || '';
    const result = response.run?.result;

    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] Status: ${status}, Result: ${result || 'pending'}`);

    if (status === 'RUNNING') {
      const counters = response.run?.counters;
      if (counters) {
        console.log(
          `  Progress - Passed: ${counters.passed}, Failed: ${counters.failed}, Errored: ${counters.errored}`,
        );
      }
    }
  }

  const finalResponse = await client.send(new GetRunCommand({arn: runArn}));
  return finalResponse.run as Run;
}

async function main(): Promise<void> {
  try {
    console.log(`\n${'='.repeat(50)}`);
    console.log('AWS Device Farm Test Runner');
    console.log('='.repeat(50));
    console.log(`Platform: ${platform}`);
    console.log(`App: ${appPath}`);
    console.log(`All models: ${allModels}`);
    console.log(`Region: ${REGION}`);
    console.log(`Project: ${PROJECT_ARN}`);
    console.log('='.repeat(50) + '\n');

    const appType: UploadType = platform === 'ios' ? 'IOS_APP' : 'ANDROID_APP';
    const testType: UploadType = 'APPIUM_NODE_TEST_PACKAGE';
    const testSpecType: UploadType = 'APPIUM_NODE_TEST_SPEC';

    // Upload app
    const appArn = await uploadFile(
      appPath,
      appType,
      path.basename(appPath),
    );

    // Create and upload test package
    const testPackagePath = createTestPackage();
    const testPackageArn = await uploadFile(
      testPackagePath,
      testType,
      'test-package.zip',
    );

    // Upload test spec (required for custom environment mode)
    // If --all-models is set, create a modified testspec with the flag baked in
    const testSpecPath = prepareTestSpec(platform, allModels);
    if (!fs.existsSync(testSpecPath)) {
      throw new Error(`Test spec file not found: ${testSpecPath}`);
    }
    const testSpecArn = await uploadFile(
      testSpecPath,
      testSpecType,
      `testspec-${platform}.yml`,
    );

    // Get device pool
    const devicePoolArn = await getDevicePoolArn(platform);

    // Schedule test run with custom environment mode
    console.log('\nScheduling test run...');
    const scheduleResponse = await client.send(
      new ScheduleRunCommand({
        projectArn: PROJECT_ARN,
        appArn,
        devicePoolArn,
        name: `PocketPal E2E - ${platform}${allModels ? ' (all models)' : ''} - ${new Date().toISOString()}`,
        test: {
          type: 'APPIUM_NODE',
          testPackageArn,
          testSpecArn, // Required for custom environment mode
        },
        executionConfiguration: {
          jobTimeoutMinutes: allModels ? 120 : 60, // More time for all models
        },
      }),
    );

    const runArn = scheduleResponse.run?.arn as string;
    console.log(`Test run scheduled: ${runArn}`);
    console.log(`\nView in AWS Console:`);
    console.log(`https://${REGION}.console.aws.amazon.com/devicefarm/home?region=${REGION}#/mobile/projects/${PROJECT_ARN?.split(':').pop()}/runs/${runArn.split('/').pop()}\n`);

    // Wait for completion
    const finalRun = await waitForRunComplete(runArn);

    // Download artifacts (JUnit XML, screenshots, logs)
    const artifactsDir = path.join(__dirname, '..', 'device-farm-artifacts');
    await downloadArtifacts(runArn, artifactsDir);

    // Print results
    console.log(`\n${'='.repeat(50)}`);
    console.log('Test Run Complete');
    console.log('='.repeat(50));
    console.log(`Result: ${finalRun.result}`);
    console.log(`Status: ${finalRun.status}`);

    if (finalRun.counters) {
      console.log(`\nTest Counters:`);
      console.log(`  Total:   ${finalRun.counters.total}`);
      console.log(`  Passed:  ${finalRun.counters.passed}`);
      console.log(`  Failed:  ${finalRun.counters.failed}`);
      console.log(`  Errored: ${finalRun.counters.errored}`);
      console.log(`  Skipped: ${finalRun.counters.skipped}`);
    }

    console.log('='.repeat(50) + '\n');

    if (finalRun.result !== 'PASSED') {
      process.exit(1);
    }
  } catch (error) {
    console.error('\nError:', (error as Error).message);
    process.exit(1);
  }
}

main();
