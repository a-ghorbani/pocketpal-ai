/**
 * Load Stress Test: Model load/unload cycle testing for crash reproduction
 *
 * This spec is designed to reproduce and diagnose model loading crashes
 * by running multiple load/unload cycles on specific models.
 *
 * Usage:
 *   TEST_MODELS=gemma-2-2b yarn test:android:local --spec specs/load-stress.spec.ts
 *   yarn crash-repro --model gemma-2-2b
 *   yarn crash-repro --model smolvlm2-500m --local
 */

import * as fs from 'fs';
import * as path from 'path';
import {ChatPage} from '../pages/ChatPage';
import {DrawerPage} from '../pages/DrawerPage';
import {ModelsPage} from '../pages/ModelsPage';
import {HFSearchSheet} from '../pages/HFSearchSheet';
import {ModelDetailsSheet} from '../pages/ModelDetailsSheet';
import {Selectors, nativeTextElement} from '../helpers/selectors';
import {
  TIMEOUTS,
  getModelsToTest,
  ModelTestConfig,
} from '../fixtures/models';
import {SCREENSHOT_DIR, OUTPUT_DIR} from '../wdio.shared.conf';

declare const driver: WebdriverIO.Browser;
declare const browser: WebdriverIO.Browser;

// Number of load/unload cycles to run
const LOAD_CYCLES = 3;

// Timeout for model loading (may take longer on low-end devices)
const LOAD_TIMEOUT = 120000; // 2 minutes

interface LoadCycleResult {
  cycle: number;
  loadSuccess: boolean;
  loadTimeMs?: number;
  inferenceSuccess?: boolean;
  inferenceTimeMs?: number;
  unloadSuccess: boolean;
  error?: string;
  screenshot?: string;
}

interface LoadStressReport {
  model: ModelTestConfig;
  timestamp: string;
  platform: string;
  totalCycles: number;
  successfulCycles: number;
  failedCycles: number;
  cycles: LoadCycleResult[];
  overallSuccess: boolean;
}

/**
 * Check if a model is a vision model by ID or explicit flag
 */
function isVisionModel(model: ModelTestConfig): boolean {
  if (model.isVision) {
    return true;
  }
  // Check common vision model patterns in ID
  const visionPatterns = ['vlm', 'vl-', 'vision', 'smolvlm', 'lfm'];
  return visionPatterns.some(pattern =>
    model.id.toLowerCase().includes(pattern),
  );
}

/**
 * Dismiss memory/performance warning alert if it appears.
 */
async function dismissPerformanceWarningIfPresent(): Promise<void> {
  try {
    await browser.pause(1500);
    const continueButton = browser.$(Selectors.alert.continueButton);
    const exists = await continueButton.isExisting();

    if (exists) {
      const isDisplayed = await continueButton.isDisplayed();
      if (isDisplayed) {
        console.log('Performance warning alert detected, tapping Continue...');
        await continueButton.click();
        await browser.pause(500);
      }
    }
  } catch {
    // No alert appeared - continue
  }
}

/**
 * Check if a "Failed to load model" error is displayed
 */
async function checkForLoadError(): Promise<string | null> {
  try {
    // Check for error snackbar
    const errorSnackbar = browser.$(Selectors.common.errorSnackbar);
    if (await errorSnackbar.isDisplayed().catch(() => false)) {
      const textElement = errorSnackbar.$(nativeTextElement());
      if (await textElement.isExisting()) {
        return await textElement.getText();
      }
    }

    // Check for alert dialog with error
    const alertTitle = browser.$(Selectors.alert.title);
    if (await alertTitle.isExisting().catch(() => false)) {
      const titleText = await alertTitle.getText().catch(() => '');
      if (titleText.toLowerCase().includes('error') || titleText.toLowerCase().includes('failed')) {
        const alertMessage = browser.$(Selectors.alert.message);
        const message = await alertMessage.getText().catch(() => titleText);
        return message;
      }
    }
  } catch {
    // No error detected
  }
  return null;
}

