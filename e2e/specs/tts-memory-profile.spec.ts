/**
 * TTS Memory Profile E2E Spec
 *
 * Downloads every engine first, then measures each one in its own freshly
 * launched app process, so no engine's footprint leaks into the next:
 *   tts_<engine>_baseline  fresh process, nothing loaded
 *   tts_<engine>_loaded    model present on disk, engine not yet initialized
 *   tts_<engine>_active    after one synthesis run, engine still loaded
 *   tts_<engine>_idle      engine released
 *
 * Per engine the report gives the peak and the delta (active minus that
 * engine's own baseline). On Android it also stores `dumpsys meminfo` at
 * baseline and active, and breaks the delta down by category, so mapped model
 * weights (.so / other mmap) separate from native heap and graphics.
 *
 * Writes OUTPUT_DIR/tts-memory-profile.json (same writer shape as
 * memory-profile.spec.ts) and the raw dumps under OUTPUT_DIR/tts-meminfo/.
 *
 * Usage:
 *   yarn test:ios:local --spec specs/tts-memory-profile.spec.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import {execFileSync, execSync} from 'child_process';
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

const ENGINES = [
  'kitten',
  'supertonic',
  'kokoro',
  ...(process.env.TTS_PROFILE_PHONON === '1' ? ['phonon'] : []),
];

const DOWNLOAD_TIMEOUT_MS = 15 * 60 * 1000;
const SYNTH_TIMEOUT_MS = 5 * 60 * 1000;
const RELEASE_TIMEOUT_MS = 60 * 1000;
const SETTLE_MS = Number(process.env.TTS_PROFILE_SETTLE_MS) || 8000;

const appId = (): string =>
  (driver as any).isAndroid ? 'com.pocketpalai.e2e' : 'ai.pocketpal';

const MEMINFO_DIR = path.join(OUTPUT_DIR, 'tts-meminfo');

/** `dumpsys meminfo` rows reported, by their label in the app's table. */
const MEMINFO_ROWS = [
  'Native Heap',
  'Dalvik Heap',
  'Dalvik Other',
  'Stack',
  'Ashmem',
  'Gfx dev',
  'Other dev',
  '.so mmap',
  '.jar mmap',
  '.apk mmap',
  '.dex mmap',
  '.oat mmap',
  '.art mmap',
  'Other mmap',
  'EGL mtrack',
  'GL mtrack',
  'Unknown',
  'TOTAL',
];

type Meminfo = Record<string, number>;

/** PSS in MB per row of the app's `dumpsys meminfo` table (Android only). */
function captureMeminfo(name: string): Meminfo | undefined {
  if (!(driver as any).isAndroid) {
    return undefined;
  }
  const udid = process.env.E2E_DEVICE_UDID;
  const raw = execFileSync(
    'adb',
    [...(udid ? ['-s', udid] : []), 'shell', 'dumpsys', 'meminfo', appId()],
    {encoding: 'utf8', timeout: 30000},
  );
  fs.mkdirSync(MEMINFO_DIR, {recursive: true});
  fs.writeFileSync(path.join(MEMINFO_DIR, `${name}.txt`), raw);
  const rows: Meminfo = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    for (const row of MEMINFO_ROWS) {
      if (rows[row] === undefined && trimmed.startsWith(`${row} `)) {
        const pssKb = Number(trimmed.slice(row.length).trim().split(/\s+/)[0]);
        if (Number.isFinite(pssKb)) {
          rows[row] = Math.round((pssKb / 1024) * 100) / 100;
        }
      }
    }
  }
  return rows;
}

async function relaunchApp(chatPage: ChatPage): Promise<void> {
  await driver.terminateApp(appId());
  await driver.pause(1500);
  await driver.activateApp(appId());
  await chatPage.waitForReady(TIMEOUTS.appReady);
  await driver.pause(SETTLE_MS);
}

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

function buildReport(
  snapshots: MemorySnapshot[],
  meminfo: Record<string, {baseline?: Meminfo; active?: Meminfo}>,
): Record<string, any> {
  const deviceInfo = getDeviceInfo();
  const byEngine: Record<string, any> = {};
  for (const engine of ENGINES) {
    const engineSnaps = snapshots.filter(s =>
      s.label.startsWith(`tts_${engine}_`),
    );
    const at = (checkpoint: string) => {
      const snap = engineSnaps.find(
        s => s.label === `tts_${engine}_${checkpoint}`,
      );
      return snap ? memBytes(snap) : 0;
    };
    const peakBytes = engineSnaps.reduce(
      (max, s) => Math.max(max, memBytes(s)),
      0,
    );
    const {baseline, active} = meminfo[engine] ?? {};
    byEngine[engine] = {
      baseline_mb: toMb(at('baseline')),
      active_mb: toMb(at('active')),
      peak_memory_mb: toMb(peakBytes),
      delta_mb: toMb(at('active') - at('baseline')),
      checkpoints: engineSnaps.map(s => ({
        label: s.label,
        memory_mb: toMb(memBytes(s)),
      })),
      ...(baseline && active
        ? {
            meminfo_mb: {baseline, active},
            meminfo_delta_mb: Object.fromEntries(
              Object.keys(active).map(row => [
                row,
                Math.round(((active[row] ?? 0) - (baseline[row] ?? 0)) * 100) /
                  100,
              ]),
            ),
          }
        : {}),
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

describe('TTS Memory Profile', function () {
  // Three model downloads (~770 MB total) plus synthesis far exceed the
  // shared 10-minute default.
  this.timeout(
    Math.max(Number(process.env.E2E_MOCHA_TIMEOUT) || 0, 45 * 60 * 1000),
  );

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

  it('should profile TTS engine memory', async () => {
    for (const engine of ENGINES) {
      console.log(`[TTS Memory] ${engine}: download`);
      await downloadAndLoadTTSEngine(engine, DOWNLOAD_TIMEOUT_MS);
    }
    await clearSnapshots();

    const meminfo: Record<string, {baseline?: Meminfo; active?: Meminfo}> = {};
    for (const engine of ENGINES) {
      console.log(`[TTS Memory] ${engine}: fresh app process`);
      await relaunchApp(chatPage);
      meminfo[engine] = {baseline: captureMeminfo(`${engine}-baseline`)};
      await triggerSnapshot(`tts_${engine}_baseline`);

      await downloadAndLoadTTSEngine(engine, DOWNLOAD_TIMEOUT_MS);
      await triggerSnapshot(`tts_${engine}_loaded`);

      console.log(`[TTS Memory] ${engine}: synthesis`);
      await runTTSSynthesis(engine, SYNTH_TIMEOUT_MS);
      await triggerSnapshot(`tts_${engine}_active`);
      meminfo[engine].active = captureMeminfo(`${engine}-active`);

      console.log(`[TTS Memory] ${engine}: release`);
      await releaseTTSEngine(RELEASE_TIMEOUT_MS);
      await driver.pause(3000);
      await triggerSnapshot(`tts_${engine}_idle`);
    }

    const snapshots = await readSnapshots();
    const expectedLabels: string[] = [];
    for (const engine of ENGINES) {
      expectedLabels.push(
        `tts_${engine}_baseline`,
        `tts_${engine}_loaded`,
        `tts_${engine}_active`,
        `tts_${engine}_idle`,
      );
    }
    expect(snapshots.length).toBe(expectedLabels.length);

    const report = buildReport(snapshots, meminfo);

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
      const e = report.engines[engine];
      console.log(
        `  ${engine}: baseline ${e.baseline_mb} MB, peak ${e.peak_memory_mb} MB, delta ${e.delta_mb} MB`,
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
