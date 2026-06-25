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
import {byStaticText} from '../../helpers/selectors';
import {SCREENSHOT_DIR} from '../../wdio.shared.conf';

declare const driver: WebdriverIO.Browser;
declare const browser: WebdriverIO.Browser;

/**
 * Expected translated value for assertion: the settings.language label, which
 * is always visible next to the language selector on the App Settings sub-screen
 * where the switch happens. Other on-screen chrome (the App Settings nav title)
 * uses launcher.* keys that are only translated for English so far, so the
 * always-translated Language label is the stable per-language signal.
 */
const LANGUAGE_ASSERTIONS: Record<string, {languageLabel: string}> = {
  en: {languageLabel: 'Language'},
  fa: {languageLabel: 'زبان'},
  he: {languageLabel: 'שפה'},
  id: {languageLabel: 'Bahasa'},
  ja: {languageLabel: '言語'},
  ko: {languageLabel: '언어'},
  ms: {languageLabel: 'Bahasa'},
  pt_BR: {languageLabel: 'Idioma'},
  ru: {languageLabel: 'Язык'},
  uk: {languageLabel: 'Мова'},
  zh: {languageLabel: '语言'},
  zh_Hant: {languageLabel: '語系'},
};

// Order: start with non-English, end with English to restore default state
const LANGUAGE_ORDER = ['fa', 'he', 'id', 'ja', 'ko', 'ms', 'pt_BR', 'ru', 'uk', 'zh', 'zh_Hant', 'en'];

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
    // Navigate: Chat -> Drawer -> Settings launcher
    await chatPage.openDrawer();
    await drawerPage.waitForOpen();
    await drawerPage.navigateToSettings();
    await settingsPage.waitForReady();

    // The language selector now lives on the App Settings sub-screen. Push it
    // once and scroll the selector into view; selecting a language keeps us on
    // this screen, so subsequent iterations operate in place.
    const found = await settingsPage.scrollToLanguageSelector();
    if (!found) {
      throw new Error('Could not find language selector button after scrolling');
    }

    // Ensure screenshot directory exists
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, {recursive: true});
    }

    // Cycle through each language
    for (const lang of LANGUAGE_ORDER) {
      console.log(`\n--- Switching to: ${lang} ---`);
      const expected = LANGUAGE_ASSERTIONS[lang];

      // Open language menu and select the language
      await settingsPage.openLanguageMenu();
      await settingsPage.selectLanguage(lang);

      // After the switch the App Settings screen re-renders in the new language.
      // Assert the always-translated Language label rendered (the App Settings
      // nav title uses launcher.* keys only translated for English so far, so
      // the Language label is the stable per-language signal).
      // Use byStaticText to target text elements only (excludes buttons); on iOS
      // this avoids matching hidden buttons, on Android it matches TextView/View.
      const labelElement = browser.$(byStaticText(expected.languageLabel));
      await labelElement.waitForDisplayed({timeout: 5000});
      console.log(`  Language label: "${expected.languageLabel}" - OK`);

      // Take screenshot
      await driver.saveScreenshot(
        path.join(SCREENSHOT_DIR, `language-${lang}.png`),
      );
      console.log(`  Screenshot saved: language-${lang}.png`);
    }

    console.log('\n=== Language switching test complete ===');
  });
});
