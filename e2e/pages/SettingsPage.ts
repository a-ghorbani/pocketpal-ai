/**
 * Settings Page Object
 * Handles interactions with the Settings screen
 *
 * Uses shared Selectors utility for consistent cross-platform selectors
 */

import {BasePage} from './BasePage';
import {Selectors, byTestId} from '../helpers/selectors';
import {Gestures} from '../helpers/gestures';

declare const browser: WebdriverIO.Browser;

export class SettingsPage extends BasePage {
  /**
   * Wait for settings screen to be ready.
   * Uses the gpu-layers-slider testID as the ready indicator since it's
   * in the first visible card and is language-agnostic.
   */
  async waitForReady(timeout = 10000): Promise<void> {
    await this.waitForElement(byTestId('gpu-layers-slider'), timeout);
  }

  /**
   * Scroll down to the language selector button.
   * The language selector is in the "App Settings" card, which is the 4th card
   * on the Settings screen. Needs multiple swipes to reach.
   */
  async scrollToLanguageSelector(): Promise<boolean> {
    return Gestures.scrollToElement(
      Selectors.settings.languageSelectorButton,
      5,
    );
  }

  /**
   * Tap the language selector button to open the language menu.
   */
  async openLanguageMenu(): Promise<void> {
    await this.tap(Selectors.settings.languageSelectorButton);
    // Brief pause for menu animation
    await browser.pause(500);
  }

  /**
   * Select a language from the open language menu.
   * @param lang - Language code (e.g., 'en', 'id', 'ja', 'zh')
   */
  async selectLanguage(lang: string): Promise<void> {
    await this.tap(Selectors.settings.languageOption(lang));
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
