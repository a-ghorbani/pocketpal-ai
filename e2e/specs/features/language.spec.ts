/**
 * Language Switching Test: Verifies all supported languages
 *
 * Cycles through each language and asserts the UI updates.
 * Does NOT require a model to be loaded.
 *
 * Usage:
 *   yarn test:ios:local --spec specs/language.spec.ts
 *   yarn test:android:local --spec specs/language.spec.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import {ChatPage} from '../../pages/ChatPage';
import {DrawerPage} from '../../pages/DrawerPage';
import {SettingsPage} from '../../pages/SettingsPage';
import {byText, byStaticText} from '../../helpers/selectors';
import {SCREENSHOT_DIR} from '../../wdio.shared.conf';

declare const driver: WebdriverIO.Browser;
declare const browser: WebdriverIO.Browser;

/**
 * Expected translated values for assertion.
 * Keys: screenTitles.settings (navigation header)
 * Values: settings.modelInitializationSettings (first card title)
 */
const LANGUAGE_ASSERTIONS: Record<
  string,
  {screenTitle: string; firstCardTitle: string}
> = {
  en: {
    screenTitle: 'Settings',
    firstCardTitle: 'Model Initialization Settings',
  },
  id: {
    screenTitle: 'Pengaturan',
    firstCardTitle: 'Pengaturan Inisialisasi Model',
  },
  ja: {
    screenTitle: '設定',
    firstCardTitle: 'モデル初期化設定',
  },
  zh: {
    screenTitle: '设置',
    firstCardTitle: '模型初始化设置',
  },
};

// Order: start with non-English, end with English to restore default state
const LANGUAGE_ORDER = ['id', 'ja', 'zh', 'en'];

describe('Language Switching', () => {
  let chatPage: ChatPage;
  let drawerPage: DrawerPage;
  let settingsPage: SettingsPage;

  beforeEach(async () => {
    chatPage = new ChatPage();
    drawerPage = new DrawerPage();
    settingsPage = new SettingsPage();

    await chatPage.waitForReady(30000);
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

  it('should switch between all supported languages', async () => {
    // Navigate: Chat -> Drawer -> Settings
    await chatPage.openDrawer();
    await drawerPage.waitForOpen();
    await drawerPage.navigateToSettings();
    await settingsPage.waitForReady();

    // Ensure screenshot directory exists
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, {recursive: true});
    }

    // Cycle through each language
    for (const lang of LANGUAGE_ORDER) {
      console.log(`\n--- Switching to: ${lang} ---`);
      const expected = LANGUAGE_ASSERTIONS[lang];

      // Scroll to the language selector
      const found = await settingsPage.scrollToLanguageSelector();
      if (!found) {
        throw new Error(
          `Could not find language selector button after scrolling`,
        );
      }

      // Open language menu and select the language
      await settingsPage.openLanguageMenu();
      await settingsPage.selectLanguage(lang);

      // After language change, screen re-renders and scrolls to top.
      // Assert the navigation header title changed.
      // Use byStaticText to target the nav bar title (XCUIElementTypeStaticText)
      // and avoid matching the hidden drawer button (XCUIElementTypeButton).
      const titleElement = browser.$(byStaticText(expected.screenTitle));
      await titleElement.waitForDisplayed({timeout: 5000});
      console.log(`  Screen title: "${expected.screenTitle}" - OK`);

      // Assert the first card title changed (visible at top after re-render).
      const cardTitleElement = browser.$(byStaticText(expected.firstCardTitle));
      await cardTitleElement.waitForDisplayed({timeout: 5000});
      console.log(`  First card title: "${expected.firstCardTitle}" - OK`);

      // Take screenshot
      await driver.saveScreenshot(
        path.join(SCREENSHOT_DIR, `language-${lang}.png`),
      );
      console.log(`  Screenshot saved: language-${lang}.png`);
    }

    console.log('\n=== Language switching test complete ===');
  });
});
