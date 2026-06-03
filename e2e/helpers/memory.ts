/**
 * E2E memory profiling helpers
 *
 * Platform-specific trigger mechanisms:
 * - Android: TextInput setValue (onChangeText fires reliably)
 * - iOS: Deep link pocketpal://memory?cmd=... (onChangeText doesn't fire
 *   from XCUITest sendKeys in Release builds)
 *
 * File reading:
 * - Android: app-based read:: command via TextInput
 * - iOS simulator: direct filesystem read via simctl
 * - iOS real device: ios-deploy --download
 */

import {execSync} from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {byTestId} from './selectors';

declare const driver: WebdriverIO.Browser;

const IOS_BUNDLE_ID = 'ai.pocketpal';
const SNAPSHOTS_FILENAME = 'memory-snapshots.json';

export interface MemorySnapshot {
  label: string;
  timestamp: string;
  native: {
    phys_footprint?: number;
    pss_total?: number;
    native_heap_allocated?: number;
    available_memory: number;
  };
  hermes?: {
    heapSize: number;
    allocatedBytes: number;
  };
}

/**
 * Send a command to the memory profiling system.
 * Uses platform-appropriate mechanism.
 */
async function sendCommand(command: string): Promise<void> {
  const isAndroid = (driver as any).isAndroid;

  if (isAndroid) {
    const input = await driver.$(byTestId('memory-snapshot-label'));
    await input.setValue(command);
  } else {
    // iOS: use deep link (onChangeText doesn't fire from XCUITest sendKeys)
    const encoded = encodeURIComponent(command);
    await driver.execute('mobile: deepLink', {
      url: `pocketpal://memory?cmd=${encoded}`,
      bundleId: IOS_BUNDLE_ID,
    });
  }
}

/**
 * Trigger a memory snapshot.
 */
export async function triggerSnapshot(label: string): Promise<void> {
  await sendCommand(`snap::${label}`);
  await driver.pause(1500);
}

/**
 * Read accumulated memory snapshots from the device.
 */
export async function readSnapshots(): Promise<MemorySnapshot[]> {
  const isAndroid = (driver as any).isAndroid;

  if (isAndroid) {
    // Android: use app-based read:: command
    await sendCommand('read::snapshots');
    await driver.pause(2000);

    const resultEl = await driver.$(byTestId('memory-snapshot-result'));
    let data: string | null = null;
    for (let i = 0; i < 10; i++) {
      await driver.pause(1000);
      data = await resultEl.getAttribute('content-desc');
      if (data && data.startsWith('[')) {
        break;
      }
      data = await resultEl.getText();
      if (data && data.startsWith('[')) {
        break;
      }
    }
    if (!data || !data.startsWith('[')) {
      throw new Error(
        `Failed to read snapshots from Android. Got: ${JSON.stringify(data?.slice(0, 200))}`,
      );
    }
    return JSON.parse(data);
  } else {
    // iOS: determine device type from UDID env var
    // Simulator UDIDs are UUID format (8-4-4-4-12 hex), real device UDIDs are not
    const udid = process.env.E2E_DEVICE_UDID || '';
    const isSimulator = !udid ||
      /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(udid);

    if (isSimulator) {
      // Simulator: read directly from filesystem via simctl
      const container = execSync(
        `xcrun simctl get_app_container booted ${IOS_BUNDLE_ID} data`,
        {encoding: 'utf8', timeout: 5000},
      ).trim();
      const filePath = path.join(container, 'Documents', SNAPSHOTS_FILENAME);
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    } else {
      // Real device: use ios-deploy to download from app container
      const tmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'memory-profile-'),
      );
      execSync(
        `ios-deploy --id ${udid} --bundle_id ${IOS_BUNDLE_ID} --download=/Documents/${SNAPSHOTS_FILENAME} --to ${tmpDir}`,
        {timeout: 15000},
      );
      const localPath = path.join(tmpDir, 'Documents', SNAPSHOTS_FILENAME);
      const data = fs.readFileSync(localPath, 'utf8');
      return JSON.parse(data);
    }
  }
}

/**
 * Clear snapshots file on device.
 */
export async function clearSnapshots(): Promise<void> {
  await sendCommand('clear::snapshots');
  await driver.pause(500);
}
