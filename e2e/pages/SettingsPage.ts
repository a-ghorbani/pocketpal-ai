/**
 * Settings Page Object
 * Handles interactions with the Settings screen
 *
 * Uses shared Selectors utility for consistent cross-platform selectors
 */

import {BasePage} from './BasePage';
import {
  Selectors,
  byTestId,
  byText,
  byPartialText,
} from '../helpers/selectors';
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

  // --- Remote Server Management ---

  /**
   * Scroll down to the Remote Servers section.
   * The Remote Servers card is below API Settings, needs several swipes.
   */
  async scrollToRemoteServers(): Promise<boolean> {
    return Gestures.scrollToElement(
      Selectors.serverConfig.addServerButton,
      8,
    );
  }

  /**
   * Tap the "Add Server" button in the Remote Servers section.
   */
  async tapAddServer(): Promise<void> {
    await this.tap(Selectors.serverConfig.addServerButton);
    await browser.pause(500);
  }

  /**
   * Dismiss the privacy notice alert that appears when adding the first server.
   * Taps "OK" to acknowledge and proceed.
   */
  async dismissPrivacyNotice(): Promise<void> {
    const okButton = browser.$(Selectors.alert.button('OK'));
    const exists = await okButton.isExisting().catch(() => false);
    if (exists && (await okButton.isDisplayed().catch(() => false))) {
      await okButton.click();
      await browser.pause(500);
    }
  }

  /**
   * Fill in the server name field in the ServerConfigSheet.
   */
  async setServerName(name: string): Promise<void> {
    await this.typeText(Selectors.serverConfig.nameInput, name);
  }

  /**
   * Fill in the server URL field in the ServerConfigSheet.
   */
  async setServerUrl(url: string): Promise<void> {
    await this.typeText(Selectors.serverConfig.urlInput, url);
  }

  /**
   * Tap the "Test Connection" button in the ServerConfigSheet.
   * After filling form fields, the keyboard may cover the button.
   * Dismiss keyboard first, then scroll the sheet to make buttons visible.
   */
  async tapTestConnection(): Promise<void> {
    await this.dismissKeyboard();
    await browser.pause(500);

    // The sheet is 70% height and buttons may be below the fold.
    // Swipe up within the sheet area to reveal Test Connection and Save buttons.
    const testBtn = browser.$(Selectors.serverConfig.testButton);
    const isVisible = await testBtn.isDisplayed().catch(() => false);
    if (!isVisible) {
      // Swipe up in the lower half of screen (where the sheet is)
      await Gestures.swipe({
        startXPercent: 0.5,
        startYPercent: 0.7,
        endXPercent: 0.5,
        endYPercent: 0.4,
        duration: 300,
      });
      await browser.pause(300);
    }

    await this.tap(Selectors.serverConfig.testButton);
  }

  /**
   * Wait for test connection result to appear (success or failure).
   * Returns true if the "Connected!" success message is shown.
   */
  async waitForTestResult(timeout = 15000): Promise<boolean> {
    const successVisible = await this.isElementDisplayed(
      byPartialText('Connected!'),
      timeout,
    );
    return successVisible;
  }

  /**
   * Tap the "Save" button in the ServerConfigSheet.
   */
  async tapSaveServer(): Promise<void> {
    // Save button may also be below fold — scroll if not visible
    const saveBtn = browser.$(Selectors.serverConfig.saveButton);
    const isVisible = await saveBtn.isDisplayed().catch(() => false);
    if (!isVisible) {
      await Gestures.swipe({
        startXPercent: 0.5,
        startYPercent: 0.7,
        endXPercent: 0.5,
        endYPercent: 0.4,
        duration: 300,
      });
      await browser.pause(300);
    }
    await this.tap(Selectors.serverConfig.saveButton);
    await browser.pause(500);
  }

  /**
   * Complete flow: add a new remote server.
   * Handles privacy notice, fills form, tests connection, and saves.
   */
  async addRemoteServer(
    name: string,
    url: string,
    apiKey?: string,
  ): Promise<void> {
    // Scroll to and tap Add Server
    const found = await this.scrollToRemoteServers();
    if (!found) {
      throw new Error('Could not find Add Server button after scrolling');
    }
    await this.tapAddServer();

    // Dismiss privacy notice if it appears (first server only)
    await this.dismissPrivacyNotice();

    // Wait for the sheet to be ready
    await this.waitForElement(Selectors.serverConfig.nameInput, 5000);

    // Fill in server details
    await this.setServerName(name);
    await this.setServerUrl(url);

    if (apiKey) {
      await this.typeText(Selectors.serverConfig.apiKeyInput, apiKey);
    }

    // Test connection
    await this.tapTestConnection();
    const success = await this.waitForTestResult();
    if (!success) {
      console.warn('Test connection did not show success message');
    }

    // Save
    await this.tapSaveServer();
  }

  /**
   * Check if a server entry with the given name is visible in the Remote Servers list.
   */
  async isServerVisible(serverName: string, timeout = 5000): Promise<boolean> {
    // After adding, scroll to make sure we can see the server entry
    await Gestures.scrollToElement(byText(serverName), 3);
    return this.isElementDisplayed(byText(serverName), timeout);
  }
}
