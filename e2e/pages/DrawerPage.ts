/**
 * Drawer/Navigation Page Object
 * Handles interactions with the navigation drawer
 *
 * Uses shared Selectors utility for consistent cross-platform selectors
 */

import {BasePage, ChainableElement} from './BasePage';
import {Selectors} from '../helpers/selectors';

declare const browser: WebdriverIO.Browser;

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
   * Check if drawer is open (by checking if Pals tab is visible)
   * We use Pals because it's unique to the drawer and not a screen title
   */
  async isOpen(): Promise<boolean> {
    return this.isElementDisplayed(Selectors.drawer.palsTab, 3000);
  }

  /**
   * Wait for drawer to be fully open
   * We use Pals tab because it's unique to the drawer (not a screen title)
   */
  async waitForOpen(timeout = 5000): Promise<void> {
    await this.waitForElement(Selectors.drawer.palsTab, timeout);
  }

  /**
   * Wait for drawer to close
   * We use Pals tab because it's unique to the drawer and won't appear elsewhere
   */
  async waitForClose(timeout = 5000): Promise<void> {
    await this.waitForElementToDisappear(Selectors.drawer.palsTab, timeout);
  }

  /**
   * Navigate to Chat screen
   */
  async navigateToChat(): Promise<void> {
    await this.waitForOpen();
    await this.tap(Selectors.drawer.chatTab);
    // Wait a moment for drawer animation then verify it closed
    await browser.pause(300);
    await this.waitForClose();
  }

  /**
   * Navigate to Models screen
   */
  async navigateToModels(): Promise<void> {
    await this.waitForOpen();
    await this.tap(Selectors.drawer.modelsTab);
    // Wait a moment for drawer animation then verify it closed
    await browser.pause(300);
    await this.waitForClose();
  }

  /**
   * Navigate to Settings screen
   */
  async navigateToSettings(): Promise<void> {
    await this.waitForOpen();
    await this.tap(Selectors.drawer.settingsTab);
    // Wait a moment for drawer animation then verify it closed
    await browser.pause(300);
    await this.waitForClose();
  }
}
