/**
 * PalsHub authenticated purchase flow (iOS + US Android).
 *
 * Drives the real create-session -> in-app browser (ASWebAuthenticationSession
 * on iOS, Chrome Custom Tab on Android) -> success return -> reconcile loop
 * against the palshub e2e test harness, which returns a deterministic
 * test-complete checkout (no Stripe / Google Pay / Apple Pay UI). The server
 * helpers run from the test host to seed a clean pre-purchase state each run.
 *
 * Android shows a required pre-purchase disclosure gate before the Custom Tab;
 * reaching it proves the buy press routed into the in-app flow (the native
 * auth-session module is registered, not a silent dead-end).
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

const getAppBundleId = (): string =>
  driver.isAndroid ? 'com.pocketpalai.e2e' : 'ai.pocketpal';

describe('PalsHub authenticated purchase', () => {
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
    // Relaunch to a clean Chat screen so a prior test's open sheet/tab doesn't
    // leak into this one (each test navigates drawer -> Pals from scratch).
    await driver.terminateApp(getAppBundleId());
    await browser.pause(800);
    await driver.activateApp(getAppBundleId());
    await chatPage.waitForReady(TIMEOUTS.appReady);
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
    // Android: consent the pre-purchase disclosure gate (no-op on iOS).
    await purchasePage.acceptDisclosureIfPresent();
    await purchasePage.acceptAuthConsentIfPresent();

    // test-complete grants ownership; reconcile flips Buy -> Download.
    await purchasePage.waitForDownloadButton();
  });

  it('does not start checkout when the Android disclosure is declined', async function (this: Mocha.Context) {
    if (!driver.isAndroid) {
      this.skip();
      return;
    }

    await chatPage.openDrawer();
    await drawerPage.navigateToPals();
    await purchasePage.openPalDetail(palshubTestConfig.palId);

    await purchasePage.signInAndStartCheckout(
      palshubTestConfig.email,
      palshubTestConfig.password,
    );
    // Decline the gate: no Custom Tab, no checkout, the Buy button remains.
    await purchasePage.declineDisclosure();
    await purchasePage.tapBuy();
    await purchasePage.acceptDisclosureIfPresent();
  });
});
