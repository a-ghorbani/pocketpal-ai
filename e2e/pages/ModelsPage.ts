/**
 * Models Page Object
 * Handles interactions with the Models screen
 *
 * Uses shared Selectors utility for consistent cross-platform selectors
 */

import {BasePage, ChainableElement} from './BasePage';
import {Selectors} from '../helpers/selectors';

declare const browser: WebdriverIO.Browser;
declare const driver: WebdriverIO.Browser;

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
   * Check if FAB menu is expanded (any FAB action is visible)
   */
  async isFabMenuExpanded(): Promise<boolean> {
    return this.isElementDisplayed(Selectors.models.hfFab, 2000);
  }

  /**
   * Expand FAB menu by tapping the FAB group.
   * Waits for the HF fab action to appear as confirmation.
   */
  async expandFabMenu(): Promise<void> {
    const fab = browser.$(Selectors.models.fabGroup);
    await fab.waitForDisplayed({timeout: 5000});
    await fab.click();
    // Wait for expand animation + actions to render
    await browser.pause(1000);
    // Verify expansion by checking for any FAB action
    let expanded = await this.isElementDisplayed(Selectors.models.hfFab, 3000);
    if (!expanded) {
      // FAB.Group's testID targets the container, not the tappable icon.
      // When the selector tap misses, fall back to a position-based tap
      // at the FAB's known screen location (bottom-right corner).
      const {width, height} = await driver.getWindowSize();
      await driver
        .action('pointer', {parameters: {pointerType: 'touch'}})
        .move({x: Math.round(width * 0.85), y: Math.round(height * 0.93)})
        .down()
        .up()
        .perform();
      await browser.pause(1000);
      const hfFab = browser.$(Selectors.models.hfFab);
      await hfFab.waitForDisplayed({timeout: 5000});
    }
  }

  /**
   * Close FAB menu if it's expanded
   */
  async closeFabMenuIfExpanded(): Promise<void> {
    const isExpanded = await this.isFabMenuExpanded();
    if (isExpanded) {
      // Tap the close button or the FAB group again to collapse
      const closeButton = browser.$(Selectors.models.fabGroupClose);
      const closeVisible = await closeButton.isDisplayed().catch(() => false);
      if (closeVisible) {
        await closeButton.click();
      } else {
        // Fallback: tap FAB group to toggle
        await this.tap(Selectors.models.fabGroup);
      }
      await browser.pause(500);
    }
  }

  /**
   * Open HuggingFace search sheet
   */
  async openHuggingFaceSearch(): Promise<void> {
    // First ensure FAB menu is in a known state (collapsed)
    await this.closeFabMenuIfExpanded();

    // Now expand the FAB menu
    await this.expandFabMenu();

    // Tap the HuggingFace FAB button
    await this.tap(Selectors.models.hfFab);
    await browser.pause(1000); // This is needed to ensure the animation is complete.
  }

  /**
   * Open the "Add Remote Model" sheet via the FAB menu.
   */
  async openAddRemoteModel(): Promise<void> {
    await this.closeFabMenuIfExpanded();
    await this.expandFabMenu();
    await browser.pause(500);
    await this.tap(Selectors.models.remoteFab);
    await browser.pause(1000);
  }

  /**
   * Tap "Manage Servers" in the FAB menu.
   * With a single server, ServerDetailsSheet opens directly.
   * With multiple servers, an Alert appears with server names.
   */
  async tapManageServers(): Promise<void> {
    await this.closeFabMenuIfExpanded();
    await this.expandFabMenu();
    await browser.pause(500);
    await this.tap(Selectors.models.manageServersFab);
    await browser.pause(1000);
  }

  /**
   * Dismiss keyboard (exposed from BasePage for use in tests)
   */
  async hideKeyboard(): Promise<void> {
    await this.dismissKeyboard();
  }
}
