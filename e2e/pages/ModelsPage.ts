/**
 * Models Page Object
 * Handles interactions with the Models screen
 *
 * Uses shared Selectors utility for consistent cross-platform selectors
 */

import {BasePage, ChainableElement} from './BasePage';
import {Selectors} from '../helpers/selectors';

export class ModelsPage extends BasePage {
  /**
   * Get FAB group element
   */
  get fabButton(): ChainableElement {
    return this.getElement(Selectors.models.fabGroup);
  }

  /**
   * Get HuggingFace FAB button
   */
  get hfFabButton(): ChainableElement {
    return this.getElement(Selectors.models.hfFab);
  }

  /**
   * Check if models screen is displayed
   */
  async isDisplayed(): Promise<boolean> {
    return this.isElementDisplayed(Selectors.models.screen, 5000);
  }

  /**
   * Wait for models screen to be ready
   */
  async waitForReady(timeout = 10000): Promise<void> {
    await this.waitForElement(Selectors.models.screen, timeout);
  }

  /**
   * Open navigation drawer
   */
  async openDrawer(): Promise<void> {
    await this.tap(Selectors.models.menuButton);
  }

  /**
   * Check if FAB menu is expanded (HF fab button is visible)
   */
  async isFabMenuExpanded(): Promise<boolean> {
    return this.isElementDisplayed(Selectors.models.hfFab, 2000);
  }

  /**
   * Expand FAB menu by tapping the FAB group
   */
  async expandFabMenu(): Promise<void> {
    await this.tap(Selectors.models.fabGroup);
    await this.waitForElement(Selectors.models.hfFab, 5000);
  }

  /**
   * Open HuggingFace search sheet
   */
  async openHuggingFaceSearch(): Promise<void> {
    // Ensure FAB menu is expanded first
    // if (!(await this.isFabMenuExpanded())) {
    await this.expandFabMenu();
    // }
    await this.tap(Selectors.models.hfFab);
    await browser.pause(1000); // This is needed to ensure the animation is complete.
  }
}
