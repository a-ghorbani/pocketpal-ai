/**
 * In-app purchase: buy, cancel, pending, already owned, unfulfillable,
 * invalid proof and the model step, against the e2e FakeStore and the host
 * mock server (helpers/iapMockServer.ts). No real store purchase happens.
 */

import {expect} from '@wdio/globals';

import {ChatPage} from '../../pages/ChatPage';
import {DrawerPage} from '../../pages/DrawerPage';
import {PalBuyPage} from '../../pages/PalBuyPage';
import {SettingsPage} from '../../pages/SettingsPage';
import {TIMEOUTS} from '../../fixtures/models';
import {byPartialText} from '../../helpers/selectors';
import {saveFailureScreenshot} from '../../helpers/screenshots';
import {
  assertMockTraffic,
  eventsSent,
  iapMockServer,
} from '../../helpers/iapMockServer';
import {
  iapCommand,
  openPalsWith,
  reverseMockPort,
} from '../../helpers/iap-actions';

describe('In-app purchase', () => {
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
    return {pal, products: {[pal.productId]: '4,99 €'}};
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

  it('buys with the store price, unlocks, starts a chat after the model step, and lists the support code in Settings', async () => {
    const {pal, products} = listPal('iap-buy');
    await openPalsWith(openPals, {products});
    await buyPage.openPal(pal.id);

    expect(await buyPage.buyLabel()).toBe('4,99 €');
    await buyPage.buy();

    await buyPage.waitForReady();
    expect(await buyPage.isShown('purchase-support-code', 1000)).toBe(false);
    await buyPage.downloadModel();
    await buyPage.startChat(TIMEOUTS.download);
    await chatPage.waitForReady(TIMEOUTS.appReady);

    await chatPage.openDrawer();
    await drawerPage.navigateToSettings();
    await settingsPage.waitForReady();
    await buyPage.scrollToCard(`purchase-row-${pal.id}`);
    await browser
      .$(byPartialText('Purchased · Support code: E2E-fake-tx-'))
      .waitForDisplayed({timeout: 20000});

    expect(eventsSent(iapMockServer.requests())).toEqual(['buy_tap']);
  });

  it('closes the sheet on cancel and shows Buy again', async () => {
    const {pal, products} = listPal('iap-cancel');
    await openPalsWith(openPals, {products, next: 'cancelled'});
    await buyPage.openPal(pal.id);

    await buyPage.buy();
    await buyPage.waitGone('buy-button');
    await buyPage.openPal(pal.id);
    await buyPage.waitFor('buy-button');

    expect(eventsSent(iapMockServer.requests())).toEqual([
      'buy_tap',
      'purchase_cancelled',
    ]);
  });

  it('shows pending until the payment clears, then unlocks', async () => {
    const {pal, products} = listPal('iap-pending');
    await openPalsWith(openPals, {products, next: 'pending'});
    await buyPage.openPal(pal.id);

    await buyPage.buy();
    await buyPage.waitFor('purchase-pending');
    await buyPage.closeSheet();
    await buyPage.waitForInList('pal-badge-pending');

    await iapCommand('approve_pending');
    await buyPage.waitGone('pal-badge-pending', 60000);
    await buyPage.openPal(pal.id);
    await buyPage.waitFor('owned-button');
  });

  it('restores an already-owned product silently', async () => {
    const {pal, products} = listPal('iap-owned');
    await openPalsWith(openPals, {products, next: 'already_owned'});
    await buyPage.openPal(pal.id);

    await buyPage.buy();
    await buyPage.waitForReady();

    expect(eventsSent(iapMockServer.requests())).toEqual(['buy_tap']);
  });

  it('shows the support reference when the purchase cannot be delivered', async () => {
    const {pal, products} = listPal('iap-unfulfillable');
    iapMockServer.script({verify: ['unfulfillable']});
    await openPalsWith(openPals, {products});
    await buyPage.openPal(pal.id);

    await buyPage.buy();
    await buyPage.waitFor('purchase-unfulfillable', 60000);
    expect(await buyPage.text('purchase-support-code')).toContain(
      'E2E-fake-tx-',
    );
    expect(await buyPage.isShown('buy-button', 1000)).toBe(false);
  });

  it('holds an unverifiable purchase with its support code and no Buy', async () => {
    const {pal, products} = listPal('iap-invalid');
    iapMockServer.script({verify: ['invalid']});
    await openPalsWith(openPals, {products});
    await buyPage.openPal(pal.id);

    await buyPage.buy();
    expect(await buyPage.text('purchase-held-invalid', 60000)).toBe(
      "We couldn't unlock this purchase. Contact support with this code.",
    );
    expect(await buyPage.text('purchase-support-code')).toContain(
      'Support code: E2E-fake-tx-',
    );
    expect(await buyPage.isShown('buy-button', 1000)).toBe(false);

    expect(eventsSent(iapMockServer.requests())).toEqual([
      'buy_tap',
      'purchase_error',
    ]);
  });

  it('shows no Buy and no error when billing is unavailable', async () => {
    const {pal, products} = listPal('iap-no-billing');
    await openPalsWith(openPals, {products, unavailable: true});
    await buyPage.openPal(pal.id);

    expect(await buyPage.isShown('buy-button', 3000)).toBe(false);
    expect(await buyPage.isShown('restore-purchases-row', 1000)).toBe(false);
  });
});