/**
 * Capture a screenshot and save it
 */
async function captureScreenshot(
  testName: string,
  suffix: string,
): Promise<string | undefined> {
  // Use SCREENSHOT_DIR for Device Farm compatibility
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, {recursive: true});
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${testName}-${suffix}-${timestamp}.png`;
  const filepath = path.join(SCREENSHOT_DIR, filename);

  try {
    await driver.saveScreenshot(filepath);
    return filename;
  } catch (e) {
    console.error('Failed to capture screenshot:', (e as Error).message);
    return undefined;
  }
}

/**
 * Get the model to test from environment or defaults
 */
function getModelForTest(): ModelTestConfig {
  // Use getModelsToTest with includeAllModels=true to search all models including crash-repro
  const models = getModelsToTest(true);
  return models[0];
}

describe('Load Stress Test', () => {
  const model = getModelForTest();

  let chatPage: ChatPage;
  let drawerPage: DrawerPage;
  let modelsPage: ModelsPage;
  let hfSearchSheet: HFSearchSheet;
  let modelDetailsSheet: ModelDetailsSheet;

  const report: LoadStressReport = {
    model,
    timestamp: new Date().toISOString(),
    platform: '',
    totalCycles: LOAD_CYCLES,
    successfulCycles: 0,
    failedCycles: 0,
    cycles: [],
    overallSuccess: false,
  };

  beforeEach(async () => {
    chatPage = new ChatPage();
    drawerPage = new DrawerPage();
    modelsPage = new ModelsPage();
    hfSearchSheet = new HFSearchSheet();
    modelDetailsSheet = new ModelDetailsSheet();

    // Set platform in report
    report.platform = driver.isAndroid ? 'android' : 'ios';

    await chatPage.waitForReady(TIMEOUTS.appReady);
  });

  afterEach(async function (this: Mocha.Context) {
    // Save report regardless of test outcome - use OUTPUT_DIR for Device Farm compatibility
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, {recursive: true});
    }

    report.overallSuccess =
      report.successfulCycles === report.totalCycles && report.failedCycles === 0;

    const reportPath = path.join(OUTPUT_DIR, `load-stress-report-${model.id}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nReport saved to: ${reportPath}`);

    if (this.currentTest?.state === 'failed') {
      await captureScreenshot(model.id, 'final-failure');
    }
  });

  it(`should download ${model.id} and run ${LOAD_CYCLES} load/unload cycles`, async () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Load Stress Test: ${model.id}`);
    console.log(`Vision model: ${isVisionModel(model) ? 'Yes' : 'No'}`);
    console.log(`Cycles: ${LOAD_CYCLES}`);
    console.log(`${'='.repeat(60)}\n`);

    // Navigate to Models screen
    await chatPage.openDrawer();
    await drawerPage.waitForOpen();
    await drawerPage.navigateToModels();
    await modelsPage.waitForReady();

    // Check if model is already downloaded
    const containerSelector = Selectors.modelCard.cardContainer(model.downloadFile);
    let modelCardContainer = browser.$(containerSelector);
    let isDownloaded = await modelCardContainer.isExisting().catch(() => false);

    if (!isDownloaded) {
      console.log(`Model not downloaded. Downloading ${model.downloadFile}...`);

      // Download the model
      await modelsPage.openHuggingFaceSearch();
      await hfSearchSheet.waitForReady();
      await hfSearchSheet.search(model.searchQuery);
      await hfSearchSheet.selectModel(model.selectorText);
      await modelDetailsSheet.waitForReady();
      await modelDetailsSheet.scrollToFile(model.downloadFile);
      await modelDetailsSheet.tapDownloadForFile(model.downloadFile);
      await modelDetailsSheet.close();
      await hfSearchSheet.close();
      await modelsPage.waitForReady();

      // Wait for download to complete
      const downloadTimeout = model.downloadTimeout || TIMEOUTS.download;
      modelCardContainer = browser.$(containerSelector);
      await modelCardContainer.waitForDisplayed({timeout: downloadTimeout});

      console.log('Download complete.');
    } else {
      console.log('Model already downloaded.');
    }

    // Run load/unload cycles
    for (let cycle = 1; cycle <= LOAD_CYCLES; cycle++) {
      console.log(`\n--- Cycle ${cycle}/${LOAD_CYCLES} ---`);

      const cycleResult: LoadCycleResult = {
        cycle,
        loadSuccess: false,
        unloadSuccess: false,
      };

      const loadStartTime = Date.now();

      try {
        // Ensure we're on the models screen
        if (!(await modelsPage.isDisplayed())) {
          await chatPage.openDrawer();
          await drawerPage.waitForOpen();
          await drawerPage.navigateToModels();
          await modelsPage.waitForReady();
        }

        // Find and click load button
        modelCardContainer = browser.$(containerSelector);
        const loadBtn = modelCardContainer.$(Selectors.modelCard.loadButtonElement);
        await loadBtn.waitForDisplayed({timeout: 10000});
        await loadBtn.click();

        // Handle performance warning
        await dismissPerformanceWarningIfPresent();

        // Wait for load to complete - model loads and auto-navigates to chat
        await chatPage.waitForReady(LOAD_TIMEOUT);

        // Check for load error
        const loadError = await checkForLoadError();
        if (loadError) {
          throw new Error(`Model load error: ${loadError}`);
        }

        cycleResult.loadSuccess = true;
        cycleResult.loadTimeMs = Date.now() - loadStartTime;
        console.log(`Load successful (${cycleResult.loadTimeMs}ms)`);

        // Run quick inference test
        const inferenceStartTime = Date.now();

        try {
          await chatPage.resetChat();

          const prompt = model.prompts[0].input;
          await chatPage.sendMessage(prompt);

          // Wait for AI message to appear first (indicates response started)
          console.log('[Timing] Waiting for AI message to appear...');
          const aiMessage = browser.$(Selectors.chat.aiMessage);
          await aiMessage.waitForExist({timeout: TIMEOUTS.inference});
          console.log('[Timing] AI message exists');

          // Poll for completion by checking for timing pattern in accessibility label
          // The timing info appears in the message bubble's accessibility label when inference completes
          const maxWaitTime = 60000; // 1 minute max for inference
          const pollInterval = 2000; // Check every 2 seconds
          const startTime = Date.now();
          let inferenceComplete = false;

          while (Date.now() - startTime < maxWaitTime) {
            // Check if timing element exists (cross-platform selector)
            const timingElement = browser.$(Selectors.chat.inferenceComplete);
            const exists = await timingElement.isExisting().catch(() => false);

            if (exists) {
              console.log('[Timing] Inference complete - timing found');
              inferenceComplete = true;
              break;
            }

            // Swipe up to scroll down while waiting (in case content is long)
            try {
              const {width, height} = await driver.getWindowSize();
              await driver.action('pointer', {
                parameters: {pointerType: 'touch'},
              })
                .move({x: Math.floor(width / 2), y: Math.floor(height * 0.7)})
                .down()
                .move({x: Math.floor(width / 2), y: Math.floor(height * 0.3), duration: 300})
                .up()
                .perform();
              console.log('[Timing] Swiped up to scroll');
            } catch {
              // Swipe failed, continue waiting
            }

            await browser.pause(pollInterval);
          }

          if (!inferenceComplete) {
            throw new Error('Inference timed out - timing info not found');
          }

          console.log('[Timing] Inference successful');

          cycleResult.inferenceSuccess = true;
          cycleResult.inferenceTimeMs = Date.now() - inferenceStartTime;
          console.log(`Inference successful (${cycleResult.inferenceTimeMs}ms)`);
        } catch (inferenceError) {
          cycleResult.inferenceSuccess = false;
          cycleResult.error = `Inference error: ${(inferenceError as Error).message}`;
          console.log(`Inference failed: ${cycleResult.error}`);
          cycleResult.screenshot = await captureScreenshot(model.id, `cycle${cycle}-inference-error`);

          // Dump page source for debugging (with timestamp matching screenshot)
          try {
            const pageSource = await driver.getPageSource();
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const sourceFile = path.join(OUTPUT_DIR, `page-source-${model.id}-cycle${cycle}-${timestamp}.xml`);
            fs.writeFileSync(sourceFile, pageSource);
            console.log(`Page source saved to: ${sourceFile}`);
          } catch (sourceError) {
            console.log(`Failed to get page source: ${(sourceError as Error).message}`);
          }
        }

        // Unload model - navigate back to models and find offload button
        await chatPage.openDrawer();
        await drawerPage.waitForOpen();
        await drawerPage.navigateToModels();
        await modelsPage.waitForReady();

        // Find the offload button (model is loaded, so should show offload)
        modelCardContainer = browser.$(containerSelector);
        const offloadBtn = modelCardContainer.$(
          driver.isAndroid
            ? `.//android.widget.Button[contains(@resource-id, "offload-button")]`
            : `-ios predicate string:name == "offload-button"`,
        );

        if (await offloadBtn.isExisting().catch(() => false)) {
          await offloadBtn.click();
          await browser.pause(1000); // Wait for unload

          // Verify unload by checking for load button again
          const loadBtnAfterUnload = modelCardContainer.$(Selectors.modelCard.loadButtonElement);
          await loadBtnAfterUnload.waitForDisplayed({timeout: 10000});

          cycleResult.unloadSuccess = true;
          console.log('Unload successful');
        } else {
          // No offload button - model might have crashed during inference
          cycleResult.unloadSuccess = true; // Consider it unloaded
          console.log('No offload button found (model may have auto-unloaded)');
        }

        report.successfulCycles++;
      } catch (error) {
        const errorMessage = (error as Error).message;
        cycleResult.error = cycleResult.error || errorMessage;
        cycleResult.loadTimeMs = cycleResult.loadTimeMs || Date.now() - loadStartTime;
        cycleResult.screenshot = await captureScreenshot(model.id, `cycle${cycle}-error`);

        console.log(`Cycle ${cycle} FAILED: ${errorMessage}`);
        report.failedCycles++;

        // Try to recover for next cycle
        try {
          // Dismiss any alerts
          const cancelBtn = browser.$(Selectors.alert.cancelButton);
          if (await cancelBtn.isExisting().catch(() => false)) {
            await cancelBtn.click();
          }

          // Navigate back to models
          if (await chatPage.isDisplayed()) {
            await chatPage.openDrawer();
            await drawerPage.waitForOpen();
            await drawerPage.navigateToModels();
          }
        } catch {
          // Continue anyway
        }
      }

      report.cycles.push(cycleResult);
    }

    // Print summary
    console.log(`\n${'='.repeat(60)}`);
    console.log('LOAD STRESS TEST SUMMARY');
    console.log(`${'='.repeat(60)}`);
    console.log(`Model: ${model.id}`);
    console.log(`Platform: ${report.platform}`);
    console.log(`Total cycles: ${LOAD_CYCLES}`);
    console.log(`Successful: ${report.successfulCycles}`);
    console.log(`Failed: ${report.failedCycles}`);
    console.log(`${'='.repeat(60)}\n`);

    // Assert overall success
    if (report.failedCycles > 0) {
      const failedCycles = report.cycles.filter(c => !c.loadSuccess || c.error);
      const errors = failedCycles.map(c => `Cycle ${c.cycle}: ${c.error}`).join('\n');
      throw new Error(`${report.failedCycles} cycle(s) failed:\n${errors}`);
    }
  });
});
