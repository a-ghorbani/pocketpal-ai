/**
 * HuggingFace Search Sheet Page Object
 * Handles interactions with the HuggingFace model search bottom sheet
 *
 * Uses shared Selectors utility for consistent cross-platform selectors
 *
 * IMPORTANT: browser/driver globals are only available during test execution.
 */

// WebdriverIO globals - available during test execution
declare const browser: WebdriverIO.Browser;
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
   */
  async waitForReady(timeout = 10000): Promise<void> {
    await this.waitForElement(Selectors.hfSearch.view, timeout);
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
   * Close the sheet by tapping the close button
   */
  async close(): Promise<void> {
    const closeBtn = await this.waitForEnabled(
      Selectors.common.sheetCloseButton,
    );
    await closeBtn.click();
    await this.waitForClose();
  }
}
