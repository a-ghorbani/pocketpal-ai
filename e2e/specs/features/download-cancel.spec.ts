/**
 * Download Cancel Test
 *
 * Verifies that stopping an in-progress model download does NOT surface a
 * "Download Failed" error dialog. User-initiated cancellation is not a failure.
 *
 * Regression coverage for issue #770: on iOS, RNFS.stopDownload rejects the
 * in-flight download promise; that rejection used to propagate to
 * modelStore.downloadError and pop the DownloadErrorDialog ("Download has been
 * aborted" + "Try again").
 *
 * Usage:
 *   yarn test:ios:local --spec specs/features/download-cancel.spec.ts
 *   yarn test:android:local --spec specs/features/download-cancel.spec.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import {expect} from '@wdio/globals';
import {ChatPage} from '../../pages/ChatPage';
import {DrawerPage} from '../../pages/DrawerPage';
import {ModelsPage} from '../../pages/ModelsPage';
import {HFSearchSheet} from '../../pages/HFSearchSheet';
import {ModelDetailsSheet} from '../../pages/ModelDetailsSheet';
import {Selectors} from '../../helpers/selectors';
import {TEST_MODELS, TIMEOUTS, ModelTestConfig} from '../../fixtures/models';
import {SCREENSHOT_DIR} from '../../wdio.shared.conf';

declare const driver: WebdriverIO.Browser;
declare const browser: WebdriverIO.Browser;

// A mid-sized model so the download stays in progress long enough to cancel
// (the cancel happens within ~1s of the cancel button appearing, so only a
// small fraction is ever fetched before it is aborted).
const CANCEL_TEST_MODEL: ModelTestConfig =
  TEST_MODELS.find(m => m.id === 'qwen3-0.6b') ?? TEST_MODELS[0];

describe('Download cancel', () => {
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

  it('stopping an in-progress download shows no error dialog', async () => {
    const model = CANCEL_TEST_MODEL;

    // Navigate to Models screen
    await chatPage.openDrawer();
    await drawerPage.waitForOpen();
    await drawerPage.navigateToModels();
    await modelsPage.waitForReady();

    // Open HuggingFace search and select the model
    await modelsPage.openHuggingFaceSearch();
    await hfSearchSheet.waitForReady();
    await hfSearchSheet.search(model.searchQuery);
    await hfSearchSheet.selectModel(model.selectorText);
    await modelDetailsSheet.waitForReady();

    // Start the download for the target file
    await modelDetailsSheet.scrollToFile(model.downloadFile);
    await modelDetailsSheet.tapDownloadForFile(model.downloadFile);

    // Download started → the file card swaps its download button for a cancel
    // button. Only one download is active in this test, so the testID is
    // unambiguous on screen.
    const cancelButton = browser.$(Selectors.modelDetails.cancelButton);
    await cancelButton.waitForDisplayed({timeout: 15000});
    console.log('[download-cancel] download in progress, tapping cancel');

    // Tap Stop/Cancel — this is the user-initiated cancellation under test.
    await cancelButton.click();

    // Core assertion: NO "Download Failed" dialog appears after cancelling.
    // Poll for a few seconds to catch the async abort-promise rejection that
    // used to surface the dialog (issue #770).
    const errorDialog = browser.$(Selectors.common.downloadErrorDialog);
    const POLL_MS = 600;
    const WINDOW_MS = 5000;
    const start = Date.now();
    let dialogSeen = false;
    while (Date.now() - start < WINDOW_MS) {
      const visible = await errorDialog.isDisplayed().catch(() => false);
      if (visible) {
        dialogSeen = true;
        break;
      }
      await browser.pause(POLL_MS);
    }

    expect(dialogSeen).toBe(false);

    // The cancel must actually take effect: the cancel button disappears once
    // the download is torn down (card reverts to the idle download state).
    await cancelButton.waitForDisplayed({
      reverse: true,
      timeout: 10000,
    });

    console.log('[download-cancel] PASS — cancel silent, no error dialog');
  });
});
