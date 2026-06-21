/**
 * Settings Page Object
 * Handles interactions with the Settings screen
 *
 * Uses shared Selectors utility for consistent cross-platform selectors
 */

import {BasePage} from './BasePage';
import {ChatPage} from './ChatPage';
import {DrawerPage} from './DrawerPage';
import {Selectors} from '../helpers/selectors';
import {Gestures} from '../helpers/gestures';

declare const browser: WebdriverIO.Browser;

export class SettingsPage extends BasePage {
  // Candidate selectors for the pushed-route back control. With a minimal
  // back-button display the chevron exposes no parent-route label, so fall back
  // across the names a back control can surface (route label, "…back", "Back").
  private static readonly BACK_BUTTON_CANDIDATES = [
    '-ios predicate string:type == "XCUIElementTypeButton" AND name CONTAINS "MainTabs"',
    '-ios predicate string:type == "XCUIElementTypeButton" AND name ENDSWITH "back"',
    '-ios predicate string:type == "XCUIElementTypeButton" AND name == "Back"',
  ];

  /**
   * Wait for the Settings launcher root to be ready. The launcher is a menu of
   * sub-screen rows; the Preferences row is always present and language-agnostic
   * (testID), so it is the stable readiness indicator after the launcher split.
   */
  async waitForReady(timeout = 10000): Promise<void> {
    await this.waitForElement(Selectors.settingsNav.preferences, timeout);
  }

  /**
   * Open drawer from Chat and navigate to the Settings launcher screen.
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
   * From the Settings launcher root, push the Preferences sub-screen (holds
   * context size, model-init and remote-server controls). Waits for a
   * Preferences-only control so callers can act once the screen is settled.
   */
  async openPreferences(): Promise<void> {
    await this.tap(Selectors.settingsNav.preferences);
    await this.waitForElement(Selectors.settings.contextSizeInput);
  }

  /**
   * From the Settings launcher root, push the App Settings sub-screen (holds
   * dark mode, language and display-memory-usage controls). Waits for the
   * language selector so callers can act once the screen is settled.
   */
  async openAppSettings(): Promise<void> {
    await this.tap(Selectors.settingsNav.appSettings);
    await this.waitForElement(Selectors.settings.languageSelectorButton);
  }

  /**
   * Pop a pushed sub-screen (Preferences / App Settings) back to the launcher
   * root. Pushed routes live on the root stack with a bare-chevron back button;
   * its accessibility name varies with the minimal back display mode and
   * localization, so match across the candidate names a back control can expose.
   */
  async backToSettingsRoot(): Promise<void> {
    if (await this.isElementDisplayed(Selectors.settingsNav.preferences, 1500)) {
      return;
    }
    for (const predicate of SettingsPage.BACK_BUTTON_CANDIDATES) {
      const back = browser.$(predicate);
      if (await back.isDisplayed().catch(() => false)) {
        await back.click();
        break;
      }
    }
    await this.waitForReady();
  }

  /**
   * Set the global model context size (n_ctx). Navigates into Preferences first
   * (the input was relocated there by the launcher split). The value is
   * debounced into the store, so we wait briefly for it to commit.
   */
  async setContextSize(value: string): Promise<void> {
    await this.openPreferences();
    await this.typeText(Selectors.settings.contextSizeInput, value);
    await this.dismissKeyboard();
    await browser.pause(700);
  }

  /**
   * Reach the language selector. It now lives in the App Settings sub-screen, so
   * navigate there first, then scroll it into view.
   */
  async scrollToLanguageSelector(): Promise<boolean> {
    await this.openAppSettings();
    return Gestures.scrollToElement(
      Selectors.settings.languageSelectorButton,
      7,
    );
  }

  /**
   * Reach the "Display Memory Usage" switch. It now lives in the App Settings
   * sub-screen, so navigate there first, then scroll it into view.
   */
  async scrollToDisplayMemoryUsageSwitch(): Promise<boolean> {
    await this.openAppSettings();
    return Gestures.scrollToElement(
      Selectors.settings.displayMemoryUsageSwitch,
      8,
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
