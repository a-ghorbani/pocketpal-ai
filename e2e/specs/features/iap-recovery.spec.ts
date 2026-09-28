/**
 * In-app purchase recovery: kill during verify, verify offline across a
 * restart, refund removal, opt-in creator updates (applied and declined),
 * withdrawal, tombstones and a declined pending payment, against the e2e
 * FakeStore and the host mock server.
 */

import {expect} from '@wdio/globals';

import {ChatPage} from '../../pages/ChatPage';
import {DrawerPage} from '../../pages/DrawerPage';
import {PalBuyPage} from '../../pages/PalBuyPage';
import {SettingsPage} from '../../pages/SettingsPage';
import {TIMEOUTS} from '../../fixtures/models';
import {Gestures} from '../../helpers/gestures';
import {withinTestIdPrefix} from '../../helpers/selectors';
import {saveFailureScreenshot} from '../../helpers/screenshots';
import {assertMockTraffic, iapMockServer} from '../../helpers/iapMockServer';
import {
  appId,
  iapCommand,
  mockBase,
  openPalsWith,
  relaunchApp,
  reverseMockPort,
} from '../../helpers/iap-actions';

declare const driver: WebdriverIO.Browser;
declare const browser: WebdriverIO.Browser;

describe('In-app purchase recovery', () => {
  const chatPage = new ChatPage();
  const drawerPage = new DrawerPage();
  const buyPage = new PalBuyPage();
  const settingsPage = new SettingsPage();

  const openPals = async () => {
    await chatPage.waitForReady(TIMEOUTS.appReady);
    await chatPage.openDrawer();
    await drawerPage.navigateToPals();
  };

  const listPal = (id: string) => {
    const pal = iapMockServer.addPal(id);
    return {pal, products: {[pal.productId]: '$4.99'}};
  };

  const verifyCount = () =>
    iapMockServer
      .requests()
      .filter(request => request.path === '/api/mobile/iap/verify').length;

  const localCardTitled = (title: string) =>
    browser.$(withinTestIdPrefix('local-pal-card-', title));

  const waitForLocalTitle = async (title: string, timeout = 30000) => {
    await Gestures.scrollToElement(
      withinTestIdPrefix('local-pal-card-', title),
      8,
    );
    await localCardTitled(title).waitForDisplayed({timeout});
  };

  const rowSays = (palId: string, text: string) =>
    driver.isAndroid
      ? `//*[@resource-id="purchase-row-${palId}"]//*[contains(@text, "${text}")]`
      : `-ios predicate string:label CONTAINS "${text}"`;

  const buyWithPendingUpdate = async (id: string, title: string) => {
    const {pal, products} = listPal(id);
    await openPalsWith(openPals, {products});
    await buyToOwned(pal.id);
    iapMockServer.updatePal(pal.id, {title, contentVersion: 2});
    await relaunchApp();
    await openPals();
    await waitForLocalTitle(pal.title);
    return pal;
  };

  const buyToOwned = async (palId: string) => {
    await buyPage.openPal(palId);
    await buyPage.buy();
    await buyPage.waitFor('purchase-ready', 60000);
    await buyPage.closeSheet();
  };

  before(async () => {
    await iapMockServer.start();
    reverseMockPort();
  });

  after(async () => {
    await iapMockServer.stop();
  });

  beforeEach(() => {
    iapMockServer.reset();
  });

  afterEach(async function (this: Mocha.Context) {
    if (this.currentTest?.state === 'failed') {
      await saveFailureScreenshot(this.currentTest.title);
    }
    expect(assertMockTraffic(iapMockServer.requests())).toEqual([]);
  });

  it('installs a paid Pal after the app is killed during verify', async () => {
    const {pal, products} = listPal('iap-kill');
    await openPalsWith(openPals, {products});
    await buyPage.openPal(pal.id);

    iapMockServer.holdVerify();
    await buyPage.buy();
    await buyPage.waitFor('purchase-unlocking', 60000);
    await driver.terminateApp(appId());
    await browser.pause(800);
    await driver.activateApp(appId());
    await iapCommand(`api::${mockBase()}`);
    iapMockServer.release();

    await openPals();
    await buyPage.openPal(pal.id);
    await buyPage.waitFor('owned-button', 60000);
  });

  it('keeps Paid — unlocking across a restart while offline, then unlocks', async () => {
    const {pal, products} = listPal('iap-offline');
    iapMockServer.script({offline: true});
    await openPalsWith(openPals, {products});
    await buyPage.openPal(pal.id);

    await buyPage.buy();
    await buyPage.waitFor('purchase-unlocking', 60000);
    await buyPage.tapRetry();
    await buyPage.waitFor('purchase-unlocking');
    await buyPage.closeSheet();
    await buyPage.waitForInList('pal-badge-unlocking');

    await relaunchApp();
    await openPals();
    await buyPage.waitForInList('pal-badge-unlocking', 30000);

    iapMockServer.script({offline: false});
    await buyPage.openPal(pal.id);
    await buyPage.tapRetry();
    await buyPage.waitFor('owned-button', 60000);
  });

  it('removes a refunded Pal on the next online launch and never re-verifies it', async () => {
    const {pal, products} = listPal('iap-refund');
    await openPalsWith(openPals, {products});
    await buyToOwned(pal.id);

    await iapCommand(`refund::${pal.productId}`);
    iapMockServer.refund(pal.id);
    await relaunchApp();
    await openPals();
    await buyPage.openPal(pal.id);

    expect(await buyPage.isShown('owned-button', 5000)).toBe(false);
    expect(await buyPage.isShown('buy-button', 1000)).toBe(false);

    const before = verifyCount();
    await relaunchApp();
    await openPals();
    await browser.pause(3000);
    expect(verifyCount()).toBe(before);
  });

  it('applies a creator update only after the user confirms it', async () => {
    await buyWithPendingUpdate('iap-update', 'E2E Updated Pal');

    await buyPage.tapUpdateBadge();
    await buyPage.tapUpdate();
    await buyPage.confirmUpdate();
    await buyPage.waitGone('pal-update-prompt');
    await buyPage.closeSheet();
    await waitForLocalTitle('E2E Updated Pal');

    await relaunchApp();
    await openPals();
    await waitForLocalTitle('E2E Updated Pal');
    expect(await buyPage.anyUpdateBadgeInList()).toBe(false);
  });

  it('keeps the installed version working when the user declines the update', async () => {
    const pal = await buyWithPendingUpdate('iap-decline', 'E2E Declined Pal');

    await buyPage.tapUpdateBadge();
    await buyPage.tapUpdate();
    await buyPage.cancelUpdate();
    await buyPage.waitFor('pal-update-prompt');
    await buyPage.closeSheet();

    await relaunchApp();
    await openPals();
    await waitForLocalTitle(pal.title);
    expect(await buyPage.hasUpdateBadge(30000)).toBe(true);
    expect(await localCardTitled('E2E Declined Pal').isDisplayed()).toBe(false);

    await buyPage.tapUpdateBadge();
    await buyPage.tapOwned();
    if (await buyPage.isShown('model-step-download', 5000)) {
      await buyPage.downloadModel();
    }
    await buyPage.waitFor('model-step-start-chat', 300000);
  });

  it('removes a withdrawn Pal and keeps its support code in Settings', async () => {
    const {pal, products} = listPal('iap-withdraw');
    await openPalsWith(openPals, {products});
    await buyToOwned(pal.id);
    await waitForLocalTitle(pal.title);

    iapMockServer.withdraw(pal.id);
    await relaunchApp();
    await openPals();
    await localCardTitled(pal.title).waitForDisplayed({
      timeout: 30000,
      reverse: true,
    });

    await relaunchApp();
    await chatPage.waitForReady(TIMEOUTS.appReady);
    await chatPage.openDrawer();
    await drawerPage.navigateToSettings();
    await settingsPage.waitForReady();
    await buyPage.scrollToCard(`purchase-row-${pal.id}`);
    await browser
      .$(
        rowSays(
          pal.id,
          driver.isAndroid
            ? 'This Pal was withdrawn. Your purchase is being refunded to your Google Play account.'
            : 'This Pal is no longer available.',
        ),
      )
      .waitForDisplayed({timeout: 20000});
    await browser
      .$(rowSays(pal.id, 'Support code: E2E-'))
      .waitForDisplayed({timeout: 5000});
  });

  it('shows the withdrawn note when verify reports the purchase removed', async () => {
    const {pal, products} = listPal('iap-withdrawn-verify');
    iapMockServer.script({verify: ['removed']});
    await openPalsWith(openPals, {products});
    await buyPage.openPal(pal.id);

    await buyPage.buy();
    expect(await buyPage.text('purchase-unfulfillable', 60000)).toBe(
      driver.isAndroid
        ? "This purchase couldn't be completed. Google will refund it automatically within 3 days."
        : 'This Pal is no longer available. Request a refund from Apple at reportaproblem.apple.com.',
    );
    expect(await buyPage.text('purchase-support-code')).toContain(
      'Support code: E2E-',
    );
    expect(await buyPage.isShown('buy-button', 1000)).toBe(false);
  });

  it('returns Buy after a declined pending payment', async () => {
    const {pal, products} = listPal('iap-declined');
    await openPalsWith(openPals, {products, next: 'pending'});
    await buyPage.openPal(pal.id);
    await buyPage.buy();
    await buyPage.waitFor('purchase-pending');
    await buyPage.closeSheet();

    await iapCommand('decline_pending');
    if (driver.isAndroid) {
      await relaunchApp();
      await openPals();
    } else {
      await buyPage.restoreFromList();
    }
    await buyPage.waitGone('pal-badge-pending', 30000);
    await buyPage.openPal(pal.id);
    await buyPage.waitFor('buy-button');
  });
});
