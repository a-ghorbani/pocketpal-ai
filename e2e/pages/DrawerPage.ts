/**
 * Drawer/Navigation Page Object
 * Handles interactions with the navigation drawer
 *
 * Uses shared Selectors utility for consistent cross-platform selectors
 */

import {BasePage, ChainableElement} from './BasePage';
import {Selectors, byPartialText, byText} from '../helpers/selectors';

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
   * Check if drawer is open using a stable drawer item test ID.
   */
  async isOpen(): Promise<boolean> {
    return this.isElementDisplayed(Selectors.drawer.openIndicator, 3000);
  }

  /**
   * Wait for drawer to be fully open
   * The chat item remains available when optional integrations are disabled.
   */
  async waitForOpen(timeout = 10000): Promise<void> {
    await this.waitForElement(Selectors.drawer.openIndicator, timeout);
  }

  /**
   * Wait for drawer to close
   * Wait for the drawer-specific chat item to disappear.
   */
  async waitForClose(timeout = 5000): Promise<void> {
    await this.waitForElementToDisappear(
      Selectors.drawer.openIndicator,
      timeout,
    );
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
   * Tap a chat session in the sidebar by matching its title text
   */
  async tapSession(titleFragment: string): Promise<void> {
    await this.waitForOpen();
    await this.tap(byPartialText(titleFragment));
    await browser.pause(300);
    await this.waitForClose();
  }

  /**
   * Navigate to Pals screen
   *
   * Tap the visible label, not Selectors.drawer.palsTab. That selector is the
   * testID (drawer-item-pals) used as the open/close indicator so it survives a
   * language switch, but a Paper Drawer.Item does not reliably respond to a
   * testID tap on iOS (see the selectors.ts drawer comment) — tapping the label
   * matches the other tabs and works on both platforms.
   */
  async navigateToPals(): Promise<void> {
    await this.waitForOpen();
    await this.tap(byText('Pals'));
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
