/**
 * Hub Run Deep Link E2E
 *
 * Drives the `pocketpal://hub/run` deep link end-to-end: fire the link (as the
 * Hugging Face "Use this model" button would), land on the full repo file list,
 * download a small model, load it, and send a first chat message.
 *
 * Also asserts the negative path: a link missing repo_id is rejected and opens
 * no sheet.
 *
 * The hub/run landing sheet reuses the same DetailsView as HF search, so the
 * file rows / download buttons are driven through ModelDetailsSheet.
 *
 * Usage:
 *   yarn test:android:local --spec specs/features/hub-run.spec.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import {expect} from '@wdio/globals';
import {ChatPage} from '../../pages/ChatPage';
import {DrawerPage} from '../../pages/DrawerPage';
import {ModelsPage} from '../../pages/ModelsPage';
import {ModelDetailsSheet} from '../../pages/ModelDetailsSheet';
import {Selectors, byTestId, nativeTextElement} from '../../helpers/selectors';
import {QUICK_TEST_MODEL, TIMEOUTS} from '../../fixtures/models';
import {SCREENSHOT_DIR} from '../../wdio.shared.conf';

declare const driver: WebdriverIO.Browser;
declare const browser: WebdriverIO.Browser;

// The e2e flavor uses the .e2e applicationId suffix; iOS keeps the prod bundle.
const ANDROID_PACKAGE = 'com.pocketpalai.e2e';
const IOS_BUNDLE_ID = 'ai.pocketpal';

// QUICK_TEST_MODEL is SmolLM2-135M (bartowski/SmolLM2-135M-Instruct-GGUF). The
// fixture stores search/select text; the deep link needs the repo id directly.
const REPO_ID = 'bartowski/SmolLM2-135M-Instruct-GGUF';

/**
 * Fire a pocketpal:// deep link via Appium's mobile: deepLink, targeting the
 * e2e build on Android and the prod bundle on iOS.
 */
async function fireDeepLink(url: string): Promise<void> {
  const opts: Record<string, string> = {url};
  if (driver.isAndroid) {
    opts.package = ANDROID_PACKAGE;
  } else {
    opts.bundleId = IOS_BUNDLE_ID;
  }
  await driver.execute('mobile: deepLink', opts);
}

/**
 * Dismiss the memory/performance warning alert if it appears after tapping
 * load. Mirrors the quick-smoke helper.
 */
async function dismissPerformanceWarningIfPresent(): Promise<void> {
  try {
    await browser.pause(1500);
    const continueButton = browser.$(Selectors.alert.continueButton);
    if (await continueButton.isExisting()) {
      if (await continueButton.isDisplayed()) {
        await continueButton.click();
        await browser.pause(500);
      }
    }
  } catch {
    // No alert appeared - continue.
  }
}

describe('Hub Run Deep Link', () => {
  const model = QUICK_TEST_MODEL;

  let chatPage: ChatPage;
  let drawerPage: DrawerPage;
  let modelsPage: ModelsPage;
  let hubSheet: ModelDetailsSheet;

  beforeEach(async () => {
    chatPage = new ChatPage();
    drawerPage = new DrawerPage();
    modelsPage = new ModelsPage();
    hubSheet = new ModelDetailsSheet();
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

  it('rejects a deep link missing repo_id and opens no sheet', async () => {
    await fireDeepLink('pocketpal://hub/run?filename=x.gguf');

    // The landing sheet must not appear for an invalid link.
    const ready = browser.$(byTestId('hub-run-ready'));
    const resolving = browser.$(byTestId('hub-run-resolving'));
    await browser.pause(3000);
    expect(await ready.isExisting()).toBe(false);
    expect(await resolving.isExisting()).toBe(false);

    // Dismiss the invalid-link alert if shown so the next test starts clean.
    try {
      const ok = browser.$(Selectors.alert.button('OK'));
      if (await ok.isExisting()) {
        await ok.click();
      }
    } catch {
      // No alert - fine.
    }
  });

  it(`downloads ${model.id} via hub/run deep link, loads, and chats`, async () => {
    // Fire the link with NO filename - the sheet must list the full repo.
    await fireDeepLink(`pocketpal://hub/run?repo_id=${REPO_ID}&source=hf`);

    // Wait for the repo to resolve and the DetailsView list to render.
    const ready = browser.$(byTestId('hub-run-ready'));
    await ready.waitForDisplayed({timeout: 40000});

    // The full quant list is shown: the target file row exists.
    await hubSheet.scrollToFile(model.downloadFile);
    const fileCard = browser.$(Selectors.modelDetails.fileCard(model.downloadFile));
    await fileCard.waitForExist({timeout: TIMEOUTS.element});

    // Start the download for the small Q2_K file.
    await hubSheet.tapDownloadForFile(model.downloadFile);

    // Dismiss the hub/run sheet and return to chat.
    await hubSheet.close();
    await chatPage.waitForReady();

    // Go to Models, wait for the download to finish, then load.
    await chatPage.openDrawer();
    await drawerPage.waitForOpen();
    await drawerPage.navigateToModels();
    await modelsPage.waitForReady();

    const containerSelector = Selectors.modelCard.cardContainer(model.downloadFile);
    const modelCardContainer = browser.$(containerSelector);
    await modelCardContainer.waitForDisplayed({timeout: TIMEOUTS.download});

    const loadBtn = modelCardContainer.$(Selectors.modelCard.loadButtonElement);
    await loadBtn.waitForDisplayed({timeout: TIMEOUTS.element});
    await loadBtn.click();

    await dismissPerformanceWarningIfPresent();

    // Loading auto-navigates back to chat.
    await chatPage.waitForReady();
    await chatPage.resetChat();

    // First chat.
    const prompt = model.prompts[0].input;
    await chatPage.sendMessage(prompt);

    const aiMessageEl = browser.$(Selectors.chat.aiMessage);
    await aiMessageEl.waitForExist({timeout: TIMEOUTS.inference});

    // Poll for inference completion via the timing accessibility label.
    const maxWaitTime = 60000;
    const pollInterval = 2000;
    const startTime = Date.now();
    let inferenceComplete = false;

    while (Date.now() - startTime < maxWaitTime) {
      const timingElement = browser.$(Selectors.chat.inferenceComplete);
      if (await timingElement.isExisting().catch(() => false)) {
        inferenceComplete = true;
        break;
      }
      await browser.pause(pollInterval);
    }

    if (!inferenceComplete) {
      throw new Error('Inference timed out - timing info not found');
    }

    const aiMessage = browser.$(Selectors.chat.aiMessage);
    const textView = aiMessage.$(nativeTextElement());
    const responseText = await textView
      .getText()
      .catch(() => '');
    console.log(`\nHub Run Results:\n  Model: ${model.id}\n  Prompt: ${prompt}\n  Response: ${responseText}`);
    expect(responseText.length).toBeGreaterThan(0);

    // No error snackbar.
    try {
      const error = browser.$(Selectors.common.errorSnackbar);
      expect(await error.isDisplayed()).toBe(false);
    } catch {
      // No error snackbar - good.
    }
  });
});
