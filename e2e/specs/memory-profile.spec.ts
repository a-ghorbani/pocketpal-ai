/**
 * Memory Profile E2E Spec
 *
 * Profiles memory usage across 7 app lifecycle checkpoints:
 * app_launch, models_screen, chat_screen, model_loaded,
 * chat_active, post_chat_idle, model_unloaded.
 *
 * Writes a canonical JSON report to OUTPUT_DIR/memory-profile.json.
 *
 * Usage:
 *   yarn test:ios:local --spec specs/memory-profile.spec.ts
 *   TEST_MODELS=smollm2-135m yarn test:ios:local --spec specs/memory-profile.spec.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import {execSync} from 'child_process';
import {expect} from '@wdio/globals';
import {ChatPage} from '../pages/ChatPage';
import {DrawerPage} from '../pages/DrawerPage';
import {ModelsPage} from '../pages/ModelsPage';
import {Selectors} from '../helpers/selectors';
import {
  downloadAndLoadModel,
  waitForInferenceComplete,
} from '../helpers/model-actions';
import {
  triggerSnapshot,
  readSnapshots,
  clearSnapshots,
  MemorySnapshot,
} from '../helpers/memory';
import {
  QUICK_TEST_MODEL,
  TIMEOUTS,
  getModelsToTest,
  ModelTestConfig,
} from '../fixtures/models';
import {SCREENSHOT_DIR, OUTPUT_DIR} from '../wdio.shared.conf';

declare const driver: WebdriverIO.Browser;
declare const browser: WebdriverIO.Browser;

const NUM_CHAT_MESSAGES = 2;
const POST_CHAT_IDLE_MS = 10000;

/**
 * Get the model to use for memory profiling.
 */
function getModelForTest(): ModelTestConfig {
  const envFilter = process.env.TEST_MODELS;
  if (envFilter) {
    const models = getModelsToTest(true);
    return models[0];
  }
  return QUICK_TEST_MODEL;
}

/**
 * Get device info from Appium capabilities (works with multiple devices).
 */
function getDeviceInfo(): {device: string; os_version: string; platform: string} {
  const caps = (driver.capabilities || {}) as Record<string, any>;
  const isAndroid = (driver as any).isAndroid;

  if (isAndroid) {
    return {
      device: caps['deviceModel'] || caps['deviceName'] || process.env.E2E_DEVICE_NAME || 'unknown',
      os_version: caps['platformVersion'] || process.env.E2E_PLATFORM_VERSION || 'unknown',
      platform: 'android',
    };
  } else {
    return {
      device: caps['deviceName'] || process.env.E2E_DEVICE_NAME || 'unknown',
      os_version: caps['platformVersion'] || process.env.E2E_PLATFORM_VERSION || 'unknown',
      platform: 'ios',
    };
  }
}

/**
 * Get current git commit hash.
 */
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

/**
 * Build the canonical memory report from snapshots.
 */
function buildReport(
  snapshots: MemorySnapshot[],
  model: ModelTestConfig,
): Record<string, any> {
  const deviceInfo = getDeviceInfo();
  const commit = getCommitHash();

  // Calculate peak memory (iOS: phys + metal, Android: pss)
  let peakBytes = 0;
  for (const snap of snapshots) {
    const memBytes = snap.native.phys_footprint !== undefined
      ? snap.native.phys_footprint + (snap.native.metal_allocated ?? 0)
      : snap.native.pss_total ?? 0;
    if (memBytes > peakBytes) {
      peakBytes = memBytes;
    }
  }

  return {
    version: '1.0',
    commit,
    device: deviceInfo.device,
    os_version: deviceInfo.os_version,
    platform: deviceInfo.platform,
    timestamp: new Date().toISOString(),
    model: model.id,
    checkpoints: snapshots.map(snap => ({
      label: snap.label,
      timestamp: snap.timestamp,
      native: snap.native,
      ...(snap.hermes ? {hermes: snap.hermes} : {}),
    })),
    peak_memory_mb: Math.round((peakBytes / (1024 * 1024)) * 100) / 100,
  };
}

