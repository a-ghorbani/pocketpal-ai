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
   * Start a chat from the composer. Sending navigates into the Chat flow
   * via the existing pending-message + active-pal handoff.
   */
  async startChat(message?: string): Promise<void> {
    if (message) {
      await this.typeText(Selectors.home.composerInput, message);
    }
    await this.tap(Selectors.home.composerSend);
  }

  /**
   * Open the pal/model picker via the model chip.
   */
  async openModelPicker(): Promise<void> {
    await this.tap(Selectors.home.modelChip);
  }
}
