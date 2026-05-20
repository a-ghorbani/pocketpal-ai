/**
 * PalSheet Page Object
 * Handles interactions with the Pal create/edit bottom sheet
 *
 * Uses shared Selectors utility for consistent cross-platform selectors.
 * The sheet is scrollable so most actions scroll to the target first.
 */

import {BasePage} from './BasePage';
import {Selectors} from '../helpers/selectors';
import {Gestures} from '../helpers/gestures';

declare const browser: WebdriverIO.Browser;

export class PalSheetPage extends BasePage {
  /**
   * Set the pal name using the FormField testID.
   * FormField renders with testID="form-field-name".
   */
  async setName(name: string): Promise<void> {
    const selector = Selectors.palSheet.nameInput;
    await Gestures.scrollInSheetToElement(selector, 5);
    const nameInput = browser.$(selector);
    await nameInput.waitForDisplayed({timeout: 5000});
    await nameInput.clearValue();
    await nameInput.setValue(name);
    await this.dismissKeyboard();
  }

  /**
   * Set the system prompt text using the FormField testID.
   * FormField renders with testID="form-field-systemPrompt".
   * The system prompt is typically below the fold so we scroll to it first.
   */
  async setSystemPrompt(prompt: string): Promise<void> {
    const selector = Selectors.palSheet.systemPromptInput;
    await Gestures.scrollInSheetToElement(selector, 10);
    const promptInput = browser.$(selector);
    await promptInput.waitForDisplayed({timeout: 5000});
    await promptInput.clearValue();
    await promptInput.setValue(prompt);
    await this.dismissKeyboard();
  }

  /**
   * Scroll down within the sheet to reach the talent section
   */
  async scrollToTalents(): Promise<void> {
    await Gestures.scrollInSheetToElement(
      Selectors.palSheet.talentSection,
      10,
    );
  }

  /**
   * Enable a talent by tapping its switch (toggle on)
   */
  async enableTalent(talentName: string): Promise<void> {
    const selector = Selectors.palSheet.talentSwitch(talentName);
    await Gestures.scrollInSheetToElement(selector, 10);
    const switchEl = browser.$(selector);
    await switchEl.waitForDisplayed({timeout: 5000});
    await switchEl.click();
    await browser.pause(300);
  }

  /**
   * Disable a talent by tapping its switch (toggle off)
   */
  async disableTalent(talentName: string): Promise<void> {
    const selector = Selectors.palSheet.talentSwitch(talentName);
    await Gestures.scrollInSheetToElement(selector, 10);
    const switchEl = browser.$(selector);
    await switchEl.waitForDisplayed({timeout: 5000});
    await switchEl.click();
    await browser.pause(300);
  }

  /**
   * Tap the submit button to save the pal.
   * The submit button is in Sheet.Actions (fixed footer). On iOS,
   * the keyboard covers the footer so we must dismiss it first.
   *
   * Standard dismissKeyboard() taps Return which inserts a newline in
   * multiline fields (system prompt). Instead, tap the talent section
   * label area to blur any focused input.
   */
  async submit(): Promise<void> {
    // Tap talent section to blur any focused text input and dismiss keyboard
    const talentSection = browser.$(Selectors.palSheet.talentSection);
    if (await talentSection.isExisting()) {
      await talentSection.click();
      await browser.pause(500);
    }

    // Now the keyboard should be dismissed and submit button visible
    const btn = browser.$(Selectors.palSheet.submitButton);
    await btn.waitForDisplayed({timeout: 10000});
    await btn.click();
    await browser.pause(1000);
  }
}
