/**
 * E2E Test: Model Download and Chat Flow
 *
 * Data-driven test that verifies the complete flow for multiple models:
 * 1. Navigate to Models screen
 * 2. Open HuggingFace search
 * 3. Search for a model
 * 4. Select model from results
 * 5. Download a specific model file
 * 6. Wait for download to complete
 * 7. Close sheets and load the model
 * 8. Navigate to Chat
 * 9. Send prompts and verify responses
 *
 * Models to test are defined in fixtures/models.ts
 * Filter with: TEST_MODELS=model-id yarn test:ios:local
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
  getModelsToTest,
  TIMEOUTS,
  ModelTestConfig,
  PromptTestCase,
} from '../fixtures/models';

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
  let chatPage: ChatPage;
  let drawerPage: DrawerPage;
  let modelsPage: ModelsPage;
  let hfSearchSheet: HFSearchSheet;
  let modelDetailsSheet: ModelDetailsSheet;

  // Get models to test (can be filtered via TEST_MODELS env var)
  const modelsToTest = getModelsToTest();

  beforeEach(async () => {
    chatPage = new ChatPage();
    drawerPage = new DrawerPage();
    modelsPage = new ModelsPage();
    hfSearchSheet = new HFSearchSheet();
    modelDetailsSheet = new ModelDetailsSheet();

    // Ensure we're on the chat screen before each test
    // The app might be on a different screen from a previous test
    const onChatScreen = await chatPage.isDisplayed();
    if (!onChatScreen) {
      // Try to navigate to chat via drawer
      // First check if drawer is already open
      const drawerOpen = await drawerPage.isOpen();
      if (!drawerOpen) {
        // We might be on models screen or elsewhere - find and tap menu button
        const menuButton = browser.$(Selectors.chat.menuButton);
        const menuVisible = await menuButton.isDisplayed().catch(() => false);
        if (menuVisible) {
          await menuButton.click();
        } else {
          // Try models screen menu button
          const modelsMenuButton = browser.$(Selectors.models.menuButton);
          const modelsMenuVisible = await modelsMenuButton
            .isDisplayed()
            .catch(() => false);
          if (modelsMenuVisible) {
            await modelsMenuButton.click();
          }
        }
      }
      // Navigate to chat
      await drawerPage.navigateToChat();
    }

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

  // Run tests for each configured model
  for (const model of modelsToTest) {
    describe(`Model: ${model.id}`, () => {
      it(`should download ${model.downloadFile} and load model`, async () => {
        await downloadAndLoadModel(model);
      });

      // Run each prompt as a separate test case
      for (const prompt of model.prompts) {
        it(`should respond to: "${prompt.description || prompt.input}"`, async () => {
          await testPrompt(model, prompt);
        });
      }
    });
  }

  /**
   * Download and load a model from HuggingFace
   */
  async function downloadAndLoadModel(model: ModelTestConfig): Promise<void> {
    const downloadTimeout = model.downloadTimeout ?? TIMEOUTS.download;

    // Step 1: Navigate to Models screen
    await chatPage.openDrawer();
    await drawerPage.waitForOpen();
    await drawerPage.navigateToModels();
    await modelsPage.waitForReady();

    // Step 1.5: Offload any currently loaded model before loading a new one
    await offloadCurrentModelIfLoaded();

    // Step 2: Open HuggingFace search
    await modelsPage.openHuggingFaceSearch();
    await hfSearchSheet.waitForReady();

    // Step 3: Search for model
    await hfSearchSheet.search(model.searchQuery);

    // Step 4: Select model from search results
    await hfSearchSheet.selectModel(model.selectorText);
    await modelDetailsSheet.waitForReady();

    // Step 5: Scroll to the specific file if needed and start download
    await modelDetailsSheet.scrollToFile(model.downloadFile);
    await modelDetailsSheet.tapDownloadForFile(model.downloadFile);

    // Step 6: Close sheets and return to Models screen
    await modelDetailsSheet.close();
    await hfSearchSheet.close();
    await modelsPage.waitForReady();

    // Step 7: Wait for download to complete and load the model
    await waitForDownloadAndLoad(model.downloadFile, downloadTimeout);

    // Step 8: Verify we're back on chat screen (auto-navigates after load)
    await chatPage.waitForReady();

    // Step 9: Reset chat to start fresh (clears any previous conversation)
    await chatPage.resetChat();

    console.log(`\nModel loaded successfully: ${model.id}`);
  }

  /**
   * Test a prompt with the currently loaded model
   */
  async function testPrompt(
    model: ModelTestConfig,
    prompt: PromptTestCase,
  ): Promise<void> {
    const inferenceTimeout = model.inferenceTimeout ?? TIMEOUTS.inference;

    // Send the message
    await chatPage.sendMessage(prompt.input);

    // Wait for AI response
    await waitForResponse(inferenceTimeout);

    // Save inference report
    await saveInferenceReport(prompt.input, model.id);

    // Verify no error occurred
    const errorVisible = await isErrorDisplayed();
    expect(errorVisible).toBe(false);
  }

  /**
   * Wait for download to complete and load a specific model
   * Finds the model card container by filename and clicks its load button
   */
  async function waitForDownloadAndLoad(
    filename: string,
    timeout: number,
  ): Promise<void> {
    // Wait for the specific model card container to appear (download complete)
    // Note: The model card element itself has no children - buttons are siblings in the container
    const containerSelector = Selectors.modelCard.cardContainer(filename);
    const modelCardContainer = browser.$(containerSelector);
    await modelCardContainer.waitForDisplayed({timeout});

    // Find and click the load button within the container
    const loadBtn = modelCardContainer.$(Selectors.modelCard.loadButtonElement);
    await loadBtn.waitForDisplayed({timeout: 10000});
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
   * Offload any currently loaded model by clicking its offload button
   * This ensures a clean state before loading a new model
   */
  async function offloadCurrentModelIfLoaded(): Promise<void> {
    try {
      // Check if any offload button is visible (indicates a model is loaded)
      const offloadButton = browser.$(Selectors.modelCard.offloadButton);
      const isVisible = await offloadButton.isDisplayed().catch(() => false);

      if (isVisible) {
        console.log('Offloading currently loaded model...');
        await offloadButton.click();
        // Wait a moment for the offload to complete
        await browser.pause(1000);
      }
    } catch {
      // No model loaded or offload button not found - that's fine
    }
  }

  /**
   * Extract timing info and save to report file.
   * Note: Full AI response text extraction is not reliable in React Native
   * due to how RenderHtml renders content. We verify response exists via timing.
   */
  async function saveInferenceReport(
    prompt: string,
    modelId: string,
  ): Promise<InferenceReport> {
    // Ensure output directory exists
    const outputDir = path.join(__dirname, '../debug-output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, {recursive: true});
    }

    // Get timing info - this confirms response was generated
    // Timing text is a sibling element after message-timing, not a child
    const timingTextElement = browser.$(Selectors.chat.messageTimingText);
    const timingText = await timingTextElement.getText();

    // Extract AI response text from the native TextView/StaticText inside ai-message
    const aiMessage = browser.$(Selectors.chat.aiMessage);
    const textView = aiMessage.$(nativeTextElement());
    const responseText = await textView.getText();

    const report: InferenceReport = {
      model: modelId,
      prompt,
      response: responseText,
      timing: timingText,
      timestamp: new Date().toISOString(),
    };

    // Save report to file
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
    console.log(`  Model: ${modelId}`);
    console.log(`  Prompt: ${prompt}`);
    console.log(`  Response: ${responseText}`);
    console.log(`  Timing: ${timingText}`);

    return report;
  }
});
