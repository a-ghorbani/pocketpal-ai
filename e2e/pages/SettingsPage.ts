/**
 * Settings Page Object
 * Handles interactions with the Settings screen
 *
 * Uses shared Selectors utility for consistent cross-platform selectors
 */

import {BasePage} from './BasePage';
import {ChatPage} from './ChatPage';
import {DrawerPage} from './DrawerPage';
import {Selectors, byTestId} from '../helpers/selectors';
import {Gestures} from '../helpers/gestures';

declare const browser: WebdriverIO.Browser;

export class SettingsPage extends BasePage {
  /**
   * Wait for settings screen to be ready.
   * Uses the context-size-input testID as the ready indicator since it's
   * always visible in the first card and is language-agnostic.
   */
  async waitForReady(timeout = 10000): Promise<void> {
    await this.waitForElement(byTestId('context-size-input'), timeout);
  }

  /**
   * Open drawer from Chat and navigate to the Settings screen.
   */
  async navigateTo(): Promise<void> {
    const chatPage = new ChatPage();
    const drawerPage = new DrawerPage();
    await chatPage.openDrawer();
    await drawerPage.waitForOpen();
    await this.tap(Selectors.drawer.settingsTab);
    await browser.pause(300);
    await drawerPage.waitForClose();
    await this.waitForReady();
  }

  /**
   * Set the global model context size (n_ctx). Must be on the Settings screen.
   * The value is debounced into the store, so we wait briefly for it to commit.
   */
  async setContextSize(value: string): Promise<void> {
    await this.waitForReady();
    await this.typeText(Selectors.settings.contextSizeInput, value);
    await this.dismissKeyboard();
    await browser.pause(700);
  }

  /**
   * Scroll down to the language selector button.
   * The language selector is in the "App Settings" card, which is the 4th card
   * on the Settings screen. Needs multiple swipes to reach.
   */
  async scrollToLanguageSelector(): Promise<boolean> {
    return Gestures.scrollToElement(
      Selectors.settings.languageSelectorButton,
      7,
    );
  }

  /**
   * Scroll down to the "Display Memory Usage" switch in the App Settings card.
   * Lives deep in the settings list (~line 998 of SettingsScreen.tsx), so it
   * needs several swipes to surface.
   */
  async scrollToDisplayMemoryUsageSwitch(): Promise<boolean> {
    return Gestures.scrollToElement(
      Selectors.settings.displayMemoryUsageSwitch,
      8,
    );
  }

  /**
   * Tap the language selector button and wait for the picker sheet to settle.
   */
  async openLanguageMenu(): Promise<void> {
    await this.tap(Selectors.settings.languageSelectorButton);
    await this.waitForElement(Selectors.settings.languageSheet);
  }

  /**
   * Select a language from the open language picker.
   * The list is virtualized, so the row is filtered into view by typing the
   * language code before tapping it.
   * @param lang - Language code (e.g., 'en', 'id', 'ja', 'zh')
   */
  async selectLanguage(lang: string): Promise<void> {
    await this.typeText(Selectors.settings.languageSearch, lang);
    await this.tap(Selectors.settings.languageOption(lang));
    // The sheet animates out; a lingering backdrop would eat the next gesture.
    await this.waitForElementToDisappear(Selectors.settings.languageSheet);
    // Wait for re-render after language change
    await browser.pause(1000);
  }

  /**
   * Wait for the language selector button to be visible (language-agnostic).
   * Useful after a language switch when text-based selectors would fail.
   */
  async waitForLanguageSelectorButton(timeout = 10000): Promise<void> {
    await this.waitForElement(
      Selectors.settings.languageSelectorButton,
      timeout,
    );
  }

}
