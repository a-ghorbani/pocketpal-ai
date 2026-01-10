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
import {QUICK_TEST_MODEL, TIMEOUTS} from '../fixtures/models';

declare const driver: WebdriverIO.Browser;
declare const browser: WebdriverIO.Browser;

describe('Quick Smoke Test', () => {
  const model = QUICK_TEST_MODEL;

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
    const loadBtn = browser.$(Selectors.modelCard.loadButton);
    await loadBtn.waitForDisplayed({timeout: TIMEOUTS.download});
    await loadBtn.click();

    // Verify we're back on chat screen (auto-navigates after load)
    await chatPage.waitForReady();
    console.log(`\nModel loaded successfully: ${model.id}`);

    // Send a message
    const prompt = model.prompts[0].input;
    await chatPage.sendMessage(prompt);

    // Wait for AI response
    const timing = browser.$(Selectors.chat.messageTiming);
    await timing.waitForDisplayed({timeout: TIMEOUTS.inference});

    // Save page source for debugging element structure
    const outputDir = path.join(__dirname, '../debug-output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, {recursive: true});
    }

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

    // Save quick report (outputDir already created above for page source)
    const reportPath = path.join(outputDir, 'quick-smoke-report.json');
    fs.writeFileSync(
      reportPath,
      JSON.stringify(
        {
          model: model.id,
          prompt,
          response: responseText,
          timing: timingText,
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );

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
