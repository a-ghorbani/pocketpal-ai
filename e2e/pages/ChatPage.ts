/**
 * Chat Page Object
 * Handles interactions with the Chat screen
 *
 * Uses shared Selectors utility for consistent cross-platform selectors
 */

import {BasePage, ChainableElement} from './BasePage';
import {
  Selectors,
  byTestId,
  byText,
  byAccessibilityLabel,
  byPartialText,
} from '../helpers/selectors';
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
   * Type text into the chat input without sending
   */
  async typeInInput(text: string): Promise<void> {
    await this.typeText(Selectors.chat.input, text);
  }

  /**
   * Tap the send button (use when input already has text)
   */
  async tapSendButton(): Promise<void> {
    await this.tap(Selectors.chat.sendButton);
  }

  /**
   * Get the current text in the chat input field
   */
  async getInputText(): Promise<string> {
    const element = await this.waitForElement(Selectors.chat.input);
    if ((browser as any).isAndroid) {
      // Android: getText() returns placeholder text when input is empty,
      // so use getAttribute('text') which returns actual value only
      const text = (await element.getAttribute('text')) || '';
      // Filter out placeholder if getAttribute('text') also returns it
      if (text === 'Type your message here') {
        return '';
      }
      return text;
    }
    // iOS: getAttribute('value') returns null for empty inputs
    return (await element.getAttribute('value')) || '';
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
   * Get the temperature value displayed in the generation settings sheet.
   * Must be called when the generation settings sheet is open.
   */
  async getTemperatureValue(): Promise<string> {
    await Gestures.scrollInSheetToElement(
      Selectors.generationSettings.temperatureInput,
      3,
    );
    const input = browser.$(Selectors.generationSettings.temperatureInput);
    await input.waitForDisplayed({timeout: 5000});
    if ((browser as any).isAndroid) {
      return (await input.getAttribute('text')) || '';
    }
    return (await input.getAttribute('value')) || '';
  }

  /**
   * Close the generation settings sheet by tapping outside or using back gesture
   */
  async closeGenerationSettings(): Promise<void> {
    // Swipe down to dismiss the bottom sheet
    await Gestures.swipe({
      startXPercent: 0.5,
      startYPercent: 0.3,
      endXPercent: 0.5,
      endYPercent: 0.9,
      duration: 300,
    });
    await browser.pause(500);
  }

  /**
   * Open the pal/model picker sheet by tapping the pal selector button.
   */
  async openPalPicker(): Promise<void> {
    const palBtn = browser.$(byAccessibilityLabel('Select Pal'));
    await palBtn.waitForDisplayed({timeout: 5000});
    await palBtn.click();
    await browser.pause(500);
  }

  /**
   * Select a pal by name from the pal picker sheet (must be open).
   * Swipes left to reach the Pals tab since the picker defaults to Models.
   */
  async selectPal(palName: string): Promise<void> {
    // The picker shows Models tab by default.
    // Swipe right to reach the Pals tab (Pals is to the left of Models).
    await Gestures.swipe({
      startXPercent: 0.2,
      startYPercent: 0.7,
      endXPercent: 0.8,
      endYPercent: 0.7,
      duration: 300,
    });
    await browser.pause(500);

    // Now find and tap the pal using partial text match
    // (Pressable may combine child text labels into one accessibility element)
    const palItem = browser.$(byPartialText(palName));
    await palItem.waitForDisplayed({timeout: 5000});
    await palItem.click();
    await browser.pause(500);
  }

  /**
   * Set n_predict in the generation settings sheet (must be open).
   * The n_predict input is the first field, so no scrolling needed.
   */
  async setNPredict(value: string): Promise<void> {
    const input = browser.$(byTestId('n_predict-input'));
    await input.waitForDisplayed({timeout: 5000});
    await input.clearValue();
    await input.setValue(value);
    await this.dismissKeyboard();
  }

  /**
   * Get the n_predict value from the generation settings sheet (must be open).
   */
  async getNPredictValue(): Promise<string> {
    const input = browser.$(byTestId('n_predict-input'));
    await input.waitForDisplayed({timeout: 5000});
    if ((browser as any).isAndroid) {
      return (await input.getAttribute('text')) || '';
    }
    return (await input.getAttribute('value')) || '';
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
