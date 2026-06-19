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
   * Get the chat header overflow menu button (generation-settings menu).
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
   * Open the navigation drawer by tapping menu button.
   *
   * @deprecated The drawer was removed in the bottom-tab migration.
   * Top-level navigation is the bottom-tab bar; drawer-era destinations
   * are pushed routes reached from Home or the Chat flow. Specs still
   * calling this need migrating to the tab/Home navigation model.
   */
  async openDrawer(): Promise<void> {
    await this.tap(Selectors.chat.menuButton);
  }

  /**
   * Reach the Models screen from the Chat flow's empty-state action,
   * which is the surviving in-app Models entry now that the drawer is
   * gone (the no-model placeholder navigates to Models).
   */
  async goToModelsViaEmptyState(): Promise<void> {
    await this.tap(Selectors.chat.emptyPlaceholderAction);
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
   * Dismiss the TTS "Voices" setup sheet if it is open.
   * The VoiceChip (TTS control) sits next to the thinking toggle in the chat
   * input. When no voice is configured the chip is expanded and can overlap the
   * toggle; a tap on the overlap opens this sheet instead of flipping the
   * toggle (#764). No-op when absent.
   */
  async dismissVoicesSheetIfPresent(): Promise<void> {
    try {
      const closeBtn = browser.$(Selectors.common.sheetCloseButton);
      if ((await closeBtn.isExisting()) && (await closeBtn.isDisplayed())) {
        await closeBtn.click();
        await browser.pause(400);
      }
    } catch {
      // No sheet open - continue
    }
  }

  /**
   * Tap the thinking toggle to switch its state.
   *
   * The TTS VoiceChip can overlap the thinking toggle on EITHER side depending
   * on pal-name length and screen geometry (confirmed across the device fleet,
   * #764). A tap on the overlap hits the chip and opens the "Voices" sheet
   * instead of flipping the toggle. So: measure both elements, tap the part of
   * the toggle the chip does NOT cover, dismiss any sheet that still slips
   * open, and verify the toggle actually flipped — retrying the other clear
   * side if it did not.
   */
  async tapThinkingToggle(): Promise<void> {
    const before = await this.isThinkingEnabled();
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.dismissVoicesSheetIfPresent();
      const sel = (await browser
        .$(Selectors.thinking.toggleEnabled)
        .isExisting())
        ? Selectors.thinking.toggleEnabled
        : Selectors.thinking.toggleDisabled;
      const el = browser.$(sel);
      if (!(await el.isExisting())) {
        return;
      }
      const loc = await el.getLocation();
      const size = await el.getSize();
      let x = Math.round(loc.x + size.width / 2);
      const y = Math.round(loc.y + size.height / 2);
      const chip = browser.$(byTestId('voicechip'));
      if (await chip.isExisting().catch(() => false)) {
        const cloc = await chip.getLocation();
        const csize = await chip.getSize();
        const leftClear = cloc.x - loc.x;
        const rightClear = loc.x + size.width - (cloc.x + csize.width);
        if (Math.max(leftClear, rightClear) > 4) {
          // attempt 0 → widest clear side; attempt 1 → the other side.
          const useLeft =
            attempt === 0 ? leftClear >= rightClear : leftClear < rightClear;
          x = useLeft
            ? Math.round(loc.x + Math.max(4, leftClear / 2))
            : Math.round(cloc.x + csize.width + Math.max(4, rightClear / 2));
        }
      }
      // Clamp the tap inside the toggle bounds. The chip-avoidance offset above
      // can otherwise compute an x just past an edge, so the tap misses the
      // button and the toggle never flips.
      x = Math.min(
        loc.x + size.width - 4,
        Math.max(loc.x + 4, x),
      );
      await browser
        .action('pointer', {parameters: {pointerType: 'touch'}})
        .move({x, y})
        .down()
        .pause(60)
        .up()
        .perform();
      await browser.pause(400);
      await this.dismissVoicesSheetIfPresent();
      if ((await this.isThinkingEnabled()) !== before) {
        return; // toggle flipped
      }
    }
  }

  /**
   * Check if a thinking bubble ("Reasoning") is present in the chat
   */
  async isThinkingBubbleVisible(timeout = 3000): Promise<boolean> {
    return this.isElementDisplayed(Selectors.thinking.bubble, timeout);
  }

  /**
   * Open generation settings sheet via the chat header overflow menu.
   */
  async openGenerationSettings(): Promise<void> {
    // The chat header's three-dot overflow is now the only "menu-button":
    // the drawer hamburger was removed with the bottom-tab migration, so
    // the previous tap-last collision workaround no longer applies.
    await this.tap(Selectors.chat.menuButton);
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
   * If value is '-1', taps "Unlimited" segment.
   * Otherwise, taps "Custom" segment and types the value.
   */
  async setNPredict(value: string): Promise<void> {
    if (value === '-1') {
      const unlimitedBtn = browser.$(byText('Unlimited'));
      await unlimitedBtn.waitForDisplayed({timeout: 5000});
      await unlimitedBtn.click();
      await browser.pause(300);
    } else {
      const customBtn = browser.$(byText('Custom'));
      await customBtn.waitForDisplayed({timeout: 5000});
      await customBtn.click();
      await browser.pause(300);

      const input = browser.$(byTestId('n_predict-input'));
      await input.waitForDisplayed({timeout: 5000});
      await input.clearValue();
      await input.setValue(value);
      await this.dismissKeyboard();
    }
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
