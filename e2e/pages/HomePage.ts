/**
 * Home Page Object
 * Handles interactions with the Home screen (the ChatsTab root in the
 * bottom-tab app shell).
 *
 * Uses shared Selectors utility for consistent cross-platform selectors.
 */

import {BasePage} from './BasePage';
import {Selectors} from '../helpers/selectors';

export class HomePage extends BasePage {
  async isDisplayed(): Promise<boolean> {
    return this.isElementDisplayed(Selectors.home.screen);
  }

  async waitForReady(timeout = 15000): Promise<void> {
    await this.waitForElement(Selectors.home.screen, timeout);
  }

  /**
   * Start a chat from the composer. The composer is a launcher: tapping it
   * opens the Chat screen (where the input is focused). It accepts no text on
   * Home, so any message is typed in the Chat input after arrival.
   */
  async startChat(): Promise<void> {
    await this.tap(Selectors.home.composerInput);
  }

  /**
   * Open the pal/model picker via the model chip.
   */
  async openModelPicker(): Promise<void> {
    await this.tap(Selectors.home.modelChip);
  }
}
