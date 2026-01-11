/**
 * Quick Smoke Test: Fast validation with smallest model
 *
 * Use this for rapid iteration when testing E2E infrastructure.
 * Runs a single small model (SmolLM2-135M) to verify the flow works.
 *
 * Usage:
 *   yarn test:ios:local --spec specs/quick-smoke.spec.ts
 *   yarn test:android:local --spec specs/quick-smoke.spec.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import {expect} from '@wdio/globals';
import {ChatPage} from '../pages/ChatPage';
import {DrawerPage} from '../pages/DrawerPage';
import {ModelsPage} from '../pages/ModelsPage';
import {HFSearchSheet} from '../pages/HFSearchSheet';
import {ModelDetailsSheet} from '../pages/ModelDetailsSheet';
import {Selectors, nativeTextElement} from '../helpers/selectors';
import {
  QUICK_TEST_MODEL,
  TIMEOUTS,
  getModelsToTest,
  ModelTestConfig,
} from '../fixtures/models';

declare const driver: WebdriverIO.Browser;
declare const browser: WebdriverIO.Browser;

/**
 * Dismiss memory/performance warning alert if it appears.
 * The app shows this alert when loading models that may exceed device memory
 * or for multimodal models on low-end devices.
 * Taps "Continue" to proceed with loading anyway.
 */
async function dismissPerformanceWarningIfPresent(): Promise<void> {
  try {
    // Wait briefly for the alert to potentially appear
    await browser.pause(1500);

    const continueButton = browser.$(Selectors.alert.continueButton);
    const exists = await continueButton.isExisting();

    if (exists) {
      const isDisplayed = await continueButton.isDisplayed();
      if (isDisplayed) {
        console.log('Performance warning alert detected, tapping Continue...');
        await continueButton.click();
        // Wait for alert to dismiss
        await browser.pause(500);
      }
    }
  } catch {
    // No alert appeared or error - just continue
  }
}

/**
 * Get the model to test.
 * If TEST_MODELS env var is set, use the first model from the filtered list.
 * Otherwise, use the default QUICK_TEST_MODEL.
 */
function getModelForTest(): ModelTestConfig {
  const envFilter = process.env.TEST_MODELS;
  if (envFilter) {
    const models = getModelsToTest();
    return models[0]; // Use first matched model
  }
  return QUICK_TEST_MODEL;
}

describe('Quick Smoke Test', () => {
  const model = getModelForTest();

  let chatPage: ChatPage;
  let drawerPage: DrawerPage;
  let modelsPage: ModelsPage;
  let hfSearchSheet: HFSearchSheet;
  let modelDetailsSheet: ModelDetailsSheet;

  beforeEach(async () => {
    chatPage = new ChatPage();
    drawerPage = new DrawerPage();
    modelsPage = new ModelsPage();
    hfSearchSheet = new HFSearchSheet();
    modelDetailsSheet = new ModelDetailsSheet();

    await chatPage.waitForReady(TIMEOUTS.appReady);
  });

  afterEach(async function (this: Mocha.Context) {
    if (this.currentTest?.state === 'failed') {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const testName = this.currentTest.title.replace(/\s+/g, '-');
      try {
        await driver.saveScreenshot(
          `./debug-output/failure-${testName}-${timestamp}.png`,
        );
      } catch (e) {
        console.error('Failed to capture screenshot:', (e as Error).message);
      }
    }
  });

  it(`should download ${model.id}, load, and chat`, async () => {
    // Navigate to Models screen
    await chatPage.openDrawer();
    await drawerPage.waitForOpen();
    await drawerPage.navigateToModels();
    await modelsPage.waitForReady();

    // Open HuggingFace search
    await modelsPage.openHuggingFaceSearch();
    await hfSearchSheet.waitForReady();

    // Search for model
    await hfSearchSheet.search(model.searchQuery);

    // Select model from search results
    await hfSearchSheet.selectModel(model.selectorText);
    await modelDetailsSheet.waitForReady();

    // Scroll to the specific file if needed and start download
    await modelDetailsSheet.scrollToFile(model.downloadFile);
    await modelDetailsSheet.tapDownloadForFile(model.downloadFile);

    // Close sheets and return to Models screen
    await modelDetailsSheet.close();
    await hfSearchSheet.close();
    await modelsPage.waitForReady();

    // Wait for download to complete and load the model
    // Note: The model card element itself has no children - buttons are siblings in the container
    const containerSelector = Selectors.modelCard.cardContainer(model.downloadFile);
    const modelCardContainer = browser.$(containerSelector);
    await modelCardContainer.waitForDisplayed({timeout: TIMEOUTS.download});

    // Find and click the load button within the container
    const loadBtn = modelCardContainer.$(Selectors.modelCard.loadButtonElement);
    await loadBtn.waitForDisplayed({timeout: 10000});
    await loadBtn.click();

    // Handle potential memory/performance warning alert
    // The app may show a warning dialog for models that exceed device memory
    // or for multimodal models on low-end devices. Tap "Continue" to proceed.
    await dismissPerformanceWarningIfPresent();

    // Verify we're back on chat screen (auto-navigates after load)
    await chatPage.waitForReady();

    // Reset chat to start fresh
    await chatPage.resetChat();

    console.log(`\nModel loaded successfully: ${model.id}`);

    // Send a message
    const prompt = model.prompts[0].input;
    await chatPage.sendMessage(prompt);

    // Wait for AI response
    const timing = browser.$(Selectors.chat.messageTiming);
    await timing.waitForDisplayed({timeout: TIMEOUTS.inference});

    // Get timing and response
    // Timing text is a sibling element after message-timing, not a child
    const timingTextElement = browser.$(Selectors.chat.messageTimingText);
    const timingText = await timingTextElement.getText();

    const aiMessage = browser.$(Selectors.chat.aiMessage);
    const textView = aiMessage.$(nativeTextElement());
    const responseText = await textView.getText();

    console.log(`\nSmoke Test Results:`);
    console.log(`  Model: ${model.id}`);
    console.log(`  Prompt: ${prompt}`);
    console.log(`  Response: ${responseText}`);
    console.log(`  Timing: ${timingText}`);

    // Save reports
    const outputDir = path.join(__dirname, '../debug-output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, {recursive: true});
    }

    const testResult = {
      model: model.id,
      prompt,
      response: responseText,
      timing: timingText,
      timestamp: new Date().toISOString(),
      success: true,
    };

    // Save individual model report (for easy access to specific model results)
    const modelReportPath = path.join(outputDir, `report-${model.id}.json`);
    fs.writeFileSync(modelReportPath, JSON.stringify(testResult, null, 2));

    // Append to cumulative report (preserves all model results across runs)
    const cumulativeReportPath = path.join(outputDir, 'all-models-report.json');
    let allResults: typeof testResult[] = [];
    if (fs.existsSync(cumulativeReportPath)) {
      try {
        allResults = JSON.parse(fs.readFileSync(cumulativeReportPath, 'utf8'));
        // Remove any previous result for this model (in case of re-runs)
        allResults = allResults.filter(r => r.model !== model.id);
      } catch {
        allResults = [];
      }
    }
    allResults.push(testResult);
    fs.writeFileSync(cumulativeReportPath, JSON.stringify(allResults, null, 2));

    // Verify no error occurred
    try {
      const error = browser.$(Selectors.common.errorSnackbar);
      const errorVisible = await error.isDisplayed();
      expect(errorVisible).toBe(false);
    } catch {
      // No error snackbar found - good
    }
  });
});
