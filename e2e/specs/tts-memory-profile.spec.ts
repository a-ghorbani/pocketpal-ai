/**
 * TTS Memory Profile E2E Spec
 *
 * Profiles peak RAM for each neural TTS engine across three checkpoints:
 *   tts_<engine>_loaded   model downloaded + ready
 *   tts_<engine>_active   one synthesis run
 *   tts_<engine>_idle     engine released
 *
 * Engines run small to large (kitten, supertonic, kokoro) and the runtime is
 * released between them — the native TTS slot holds one engine at a time.
 *
 * Writes a per-engine report to OUTPUT_DIR/tts-memory-profile.json using the
 * same schema/writer shape as memory-profile.spec.ts.
 *
 * Usage:
 *   yarn test:ios:local --spec specs/tts-memory-profile.spec.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import {execSync} from 'child_process';
import {expect} from '@wdio/globals';
import {ChatPage} from '../pages/ChatPage';
import {TIMEOUTS} from '../fixtures/models';
import {
  triggerSnapshot,
  readSnapshots,
  clearSnapshots,
  MemorySnapshot,
} from '../helpers/memory';
import {
  downloadAndLoadTTSEngine,
  runTTSSynthesis,
  releaseTTSEngine,
} from '../helpers/tts-actions';
import {SCREENSHOT_DIR, OUTPUT_DIR} from '../wdio.shared.conf';

declare const driver: WebdriverIO.Browser;

const ENGINES = ['kitten', 'supertonic', 'kokoro'];

const DOWNLOAD_TIMEOUT_MS = 15 * 60 * 1000;
const SYNTH_TIMEOUT_MS = 5 * 60 * 1000;
const RELEASE_TIMEOUT_MS = 60 * 1000;

function getDeviceInfo(): {device: string; os_version: string; platform: string} {
  const caps = (driver.capabilities || {}) as Record<string, any>;
  const isAndroid = (driver as any).isAndroid;
  if (isAndroid) {
    return {
      device:
        caps.deviceModel ||
        caps.deviceName ||
        process.env.E2E_DEVICE_NAME ||
        'unknown',
      os_version:
        caps.platformVersion || process.env.E2E_PLATFORM_VERSION || 'unknown',
      platform: 'android',
    };
  }
  return {
    device: caps.deviceName || process.env.E2E_DEVICE_NAME || 'unknown',
    os_version:
      caps.platformVersion || process.env.E2E_PLATFORM_VERSION || 'unknown',
    platform: 'ios',
  };
}

function getCommitHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
      timeout: 5000,
    }).trim();
  } catch {
    return 'unknown';
  }
}

function memBytes(snap: MemorySnapshot): number {
  return snap.native.phys_footprint !== undefined
    ? snap.native.phys_footprint + (snap.native.metal_allocated ?? 0)
    : snap.native.pss_total ?? 0;
}

function toMb(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}

function buildReport(snapshots: MemorySnapshot[]): Record<string, any> {
  const deviceInfo = getDeviceInfo();
  const byEngine: Record<string, any> = {};
  for (const engine of ENGINES) {
    const engineSnaps = snapshots.filter(s =>
      s.label.startsWith(`tts_${engine}_`),
    );
    const peakBytes = engineSnaps.reduce(
      (max, s) => Math.max(max, memBytes(s)),
      0,
    );
    byEngine[engine] = {
      peak_memory_mb: toMb(peakBytes),
      checkpoints: engineSnaps.map(s => ({
        label: s.label,
        memory_mb: toMb(memBytes(s)),
      })),
    };
  }
  return {
    version: '1.0',
    commit: getCommitHash(),
    device: deviceInfo.device,
    os_version: deviceInfo.os_version,
    platform: deviceInfo.platform,
    timestamp: new Date().toISOString(),
    engines: byEngine,
    checkpoints: snapshots.map(snap => ({
      label: snap.label,
      timestamp: snap.timestamp,
      native: snap.native,
      ...(snap.hermes ? {hermes: snap.hermes} : {}),
    })),
    peak_memory_mb: toMb(
      snapshots.reduce((max, s) => Math.max(max, memBytes(s)), 0),
    ),
  };
}

describe('TTS Memory Profile', () => {
  let chatPage: ChatPage;

  beforeEach(async () => {
    chatPage = new ChatPage();
    await chatPage.waitForReady(TIMEOUTS.appReady);
  });

  afterEach(async function (this: Mocha.Context) {
    if (this.currentTest?.state === 'failed') {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const testName = this.currentTest.title.replace(/\s+/g, '-');
      try {
        if (!fs.existsSync(SCREENSHOT_DIR)) {
          fs.mkdirSync(SCREENSHOT_DIR, {recursive: true});
        }
        await driver.saveScreenshot(
          path.join(SCREENSHOT_DIR, `failure-${testName}-${timestamp}.png`),
        );
      } catch (e) {
        console.error('Failed to capture screenshot:', (e as Error).message);
      }
    }
  });

  it('should profile TTS engine memory', async function (this: Mocha.Context) {
    // Three model downloads (~770 MB total) plus synthesis far exceed the
    // shared 10-minute default — give the whole sweep a generous budget.
    this.timeout(45 * 60 * 1000);
    await clearSnapshots();

    for (const engine of ENGINES) {
      console.log(`[TTS Memory] ${engine}: download + load`);
      await downloadAndLoadTTSEngine(engine, DOWNLOAD_TIMEOUT_MS);
      await triggerSnapshot(`tts_${engine}_loaded`);

      console.log(`[TTS Memory] ${engine}: synthesis`);
      await runTTSSynthesis(engine, SYNTH_TIMEOUT_MS);
      await triggerSnapshot(`tts_${engine}_active`);

      console.log(`[TTS Memory] ${engine}: release`);
      await releaseTTSEngine(RELEASE_TIMEOUT_MS);
      await driver.pause(3000);
      await triggerSnapshot(`tts_${engine}_idle`);
    }

    const snapshots = await readSnapshots();
    const expectedLabels: string[] = [];
    for (const engine of ENGINES) {
      expectedLabels.push(
        `tts_${engine}_loaded`,
        `tts_${engine}_active`,
        `tts_${engine}_idle`,
      );
    }
    expect(snapshots.length).toBe(expectedLabels.length);

    const report = buildReport(snapshots);

    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, {recursive: true});
    }
    const reportPath = path.join(OUTPUT_DIR, 'tts-memory-profile.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log('\n=== TTS Memory Profile Report ===');
    console.log(`  Device: ${report.device}`);
    console.log(`  OS: ${report.os_version}`);
    console.log(`  Platform: ${report.platform}`);
    for (const engine of ENGINES) {
      console.log(
        `  ${engine}: peak ${report.engines[engine].peak_memory_mb} MB`,
      );
    }
    console.log(`  Report: ${reportPath}`);
    console.log('=================================\n');

    expect(report.version).toBe('1.0');
    for (let i = 0; i < expectedLabels.length; i++) {
      expect(report.checkpoints[i].label).toBe(expectedLabels[i]);
    }
    for (const engine of ENGINES) {
      expect(report.engines[engine].peak_memory_mb).toBeGreaterThan(0);
    }
  });
});
