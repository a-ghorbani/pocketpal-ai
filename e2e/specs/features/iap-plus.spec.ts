/**
 * PocketPal Plus: buy from the sidebar entry, pending, cancel, error,
 * restore after reinstall, refund, unavailable billing, closing back to
 * where the user was, and a locked feature that opens after purchase,
 * against the e2e FakeStore. Plus is store-only, so PalsHub (the host mock)
 * must see no Plus traffic.
 *
 * Hands-free voice ships, so Plus UI is always present; the setups still
 * pass plus_ship, which can only add shipped features. The locked voice
 * button reaches Plus through the voice teaser.
 */

import {expect} from '@wdio/globals';

import {ChatPage} from '../../pages/ChatPage';
import {DrawerPage} from '../../pages/DrawerPage';
import {ModelsPage} from '../../pages/ModelsPage';
import {PlusPage} from '../../pages/PlusPage';
import {TIMEOUTS} from '../../fixtures/models';
import {byExactTestId, byTestId, Selectors} from '../../helpers/selectors';
import {saveFailureScreenshot} from '../../helpers/screenshots';
import {withBridgeElements} from '../../helpers/automation-bridge';
import {assertMockTraffic, iapMockServer} from '../../helpers/iapMockServer';
import type {RecordedRequest} from '../../helpers/iapMockServer';
import {
  ANDROID_PACKAGE,
  IOS_BUNDLE_ID,
  PLUS_PRODUCTS,
  configureFakeStore,
  iapCommand,
  openPlusWith,
  reinstallApp,
  relaunchApp,
  reverseMockPort,
} from '../../helpers/iap-actions';

declare const browser: WebdriverIO.Browser;
declare const driver: WebdriverIO.Browser;

const PLUS_FEATURE_URL = 'pocketpal://e2e/plus-feature';

const plusTraffic = (requests: RecordedRequest[]): string[] =>
  requests
    .filter(
      request =>
        request.path.endsWith('/event') ||
        ((request.path.endsWith('/iap/verify') ||
          request.path.endsWith('/iap/entitlements/refresh')) &&
          JSON.stringify(request.body ?? {}).includes('plus.')),
    )
    .map(request => `${request.method} ${request.path}`);

const openDeepLink = async (url: string): Promise<void> => {
  await driver.execute(
    'mobile: deepLink',
    driver.isAndroid
      ? {url, package: ANDROID_PACKAGE}
      : {url, bundleId: IOS_BUNDLE_ID},
  );
};

const voiceCommand = async (command: string): Promise<void> => {
  if (driver.isAndroid) {
    await withBridgeElements(async () => {
      const input = await driver.$(byTestId('voice-command-input'));
      await input.waitForExist({timeout: 15000});
      await input.setValue(command);
    });
  } else {
    await openDeepLink(`pocketpal://voice?cmd=${encodeURIComponent(command)}`);
  }
  await driver.pause(400);
};

