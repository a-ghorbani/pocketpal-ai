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
 * Flow: download a default model straight from the Models screen and cancel on
 * the same card. Download + cancel happen on one card with no navigation, so
 * the in-progress window is caught reliably, and the card's cancel control is a
 * Paper Button that resolves on both platforms.
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
import {Selectors} from '../../helpers/selectors';
import {TIMEOUTS} from '../../fixtures/models';
import {SCREENSHOT_DIR} from '../../wdio.shared.conf';

declare const driver: WebdriverIO.Browser;
declare const browser: WebdriverIO.Browser;

// A default model on the Models screen (device-rule-resolved list, PR #772),
// large enough that the download stays in progress through the cancel tap.
// Gemma 3 1B (0.81 GB) downloads too fast on the Android emulator to catch the
// in-progress window, so use Gemma 3 4B (~2.4 GB). The quant filename differs
// per platform (iOS Q4_K_M / Android Q4_0), so resolve it at runtime inside the
// test where `driver` is ready — see TARGET_FILE in the spec body.
// Default "Available to Download" group is collapsed on first load; its
// accordion testID uses the localized display name.
const AVAILABLE_GROUP = 'Available to Download';

describe('Download cancel', () => {
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

  it('stopping an in-progress download shows no error dialog', async () => {
    // Gemma 3 1B (~0.81 GB) — present in every device tier on both platforms
    // with an identical filename (pinned to Q4_K_M in rules.{ios,android}.json),
    // and small enough to fit a normally-provisioned emulator's storage. The
    // download must stay in progress through the cancel tap, so the device
    // needs enough free space to actually start fetching it: a storage-starved
    // emulator disables the Download button ("Storage low!") and this times out
    // at the cancel control — free device storage if that happens.
    const TARGET_FILE = 'gemma-3-1b-it-Q4_K_M.gguf';

    // Navigate to the Models screen
    await chatPage.openDrawer();
    await drawerPage.waitForOpen();
    await drawerPage.navigateToModels();
    await modelsPage.waitForReady();

    // Expand the "Available to Download" group (collapsed by default) to reveal
    // the bundled default models.
    const accordion = browser.$(
      Selectors.models.modelAccordion(AVAILABLE_GROUP),
    );
    await accordion.waitForDisplayed({timeout: 10000});
    await accordion.click();

    // Locate the target model card and start its download.
    const cardContainer = browser.$(
      Selectors.modelCard.cardContainer(TARGET_FILE),
    );
    await cardContainer.waitForDisplayed({timeout: 10000});
    const downloadButton = cardContainer.$(
      Selectors.modelCard.downloadButtonElement,
    );
    await downloadButton.waitForDisplayed({timeout: 10000});
    await downloadButton.click();

    // Download started → the same card swaps its download button for a cancel
    // button. Scope to the card and the Button class so we target the clickable
    // control, not the surrounding "cancel-button-container" wrapper.
    const cancelButton = cardContainer.$(
      Selectors.modelCard.cancelButtonElement,
    );
    await cancelButton.waitForDisplayed({timeout: 15000});
    console.log('[download-cancel] download in progress, tapping cancel');

    // Tap Stop/Cancel — the user-initiated cancellation under test.
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

    // The cancel must actually take effect: the card reverts to the idle
    // download state, so the cancel control goes away. Re-query from the root
    // each poll (a chained element would hold a stale handle once the card
    // re-renders) and assert no cancel control remains anywhere.
    await browser
      .$(Selectors.modelCard.cancelButton)
      .waitForExist({reverse: true, timeout: 15000});

    console.log('[download-cancel] PASS — cancel silent, no error dialog');
  });
});
