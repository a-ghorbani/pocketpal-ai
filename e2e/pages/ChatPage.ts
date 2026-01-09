/**
 * Chat Page Object
 * Handles interactions with the Chat screen
 *
 * Uses shared Selectors utility for consistent cross-platform selectors
 */

import {BasePage, ChainableElement} from './BasePage';
import {Selectors} from '../helpers/selectors';

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
}