describe('PocketPal Plus', () => {
  const chatPage = new ChatPage();
  const drawerPage = new DrawerPage();
  const modelsPage = new ModelsPage();
  const plus = new PlusPage();

  const openDrawer = async () => {
    await chatPage.waitForReady(TIMEOUTS.appReady);
    await chatPage.openDrawer();
    await drawerPage.waitForOpen();
  };

  const openPlus = async () => {
    await openDrawer();
    await plus.openFromDrawer();
  };

  before(async () => {
    await iapMockServer.start();
    reverseMockPort();
  });

  after(async () => {
    await iapCommand('plus_ship::none').catch(() => '');
    await iapMockServer.stop();
  });

  beforeEach(() => {
    iapMockServer.reset();
  });

  afterEach(async function (this: Mocha.Context) {
    if (this.currentTest?.state === 'failed') {
      await saveFailureScreenshot(this.currentTest.title);
    }
    const requests = iapMockServer.requests();
    expect(assertMockTraffic(requests)).toEqual([]);
    expect(plusTraffic(requests)).toEqual([]);
  });

  it('buys Plus from the sidebar, thanks the user and fills the sidebar entry', async () => {
    await openPlusWith(openPlus);

    expect(await plus.isShown('plus-licence', 2000)).toBe(driver.isIOS);
    expect(await plus.ctaLabel()).toBe('Choose an amount');
    expect(await plus.ctaEnabled()).toBe(false);
    await plus.selectTile('plus.1');
    expect(await plus.ctaLabel()).toBe('Get Plus · $4.99');
    expect(await plus.ctaEnabled()).toBe(true);
    await plus.buy();
    await plus.waitForPurchased();
    await plus.done();

    await chatPage.openDrawer();
    expect(await plus.sidebarSubtitle()).toBe('Unlocked');

    await drawerPage.navigateToPals();
    await browser.waitUntil(
      async () =>
        iapMockServer
          .requests()
          .some(
            request =>
              request.method === 'GET' && request.path === '/api/mobile/pals',
          ),
      {timeout: 30000, timeoutMsg: 'the app never reached the host mock'},
    );
  });

  it('shows pending, then unlocks when the store approves with the screen open', async () => {
    await openPlusWith(openPlus, {next: 'pending'});

    await plus.selectTile('plus.1');
    await plus.buy();
    await plus.waitFor('plus-pending-notice');
    expect(await plus.ctaLabel()).toBe('Pending');

    await iapCommand('approve_pending::plus.1');
    await plus.waitForPurchased();
  });

  it('keeps pending across a relaunch on Android only', async () => {
    await openPlusWith(openPlus, {next: 'pending'});
    await plus.selectTile('plus.1');
    await plus.buy();
    await plus.waitFor('plus-pending-notice');

    await relaunchApp();
    await openPlus();

    if (driver.isAndroid) {
      await plus.waitFor('plus-pending-notice');
    } else {
      expect(await plus.ctaLabel()).toBe('Choose an amount');
    }
  });

  it('iOS: clears pending on Restore', async function (this: Mocha.Context) {
    if (driver.isAndroid) {
      this.skip();
    }
    await openPlusWith(openPlus, {next: 'pending'});
    await plus.selectTile('plus.1');
    await plus.buy();
    await plus.waitFor('plus-pending-notice');

    await plus.restore();

    await plus.waitGone('plus-pending-notice', 30000);
    expect(await plus.ctaLabel()).toBe('Get Plus · $4.99');
  });

  it('returns quietly to the same price on cancel', async () => {
    await openPlusWith(openPlus, {next: 'cancelled'});

    await plus.selectTile('plus.2');
    await plus.buy();

    await browser.waitUntil(
      async () => (await plus.ctaLabel()) === 'Get Plus · $9.99',
      {timeout: 20000, timeoutMsg: 'the price button never came back'},
    );
    expect(await plus.isShown('plus-error-line', 1000)).toBe(false);
  });

  it('shows an inline error and buys on retry', async () => {
    await openPlusWith(openPlus, {next: 'error:service-error'});

    await plus.selectTile('plus.1');
    await plus.buy();
    expect(await plus.text('plus-error-line')).toBe(
      "The purchase didn't go through. Try again.",
    );

    await plus.buy();
    await plus.waitForPurchased();
  });

  it('restores any tier silently after a reinstall', async () => {
    await reinstallApp();
    await iapCommand(`plus_ship::handsFreeVoice`);
    await configureFakeStore({products: PLUS_PRODUCTS});
    await iapCommand('entitle::plus.3');
    await relaunchApp();

    await openDrawer();
    expect(await plus.sidebarSubtitle(60000)).toBe('Unlocked');
    await plus.openFromDrawer();
    await plus.waitForPurchased();
  });

  it('says so when Restore finds no Plus purchase after a reinstall', async () => {
    await reinstallApp();
    await iapCommand(`plus_ship::handsFreeVoice`);
    await configureFakeStore({products: PLUS_PRODUCTS});
    await relaunchApp();
    await openPlus();

    await plus.restore();

    expect(await plus.restoreNote()).toBe('No Plus purchase found.');
    expect(await plus.ctaLabel()).toBe('Choose an amount');
  });

  it('locks Plus again after a refund', async () => {
    await openPlusWith(openDrawer, {before: ['entitle::plus.1']});
    expect(await plus.sidebarSubtitle(60000)).toBe('Unlocked');

    await iapCommand('refund::plus.1');
    await relaunchApp();
    await openPlus();

    expect(await plus.ctaLabel(60000)).toBe('Choose an amount');
  });

  it('returns to the price grid when a refund lands while the screen is open', async () => {
    await openPlusWith(openPlus, {before: ['entitle::plus.1']});
    await plus.waitForPurchased(60000);

    await iapCommand('refund::plus.1');
    await driver.background(2);

    await plus.waitFor('plus-cta', 60000);
    expect(await plus.ctaLabel()).toBe('Choose an amount');
  });

  it('shows unavailable billing and keeps Restore reachable', async () => {
    await openPlusWith(openPlus, {unavailable: true});

    await plus.waitFor('plus-unavailable-notice', 60000);
    expect(await plus.isShown('plus-cta', 1000)).toBe(false);

    await plus.restore();
    expect(await plus.restoreNote()).toBe(
      "Couldn't reach the store. Try again.",
    );
  });

  it('closes back to the screen it was opened from, with the drawer closed', async () => {
    await openPlusWith(openDrawer);
    await drawerPage.navigateToModels();
    await modelsPage.waitForReady();

    await modelsPage.openDrawer();
    await plus.openFromDrawer();
    await plus.close();
    expect(await modelsPage.isDisplayed()).toBe(true);
    expect(await drawerPage.isOpen()).toBe(false);

    if (driver.isAndroid) {
      await modelsPage.openDrawer();
      await plus.openFromDrawer();
      await driver.back();
      await plus.waitGone('plus-close');
      expect(await modelsPage.isDisplayed()).toBe(true);
      expect(await drawerPage.isOpen()).toBe(false);
    }
  });

  it('opens a locked feature after buying Plus from it', async () => {
    await openPlusWith(async () => {
      await chatPage.waitForReady(TIMEOUTS.appReady);
    });
    await openDeepLink(PLUS_FEATURE_URL);

    await plus.waitFor('plus-test-feature-open');
    await browser.$(byExactTestId('plus-test-feature-open')).click();
    await plus.waitForScreen();
    await plus.selectTile('plus.1');
    await plus.buy();
    await plus.waitForPurchased();
    await plus.done();

    await plus.waitFor('plus-test-feature-unlocked');
  });

  it('shows the voice teaser before Plus from the locked voice button', async () => {
    await openPlusWith(async () => {
      await chatPage.waitForReady(TIMEOUTS.appReady);
    });
    await voiceCommand('gate::on');
    await voiceCommand('unlock::plus');
    const shown = (selector: string) => browser.$(selector).isDisplayed();
    const entryContinued = async () =>
      (await shown(byExactTestId('voice-setup-continue'))) ||
      (await shown(byExactTestId('voice-view'))) ||
      (await shown(byExactTestId('chat-pal-model-picker-tab-models')));
    expect(await entryContinued()).toBe(false);
    const tapVoice = async () => {
      await browser.$(byExactTestId('voice-mode-button')).click();
      await plus.waitFor('voice-teaser-keep-typing');
    };

    await tapVoice();
    expect(await plus.isShown('plus-close', 500)).toBe(false);
    await browser.$(byExactTestId('voice-teaser-keep-typing')).click();
    await plus.waitGone('voice-teaser-keep-typing');

    await tapVoice();
    await browser.$(byExactTestId('voice-teaser-get-plus')).click();
    await plus.waitForScreen();
    await plus.selectTile('plus.1');
    await plus.buy();
    await plus.waitForPurchased();
    await plus.done();

    await browser.waitUntil(entryContinued, {timeout: 20000});
    expect(await plus.isShown('voice-teaser-keep-typing', 500)).toBe(false);
    expect(await plus.isShown('voice-mode-lock', 1000)).toBe(false);
  });

  it('shows the Plus entry and screen with no override, since hands-free voice ships', async () => {
    await openPlusWith(openDrawer, {ship: 'none'});

    await browser
      .$(Selectors.drawer.settingsTab)
      .waitForDisplayed({timeout: 20000});
    expect(await plus.hasSidebarEntry(5000)).toBe(true);

    await drawerPage.navigateToChat();
    await openDeepLink(PLUS_FEATURE_URL);
    await plus.waitFor('plus-test-feature-open');
    await browser.$(byExactTestId('plus-test-feature-open')).click();
    await plus.waitFor('plus-close');
    expect(await plus.isShown('plus-test-feature-unlocked', 500)).toBe(false);
  });

  it('iOS: covers the chat with the Plus screen', async function (this: Mocha.Context) {
    if (driver.isAndroid) {
      this.skip();
    }
    await openPlusWith(openPlus);

    // XCUITest's page source keeps the siblings of a modal view, so assert the chat is covered.
    const source = await plus.pageSource();
    expect(source).toContain('plus-close');
    expect(source).not.toMatch(/name="chat-input"[^>]*visible="true"/);
  });
});
