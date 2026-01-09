/**
 * E2E Test: Model Download and Chat Flow
 *
 * Verifies the complete flow:
 * 1. Navigate to Models screen
 * 2. Open HuggingFace search
 * 3. Search for a model
 * 4. Select model from results
 * 5. Download the model
 * 6. Wait for download to complete
 * 7. Close sheets and load the model
 * 8. Navigate to Chat
 * 9. Send a message and verify response
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

declare const driver: WebdriverIO.Browser;
declare const browser: WebdriverIO.Browser;

interface InferenceReport {
  model: string;
  prompt: string;
  response: string;
  timing: string;
  timestamp: string;
}

describe('PocketPal - Model Download and Chat', () => {
  const MODEL_SEARCH_QUERY = 'bartowski smollm2 135m';
  const MODEL_NAME = 'SmolLM2-135M-Instruct';
  const DOWNLOAD_TIMEOUT = 300000; // 5 minutes
  const INFERENCE_TIMEOUT = 120000; // 2 minutes

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

    await chatPage.waitForReady(60000);
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

  it('should download a model from HuggingFace and chat with it', async () => {
    // Step 1: Navigate to Models screen
    await chatPage.openDrawer();
    await drawerPage.waitForOpen();
    await drawerPage.navigateToModels();
    await modelsPage.waitForReady();

    // Step 2: Open HuggingFace search
    await modelsPage.openHuggingFaceSearch();
    await hfSearchSheet.waitForReady();

    // Step 3: Search for model
    await hfSearchSheet.search(MODEL_SEARCH_QUERY);

    // Step 4: Select model from search results
    await hfSearchSheet.selectModel(MODEL_NAME);
    await modelDetailsSheet.waitForReady();

    // Step 5: Start download
    await modelDetailsSheet.tapDownload();

    // Step 6: Close sheets and return to Models screen
    await modelDetailsSheet.close();
    await hfSearchSheet.close();
    await modelsPage.waitForReady();

    // Step 7: Wait for download to complete and load the model
    await waitForDownloadAndLoad(DOWNLOAD_TIMEOUT);

    // Step 9: Navigate to Chat screen
    // load auto-navigates to chat
    // await modelsPage.openDrawer();
    // await drawerPage.waitForOpen();
    // await drawerPage.navigateToChat();
    await chatPage.waitForReady();

    // Step 10: Send a message
    const prompt = 'Hi';
    await chatPage.sendMessage(prompt);

    // Step 11: Wait for AI response
    await waitForResponse(INFERENCE_TIMEOUT);

    // Step 12: Save inference report
    await saveInferenceReport(prompt, MODEL_NAME);

    // Verify no error occurred
    const errorVisible = await isErrorDisplayed();
    expect(errorVisible).toBe(false);
  });

  /**
   * Wait for download to complete and load the model
   * Download is complete when load-button appears on the Models screen
   */
  async function waitForDownloadAndLoad(timeout: number): Promise<void> {
    const loadBtn = browser.$(Selectors.modelCard.loadButton);

    // Wait for load button to appear (download complete)
    await loadBtn.waitForDisplayed({timeout});

    // Load the model
    await loadBtn.click();
  }

  /**
   * Wait for AI response by checking for timing info to appear
   */
  async function waitForResponse(timeout: number): Promise<void> {
    const timing = browser.$(Selectors.chat.messageTiming);
    await timing.waitForDisplayed({timeout});
  }

  /**
   * Check if any error is displayed
   */
  async function isErrorDisplayed(): Promise<boolean> {
    try {
      const errorSelector = Selectors.common.errorSnackbar;
      const error = browser.$(errorSelector);
      return await error.isDisplayed();
    } catch {
      return false;
    }
  }

  /**
   * Extract timing info and save to report file.
   * Note: Full AI response text extraction is not reliable in React Native
   * due to how RenderHtml renders content. We verify response exists via timing.
   */
  async function saveInferenceReport(
    prompt: string,
    model: string,
  ): Promise<InferenceReport> {
    // Dump page source for debugging layout structure
    const outputDir = path.join(__dirname, '../debug-output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, {recursive: true});
    }

    // Get timing info - this confirms response was generated
    const timing = browser.$(Selectors.chat.messageTiming);
    const timingText = await timing.getText();

    // Extract AI response text from the native TextView/StaticText inside ai-message
    const aiMessage = browser.$(Selectors.chat.aiMessage);
    const textView = aiMessage.$(nativeTextElement());
    const responseText = await textView.getText();

    const report: InferenceReport = {
      model,
      prompt,
      response: responseText,
      timing: timingText,
      timestamp: new Date().toISOString(),
    };

    // Save report to file (outputDir already created above for layout dump)
    const reportPath = path.join(outputDir, 'inference-report.json');

    // Append to existing reports or create new array
    let reports: InferenceReport[] = [];
    if (fs.existsSync(reportPath)) {
      const existing = fs.readFileSync(reportPath, 'utf-8');
      reports = JSON.parse(existing);
    }
    reports.push(report);

    fs.writeFileSync(reportPath, JSON.stringify(reports, null, 2));
    console.log(`\nInference Report saved to: ${reportPath}`);
    console.log(`  Model: ${model}`);
    console.log(`  Prompt: ${prompt}`);
    console.log(`  Response: ${responseText}`);
    console.log(`  Timing: ${timingText}`);

    return report;
  }
});
