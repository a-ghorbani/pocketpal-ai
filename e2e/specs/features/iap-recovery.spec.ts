/**
 * In-app purchase recovery: kill during verify, verify offline across a
 * restart, refund removal, creator content update, tombstones and a declined
 * pending payment, against the e2e FakeStore and the host mock server.
 */

import {expect} from '@wdio/globals';

import {ChatPage} from '../../pages/ChatPage';
import {DrawerPage} from '../../pages/DrawerPage';
import {PalBuyPage} from '../../pages/PalBuyPage';
import {TIMEOUTS} from '../../fixtures/models';
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

  it('applies a creator update to an installed Pal', async () => {
    const {pal, products} = listPal('iap-update');
    await openPalsWith(openPals, {products});
    await buyToOwned(pal.id);

    iapMockServer.updatePal(pal.id, {
      title: 'E2E Updated Pal',
      contentVersion: 2,
    });
    await relaunchApp();
    await openPals();

    await buyPage.scrollToCard('local-pal-card-');
    await browser
      .$(withinTestIdPrefix('local-pal-card-', 'E2E Updated Pal'))
      .waitForDisplayed({timeout: 30000});
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
