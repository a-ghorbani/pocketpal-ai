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
 * Flow: start whichever default model the device offers (the Models list is
 * device-rule-driven, so no filename is pinned) and cancel it on the Models
 * screen with no navigation, so the in-progress window is caught reliably. The
 * cancel control is a Paper Button that resolves on both platforms.
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

// The "Available to Download" group is collapsed on first load; its accordion
// testID uses the localized display name. Which models the group contains is
// device-rule-driven (#772) and varies by platform and device tier, so the test
// does NOT pin a model filename — it starts whichever model the device actually
// offers (see the spec body).
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
    await browser.pause(500);

    // Start the first model whose download actually begins, rather than pinning
    // a filename (the device-rule list varies by platform/tier — #772). Cards
    // are listed largest-first, so this naturally picks the biggest model that
    // fits the device's free storage, giving the longest in-progress window to
    // cancel. A storage-starved device disables every Download button ("Storage
    // low!"); those taps no-op, so we fall through to a smaller one. Only a real
    // download swaps the Download control for a Cancel control.
    const cancelButton = browser.$(Selectors.modelCard.anyCancelButton);
    const downloadButtons = await browser.$$(
      Selectors.modelCard.anyDownloadButton,
    );
    let started = false;
    for (const downloadButton of downloadButtons) {
      if (!(await downloadButton.isDisplayed().catch(() => false))) {
        continue;
      }
      await downloadButton.click().catch(() => {});
      started = await cancelButton
        .waitForDisplayed({timeout: 8000})
        .then(() => true)
        .catch(() => false);
      if (started) {
        break;
      }
    }
    // Nothing started → no listed model fits the device's free storage.
    expect(started).toBe(true);
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
