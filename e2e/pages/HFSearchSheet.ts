/**
 * HuggingFace Search Sheet Page Object
 * Handles interactions with the HuggingFace model search bottom sheet
 *
 * Uses shared Selectors utility for consistent cross-platform selectors
 *
 * IMPORTANT: browser/driver globals are only available during test execution.
 */

// WebdriverIO globals - available during test execution
declare const driver: WebdriverIO.Browser;

import {BasePage, ChainableElement} from './BasePage';
import {Selectors} from '../helpers/selectors';

export class HFSearchSheet extends BasePage {
  /**
   * Get search view element
   */
  get searchView(): ChainableElement {
    return this.getElement(Selectors.hfSearch.view);
  }

  /**
   * Get search bar element
   */
  get searchBar(): ChainableElement {
    return this.getElement(Selectors.hfSearch.searchBar);
  }

  /**
   * Get search input element
   */
  get searchInput(): ChainableElement {
    return this.getElement(Selectors.hfSearch.searchInput);
  }

  /**
   * Check if sheet is displayed
   */
  async isDisplayed(): Promise<boolean> {
    return this.isElementDisplayed(Selectors.hfSearch.view, 3000);
  }

  /**
   * Wait for sheet to be ready
   * Waits for the search bar to be displayed since that's the primary interactive element
   */
  async waitForReady(timeout = 10000): Promise<void> {
    // Wait for the search bar which is the main interactive element
    await this.waitForElement(Selectors.hfSearch.searchBar, timeout);
  }

  /**
   * Wait for sheet to close
   */
  async waitForClose(timeout = 5000): Promise<void> {
    await this.waitForElementToDisappear(Selectors.hfSearch.view, timeout);
  }

  /**
   * Search for a model
   */
  async search(query: string): Promise<void> {
    const input = await this.waitForElement(Selectors.hfSearch.searchInput);
    await input.click();
    await input.setValue(query);
    await this.dismissKeyboard();
    // Brief pause for search debounce and results to load
    await driver.pause(1500);
  }

  /**
   * Select a model from search results by partial text match
   */
  async selectModel(text: string): Promise<void> {
    const selector = Selectors.hfSearch.modelItemByText(text);
    await this.tap(selector, 30000);
  }

  /**
   * Close the sheet, re-tapping the close button until it goes away.
   *
   * A single tap is not enough. The model-details sheet stacks above this one
   * and its handle (Pixel 9: [0,242][1080,316]) covers the close button
   * ([42,268][105,331]), so a tap during the ~3.5s dismiss animation lands on
   * the dismissing sheet instead. The system back action is not a usable
   * fallback either: this sheet never consumes back, which instead navigates
   * the screen underneath and leaves the sheet up.
   */
  async close(timeout = 20000): Promise<void> {
    const deadline = Date.now() + timeout;
    while (await this.isOpen()) {
      const closeBtn = this.getElement(Selectors.common.sheetCloseButton);
      if (await closeBtn.isDisplayed().catch(() => false)) {
        await closeBtn.click().catch(() => undefined);
      }
      try {
        await this.waitForClose(3000);
        return;
      } catch {
        if (Date.now() >= deadline) {
          throw new Error(
            `${Selectors.hfSearch.view} still displayed after ${timeout}ms of close attempts`,
          );
        }
      }
    }
  }

  private async isOpen(): Promise<boolean> {
    return this.getElement(Selectors.hfSearch.view)
      .isDisplayed()
      .catch(() => false);
  }
}