describe('Memory Profile', () => {
  const model = getModelForTest();

  let chatPage: ChatPage;
  let drawerPage: DrawerPage;
  let modelsPage: ModelsPage;

  beforeEach(async () => {
    chatPage = new ChatPage();
    drawerPage = new DrawerPage();
    modelsPage = new ModelsPage();

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

  it('should profile memory across app lifecycle', async () => {
    // Clear any previous snapshots
    await clearSnapshots();

    // Checkpoint 1: app_launch
    console.log('[Memory] Checkpoint 1: app_launch');
    await triggerSnapshot('app_launch');

    // Checkpoint 2: models_screen
    console.log('[Memory] Checkpoint 2: models_screen');
    await chatPage.openDrawer();
    await drawerPage.waitForOpen();
    await drawerPage.navigateToModels();
    await modelsPage.waitForReady();
    await triggerSnapshot('models_screen');

    // Checkpoint 3: chat_screen (navigate back to chat, no model loaded)
    console.log('[Memory] Checkpoint 3: chat_screen');
    await chatPage.openDrawer();
    await drawerPage.waitForOpen();
    await drawerPage.navigateToChat();
    await chatPage.waitForReady();
    await triggerSnapshot('chat_screen');

    // Checkpoint 4: model_loaded (download and load test model)
    console.log('[Memory] Checkpoint 4: model_loaded');
    await downloadAndLoadModel(model);
    await triggerSnapshot('model_loaded');

    // Checkpoint 5: chat_active (send messages and wait for responses)
    console.log('[Memory] Checkpoint 5: chat_active');
    for (let i = 0; i < NUM_CHAT_MESSAGES; i++) {
      await chatPage.sendMessage(`Test message ${i + 1}`);
      await waitForInferenceComplete();
      console.log(`[Memory] Message ${i + 1}/${NUM_CHAT_MESSAGES} complete`);
    }
    await triggerSnapshot('chat_active');

    // Checkpoint 6: post_chat_idle (wait after chat activity)
    console.log('[Memory] Checkpoint 6: post_chat_idle');
    await driver.pause(POST_CHAT_IDLE_MS);
    await triggerSnapshot('post_chat_idle');

    // Checkpoint 7: model_unloaded (navigate to models, offload)
    console.log('[Memory] Checkpoint 7: model_unloaded');
    await chatPage.openDrawer();
    await drawerPage.waitForOpen();
    await drawerPage.navigateToModels();
    await modelsPage.waitForReady();

    // Find the model card and tap offload
    const containerSelector = Selectors.modelCard.cardContainer(
      model.downloadFile,
    );
    const modelCardContainer = browser.$(containerSelector);
    await modelCardContainer.waitForDisplayed({timeout: 10000});

    const offloadBtn = browser.$(Selectors.modelCard.offloadButton);
    await offloadBtn.waitForDisplayed({timeout: 10000});
    await offloadBtn.click();
    await browser.pause(2000); // Wait for model to unload

    await triggerSnapshot('model_unloaded');

    // Read all snapshots from device
    const snapshots = await readSnapshots();
    expect(snapshots).toHaveLength(7);

    // Build canonical report
    const report = buildReport(snapshots, model);

    // Write report to OUTPUT_DIR
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, {recursive: true});
    }
    const reportPath = path.join(OUTPUT_DIR, 'memory-profile.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log('\n=== Memory Profile Report ===');
    console.log(`  Device: ${report.device}`);
    console.log(`  OS: ${report.os_version}`);
    console.log(`  Platform: ${report.platform}`);
    console.log(`  Model: ${report.model}`);
    console.log(`  Peak Memory: ${report.peak_memory_mb} MB`);
    console.log(`  Checkpoints: ${report.checkpoints.length}`);
    console.log(`  Report: ${reportPath}`);
    console.log('=============================\n');

    // Validate report schema
    expect(report.version).toBe('1.0');
    expect(report.checkpoints).toHaveLength(7);
    expect(report.peak_memory_mb).toBeGreaterThan(0);

    const expectedLabels = [
      'app_launch',
      'models_screen',
      'chat_screen',
      'model_loaded',
      'chat_active',
      'post_chat_idle',
      'model_unloaded',
    ];
    for (let i = 0; i < expectedLabels.length; i++) {
      expect(report.checkpoints[i].label).toBe(expectedLabels[i]);
    }
  });
});
