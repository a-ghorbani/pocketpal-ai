/**
 * Reusable model actions for E2E tests
 *
 * Provides download-and-load flow that can be shared across specs,
 * so each feature test doesn't need to duplicate model setup logic.
 */

import {ChatPage} from '../pages/ChatPage';
import {DrawerPage} from '../pages/DrawerPage';
import {ModelsPage} from '../pages/ModelsPage';
import {HFSearchSheet} from '../pages/HFSearchSheet';
import {ModelDetailsSheet} from '../pages/ModelDetailsSheet';
import {Selectors} from './selectors';
import {TIMEOUTS, ModelTestConfig} from '../fixtures/models';

declare const browser: WebdriverIO.Browser;

/**
 * Dismiss memory/performance warning alert if it appears.
 * The app shows this alert when loading models that may exceed device memory
 * or for multimodal models on low-end devices.
 * Taps "Continue" to proceed with loading anyway.
 */
export async function dismissPerformanceWarningIfPresent(): Promise<void> {
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
    // No alert appeared - just continue
  }
}

/**
 * Download a model from HuggingFace and load it.
 * After completion, the app auto-navigates to the Chat screen.
 *
 * @param model - Model config from fixtures/models.ts
 */
export async function downloadAndLoadModel(
  model: ModelTestConfig,
): Promise<void> {
  const chatPage = new ChatPage();
  const drawerPage = new DrawerPage();
  const modelsPage = new ModelsPage();
  const hfSearchSheet = new HFSearchSheet();
  const modelDetailsSheet = new ModelDetailsSheet();

  // Navigate to Models screen
  await chatPage.openDrawer();
  await drawerPage.waitForOpen();
  await drawerPage.navigateToModels();
  await modelsPage.waitForReady();

  // Open HuggingFace search
  await modelsPage.openHuggingFaceSearch();
  await hfSearchSheet.waitForReady();

  // Search and select model
  await hfSearchSheet.search(model.searchQuery);
  await hfSearchSheet.selectModel(model.selectorText);
  await modelDetailsSheet.waitForReady();

  // Scroll to file and start download
  await modelDetailsSheet.scrollToFile(model.downloadFile);
  await modelDetailsSheet.tapDownloadForFile(model.downloadFile);

  // Close sheets and return to Models screen
  await modelDetailsSheet.close();
  await hfSearchSheet.close();
  await modelsPage.waitForReady();

  // Wait for download to complete
  const downloadTimeout = model.downloadTimeout ?? TIMEOUTS.download;
  const containerSelector = Selectors.modelCard.cardContainer(
    model.downloadFile,
  );
  const modelCardContainer = browser.$(containerSelector);
  await modelCardContainer.waitForDisplayed({timeout: downloadTimeout});

  // Find and click load button
  const loadBtn = modelCardContainer.$(Selectors.modelCard.loadButtonElement);
  await loadBtn.waitForDisplayed({timeout: 10000});
  await loadBtn.click();

  // Handle potential memory/performance warning alert
  await dismissPerformanceWarningIfPresent();

  // Verify we're on chat screen (auto-navigates after load)
  await chatPage.waitForReady();

  console.log(`Model loaded successfully: ${model.id}`);
}

/**
 * Wait for inference to complete by polling for timing info.
 * Returns the timing text when complete.
 *
 * @param maxWaitMs - Maximum time to wait for completion
 * @param pollIntervalMs - How often to check
 */
export async function waitForInferenceComplete(
  maxWaitMs = 60000,
  pollIntervalMs = 2000,
): Promise<string> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const timingElement = browser.$(Selectors.chat.inferenceComplete);
    const exists = await timingElement.isExisting().catch(() => false);

    if (exists) {
      const attrName = (browser as any).isAndroid ? 'content-desc' : 'label';
      const labelText = await timingElement
        .getAttribute(attrName)
        .catch(() => '');
      const timingMatch = labelText.match(/(\d+(?:\.\d+)?ms\/token.*TTFT)/);
      return timingMatch ? timingMatch[1] : labelText.slice(-100);
    }

    // Swipe up to scroll down while waiting (in case content is long)
    try {
      const {width, height} = await (browser as any).getWindowSize();
      await (browser as any)
        .action('pointer', {parameters: {pointerType: 'touch'}})
        .move({x: Math.floor(width / 2), y: Math.floor(height * 0.7)})
        .down()
        .move({
          x: Math.floor(width / 2),
          y: Math.floor(height * 0.3),
          duration: 300,
        })
        .up()
        .perform();
    } catch {
      // Swipe failed, continue waiting
    }

    await browser.pause(pollIntervalMs);
  }

  throw new Error('Inference timed out - timing info not found');
}
