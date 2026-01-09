/**
 * Drawer/Navigation Page Object
 * Handles interactions with the navigation drawer
 *
 * Uses shared Selectors utility for consistent cross-platform selectors
 */

import {BasePage, ChainableElement} from './BasePage';
import {Selectors} from '../helpers/selectors';

export class DrawerPage extends BasePage {
  /**
   * Get models tab element (used to verify drawer is open)
   */
  get modelsTab(): ChainableElement {
    return this.getElement(Selectors.drawer.modelsTab);
  }

  /**
   * Get chat tab element
   */
  get chatTab(): ChainableElement {
    return this.getElement(Selectors.drawer.chatTab);
  }

  /**
   * Check if drawer is open (by checking if modelsTab is visible)
   */
  async isOpen(): Promise<boolean> {
    return this.isElementDisplayed(Selectors.drawer.modelsTab, 3000);
  }

  /**
   * Wait for drawer to be fully open
   */
  async waitForOpen(timeout = 5000): Promise<void> {
    await this.waitForElement(Selectors.drawer.modelsTab, timeout);
  }

  /**
   * Wait for drawer to close
   */
  async waitForClose(timeout = 5000): Promise<void> {
    await this.waitForElementToDisappear(Selectors.drawer.modelsTab, timeout);
  }

  /**
   * Navigate to Chat screen
   */
  async navigateToChat(): Promise<void> {
    await this.waitForOpen();
    await this.tap(Selectors.drawer.chatTab);
    await this.waitForClose();
  }

  /**
   * Navigate to Models screen
   */
  async navigateToModels(): Promise<void> {
    await this.waitForOpen();
    await this.tap(Selectors.drawer.modelsTab);
    await this.waitForClose();
  }

  /**
   * Navigate to Settings screen
   */
  async navigateToSettings(): Promise<void> {
    await this.waitForOpen();
    await this.tap(Selectors.drawer.settingsTab);
    await this.waitForClose();
  }
}
