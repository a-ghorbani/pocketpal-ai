/**
 * PalsHub authenticated purchase flow (iOS + US Android).
 *
 * Drives the real create-session -> in-app browser (ASWebAuthenticationSession
 * on iOS, Chrome Custom Tab on Android) -> success return -> reconcile loop
 * against the palshub e2e test harness, which returns a deterministic
 * test-complete checkout (no Stripe / Google Pay / Apple Pay UI). The server
 * helpers run from the test host to seed a clean pre-purchase state each run.
 *
 * On Android, Buy now starts checkout directly: the store runs the Play
 * external-content-links prep (eligibility -> token -> launchExternalLink),
 * where Google Play renders its own disclosure. That dialog is Google UI, not
 * an app surface, so it is not automatable; an un-enrolled program may also
 * return ineligible/error in the emulator (no Active enrollment / no wallet),
 * in which case Buy never reaches the Custom Tab. The runner records the
 * observed emulator behaviour honestly rather than forcing a 'launched' path.
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

    // Buy (logged out) -> sign in -> Buy again starts checkout. On Android the
    // store runs the Play link-out prep; Play renders its own disclosure (not
    // automatable). On iOS there is no prep.
    await purchasePage.signInAndStartCheckout(
      palshubTestConfig.email,
      palshubTestConfig.password,
    );
    await purchasePage.acceptAuthConsentIfPresent();

    // test-complete grants ownership; reconcile flips Buy -> Download. On
    // Android this only reaches the Custom Tab when the program prep returns
    // 'launched'; if the emulator's Play services report the un-enrolled
    // program ineligible, the runner records that (the prep short-circuits).
    await purchasePage.waitForDownloadButton();
  });

  it('settles the checkout after backing out of the Android Custom Tab (never wedges in browser_open)', async function (this: Mocha.Context) {
    if (!driver.isAndroid) {
      this.skip();
      return;
    }

    await chatPage.openDrawer();
    await drawerPage.navigateToPals();
    await purchasePage.openPalDetail(palshubTestConfig.palId);

    // Start checkout up to the Custom Tab, then dismiss it with hardware BACK.
    // The native auth-session settles the openAuth promise on the single
    // post-launch resume (a back-out is a silent cancel). The store must reach
    // a terminal state -- Download (the test-complete grant landed) OR Buy
    // re-enabled (the dismiss won) -- and must NOT stay stuck in browser_open
    // with a disabled Buy and no Download. A wedged promise (the pre-fix bug)
    // would leave neither terminal control reachable.
    await purchasePage.signInAndStartCheckout(
      palshubTestConfig.email,
      palshubTestConfig.password,
    );
    await purchasePage.backOutOfCustomTabWhenItOpens();

    const settled = await purchasePage.waitForCheckoutSettled();

    // Whichever branch we landed in, a fresh Buy press must work -- the
    // auth-in-flight guard must not wedge retries.
    if (settled === 'buy') {
      await purchasePage.tapBuy();
      await purchasePage.waitForCheckoutSettled();
    }
  });
});
