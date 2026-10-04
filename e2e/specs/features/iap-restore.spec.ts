/**
 * In-app purchase restore and account: a fresh install recovers store
 * entitlements silently, Restore purchases uses the store sync, and a
 * signed-out purchase offers no account-link prompt while account linking is
 * off.
 */

import {expect} from '@wdio/globals';

import {ChatPage} from '../../pages/ChatPage';
import {DrawerPage} from '../../pages/DrawerPage';
import {PalBuyPage} from '../../pages/PalBuyPage';
import {TIMEOUTS} from '../../fixtures/models';
import {saveFailureScreenshot} from '../../helpers/screenshots';
import {assertMockTraffic, iapMockServer} from '../../helpers/iapMockServer';
import {
  iapCommand,
  openPalsWith,
  reverseMockPort,
} from '../../helpers/iap-actions';

describe('In-app purchase restore', () => {
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
    return {pal, products: {[pal.productId]: '£3.99'}};
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

  it('installs store entitlements on launch without a store sync', async () => {
    const {pal, products} = listPal('iap-fresh');
    await openPalsWith(openPals, {
      products,
      before: [`entitle::${pal.productId}`],
    });

    await buyPage.openPal(pal.id);
    await buyPage.waitFor('owned-button', 60000);
    expect(JSON.parse((await iapCommand('read')) || '{}').syncCount ?? 0).toBe(
      0,
    );
  });

  it('restores through the Restore purchases row', async () => {
    const {pal, products} = listPal('iap-restore-row');
    await openPalsWith(openPals, {products});
    await iapCommand(`entitle::${pal.productId}`);

    await buyPage.restoreFromList();
    await buyPage.openPal(pal.id);
    await buyPage.waitFor('owned-button', 60000);
  });

  it('shows no sign-in prompt after a signed-out purchase', async () => {
    const {pal, products} = listPal('iap-prompt');
    await openPalsWith(openPals, {products});
    await buyPage.openPal(pal.id);
    await buyPage.buy();
    await buyPage.waitForReady();
    expect(await buyPage.isShown('purchase-link-prompt', 1000)).toBe(false);
  });
});
