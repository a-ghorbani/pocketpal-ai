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
   * Set the greeting message text in the GreetingSection.
   * The greeting field is below the system prompt so we scroll to it first.
   */
  async setGreetingText(text: string): Promise<void> {
    const selector = Selectors.palSheet.greetingTextInput;
    await Gestures.scrollInSheetToElement(selector, 10);
    const input = browser.$(selector);
    await input.waitForDisplayed({timeout: 5000});
    await input.clearValue();
    await input.setValue(text);
    await this.dismissKeyboard();
  }

  /**
   * Append a new suggested-prompt row and fill it with `text`.
   *
   * Counts existing rows before tapping the add button so the new row's
   * index is known without relying on internal state. The caller can chain
   * multiple calls to add several prompts in order.
   */
  async addSuggestedPrompt(text: string): Promise<void> {
    const addSelector = Selectors.palSheet.suggestedPromptAddButton;
    await Gestures.scrollInSheetToElement(addSelector, 10);

    // Probe by index to find the count of existing rows. The new row will
    // be appended at this index. Cross-platform selector strategies vary
    // (XPath on Android, predicate on iOS), so index probing is the most
    // reliable count.
    let nextIdx = 0;
    while (
      await browser
        .$(Selectors.palSheet.suggestedPromptInput(nextIdx))
        .isExisting()
        .catch(() => false)
    ) {
      nextIdx += 1;
    }

    const addBtn = browser.$(addSelector);
    await addBtn.waitForDisplayed({timeout: 5000});
    await addBtn.click();
    await browser.pause(500);

    const rowSelector = Selectors.palSheet.suggestedPromptInput(nextIdx);
    // iOS sim sometimes drops accessibility-id taps on a paper Button wrapper;
    // only re-tap when the first click did not append a new row so we don't
    // create an orphan empty row on platforms where the first tap is reliable.
    const rowAppeared = await browser
      .$(rowSelector)
      .isExisting()
      .catch(() => false);
    if (!rowAppeared) {
      await addBtn.click().catch(() => undefined);
      await browser.pause(800);
    }

    // Sheets on iOS often report isDisplayed=false for elements that exist
    // (Paper TextInput with empty value has zero rendered size). Use the
    // existence-only scroll + waitForExist instead of waitForDisplayed.
    await Gestures.scrollInSheetToElementExists(rowSelector, 5);
    const rowInput = browser.$(rowSelector);
    await rowInput.waitForExist({timeout: 5000});
    await rowInput.clearValue().catch(() => undefined);
    await rowInput.setValue(text);
    await this.dismissKeyboard();
  }

  /**
   * Remove the suggested-prompt row at `idx` by tapping its delete icon.
   */
  async removeSuggestedPromptAt(idx: number): Promise<void> {
    const selector = Selectors.palSheet.suggestedPromptRemove(idx);
    await Gestures.scrollInSheetToElement(selector, 10);
    const btn = browser.$(selector);
    await btn.waitForDisplayed({timeout: 5000});
    await btn.click();
    await browser.pause(300);
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
