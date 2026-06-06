/**
 * PalsHub authenticated purchase flow (iOS).
 *
 * Drives the real create-session -> ASWebAuthenticationSession -> success
 * return -> reconcile loop against the palshub e2e test harness, which returns
 * a deterministic test-complete checkout (no Stripe / Apple Pay UI). The server
 * helpers run from the test host to seed a clean pre-purchase state each run.
 *
 * Requires an E2E build (E2E_BUILD=true) pointed at the test server, and these
 * env vars (see e2e/helpers/palshubTestApi.ts):
 *   E2E_PALSHUB_BASE_URL, E2E_API_KEY, E2E_BUYER_EMAIL, E2E_BUYER_PASSWORD,
 *   E2E_PALSHUB_PAL_ID
 */

import * as fs from 'fs';
import * as path from 'path';

import {ChatPage} from '../../pages/ChatPage';
import {DrawerPage} from '../../pages/DrawerPage';
import {PalPurchasePage} from '../../pages/PalPurchasePage';
import {TIMEOUTS} from '../../fixtures/models';
import {
  ensureTestUser,
  resetPalOwnership,
  palshubTestConfig,
} from '../../helpers/palshubTestApi';
import {SCREENSHOT_DIR} from '../../wdio.shared.conf';

declare const driver: WebdriverIO.Browser;
declare const browser: WebdriverIO.Browser;

describe('PalsHub authenticated purchase (iOS)', () => {
  let chatPage: ChatPage;
  let drawerPage: DrawerPage;
  let purchasePage: PalPurchasePage;

  before(async () => {
    chatPage = new ChatPage();
    drawerPage = new DrawerPage();
    purchasePage = new PalPurchasePage();
    await chatPage.waitForReady(TIMEOUTS.appReady);
  });

  beforeEach(async () => {
    // Clean slate on the server so the pal is unowned and the Buy button shows.
    await ensureTestUser();
    await resetPalOwnership();
  });

  afterEach(async function (this: Mocha.Context) {
    if (this.currentTest?.state === 'failed') {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const name = this.currentTest.title.replace(/\s+/g, '-');
      try {
        if (!fs.existsSync(SCREENSHOT_DIR)) {
          fs.mkdirSync(SCREENSHOT_DIR, {recursive: true});
        }
        await driver.saveScreenshot(
          path.join(SCREENSHOT_DIR, `failure-${name}-${stamp}.png`),
        );
      } catch (e) {
        console.error('Failed to capture screenshot:', (e as Error).message);
      }
    }
  });

  it('completes checkout and flips Buy to Download', async () => {
    await chatPage.openDrawer();
    await drawerPage.navigateToPals();

    await purchasePage.openPalDetail(palshubTestConfig.palId);

    // Buy (logged out) -> sign in -> Buy again starts checkout.
    await purchasePage.signInAndStartCheckout(
      palshubTestConfig.email,
      palshubTestConfig.password,
    );
    await purchasePage.acceptAuthConsentIfPresent();

    // test-complete grants ownership; reconcile flips Buy -> Download.
    await purchasePage.waitForDownloadButton();
  });
});
