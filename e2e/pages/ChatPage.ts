/**
 * Chat Page Object
 * Handles interactions with the Chat screen
 *
 * Uses shared Selectors utility for consistent cross-platform selectors
 */

import {BasePage, ChainableElement} from './BasePage';
import {Selectors, byText} from '../helpers/selectors';
import {Gestures} from '../helpers/gestures';

declare const browser: WebdriverIO.Browser;

export class ChatPage extends BasePage {
  /**
   * Get the menu button element (hamburger to open drawer)
   */
  get menuButton(): ChainableElement {
    return this.getElement(Selectors.chat.menuButton);
  }

  /**
   * Get the chat input element
   */
  get chatInput(): ChainableElement {
    return this.getElement(Selectors.chat.input);
  }

  /**
   * Get the send button element
   */
  get sendButton(): ChainableElement {
    return this.getElement(Selectors.chat.sendButton);
  }

  /**
   * Check if chat screen is displayed
   */
  async isDisplayed(): Promise<boolean> {
    return this.isElementDisplayed(Selectors.chat.input);
  }

  /**
   * Wait for chat screen to be ready
   */
  async waitForReady(timeout = 15000): Promise<void> {
    await this.waitForElement(Selectors.chat.input, timeout);
  }

  /**
   * Open the navigation drawer by tapping menu button
   */
  async openDrawer(): Promise<void> {
    await this.tap(Selectors.chat.menuButton);
  }

  /**
   * Send a chat message
   */
  async sendMessage(message: string): Promise<void> {
    await this.typeText(Selectors.chat.input, message);
    await this.tap(Selectors.chat.sendButton);
  }

  /**
   * Reset/clear the current chat to start a new session
   */
  async resetChat(): Promise<void> {
    await this.tap(Selectors.chat.resetButton);
  }

  /**
   * Check if the thinking toggle is visible (model supports thinking)
   */
  async isThinkingToggleVisible(): Promise<boolean> {
    const enabled = await this.isElementDisplayed(
      Selectors.thinking.toggleEnabled,
      3000,
    );
    if (enabled) {
      return true;
    }
    return this.isElementDisplayed(Selectors.thinking.toggleDisabled, 1000);
  }

  /**
   * Check if thinking mode is currently enabled
   */
  async isThinkingEnabled(): Promise<boolean> {
    return this.isElementDisplayed(Selectors.thinking.toggleEnabled, 3000);
  }

  /**
   * Tap the thinking toggle to switch its state
   */
  async tapThinkingToggle(): Promise<void> {
    // Try the enabled state first, then disabled
    const enabledEl = browser.$(Selectors.thinking.toggleEnabled);
    if (await enabledEl.isExisting()) {
      await enabledEl.click();
    } else {
      await this.tap(Selectors.thinking.toggleDisabled);
    }
    await browser.pause(300);
  }

  /**
   * Check if a thinking bubble ("Reasoning") is present in the chat
   */
  async isThinkingBubbleVisible(timeout = 3000): Promise<boolean> {
    return this.isElementDisplayed(Selectors.thinking.bubble, timeout);
  }

  /**
   * Open generation settings sheet via the menu
   */
  async openGenerationSettings(): Promise<void> {
    // Tap the three-dot menu button (top right, not the hamburger)
    const menuBtn = browser.$(Selectors.chat.menuButton);

    // There are two elements with testID "menu-button": hamburger (left) and dots (right).
    // We need the second one (dots menu). Use $$ to get all matches.
    const menuButtons = browser.$$(Selectors.chat.menuButton);
    const count = await menuButtons.length;
    if (count >= 2) {
      await menuButtons[count - 1].click();
    } else {
      await menuBtn.click();
    }

    await browser.pause(500);

    // Tap "Generation settings" menu item
    const genSettingsItem = browser.$(byText('Generation settings'));
    await genSettingsItem.waitForDisplayed({timeout: 5000});
    await genSettingsItem.click();
    await browser.pause(500);
  }

  /**
   * Set temperature in the generation settings sheet (must be open).
   * Scrolls to the temperature input and sets the value.
   */
  async setTemperature(value: string): Promise<void> {
    await Gestures.scrollInSheetToElement(
      Selectors.generationSettings.temperatureInput,
      3,
    );
    const input = browser.$(Selectors.generationSettings.temperatureInput);
    await input.waitForDisplayed({timeout: 5000});
    await input.clearValue();
    await input.setValue(value);
    await this.dismissKeyboard();
  }

  /**
   * Set seed in the generation settings sheet (must be open).
   * Scrolls to the seed input and sets the value.
   */
  async setSeed(value: string): Promise<void> {
    await Gestures.scrollInSheetToElement(
      Selectors.generationSettings.seedInput,
      10,
    );
    const input = browser.$(Selectors.generationSettings.seedInput);
    await input.waitForDisplayed({timeout: 5000});
    await input.clearValue();
    await input.setValue(value);
    await this.dismissKeyboard();
  }

  /**
   * Save generation settings (taps Save or Save changes button)
   */
  async saveGenerationSettings(): Promise<void> {
    // Dismiss keyboard first - it may be covering the Save button
    await this.dismissKeyboard();
    await browser.pause(500);

    // Try "Save changes" first (preset context), fallback to "Save" (session)
    const saveChangesBtn = browser.$(
      Selectors.generationSettings.saveChangesButton,
    );
    if (await saveChangesBtn.isDisplayed().catch(() => false)) {
      await saveChangesBtn.click();
    } else {
      const saveBtn = browser.$(Selectors.generationSettings.saveButton);
      await saveBtn.waitForDisplayed({timeout: 5000});
      await saveBtn.click();
    }
    await browser.pause(500);
  }
}
