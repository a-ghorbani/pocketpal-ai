/**
 * Model Details Sheet Page Object
 * Handles interactions with the model details bottom sheet
 *
 * Uses shared Selectors utility for consistent cross-platform selectors
 */

import {BasePage, ChainableElement} from './BasePage';
import {Gestures} from '../helpers/gestures';
import {Selectors} from '../helpers/selectors';

declare const browser: WebdriverIO.Browser;

export class ModelDetailsSheet extends BasePage {
  /**
   * Get model file card element
   */
  get modelFileCard(): ChainableElement {
    return this.getElement(Selectors.modelDetails.fileCard());
  }

  /**
   * Get download button element
   */
  get downloadButton(): ChainableElement {
    return this.getElement(Selectors.modelDetails.downloadButton);
  }

  /**
   * Check if sheet is displayed
   */
  async isDisplayed(): Promise<boolean> {
    return this.isElementDisplayed(Selectors.modelDetails.fileCard(), 3000);
  }

  /**
   * Wait for sheet to be ready
   */
  async waitForReady(timeout = 10000): Promise<void> {
    await this.waitForElement(Selectors.modelDetails.fileCard(), timeout);
  }

  /**
   * Wait for sheet to close
   */
  async waitForClose(timeout = 5000): Promise<void> {
    await this.waitForElementToDisappear(
      Selectors.modelDetails.fileCard(),
      timeout,
    );
  }

  /**
   * Tap download button (first visible one)
   * @deprecated Use tapDownloadForFile() for explicit file selection
   */
  async tapDownload(): Promise<void> {
    await this.tap(Selectors.modelDetails.downloadButton);
  }

  /**
   * Tap download button for a specific model file
   * Finds the file card by filename and clicks its download button
   *
   * @param filename - The exact filename (e.g., 'SmolLM2-135M-Instruct-Q4_0.gguf')
   * @param timeout - Timeout for waiting for elements
   */
  async tapDownloadForFile(
    filename: string,
    timeout = 10000,
  ): Promise<void> {
    // First, wait for the specific file card to be visible
    const fileCardSelector = Selectors.modelDetails.fileCard(filename);
    const fileCard = await this.waitForElement(fileCardSelector, timeout);

    // Find the download button within this file card
    const downloadButton = fileCard.$(Selectors.modelDetails.downloadButtonElement);
    await downloadButton.waitForDisplayed({timeout});
    await downloadButton.click();
  }

  /**
   * Scroll to a specific model file card if not visible
   *
   * @param filename - The exact filename to scroll to
   */
  async scrollToFile(filename: string): Promise<void> {
    const fileCardSelector = Selectors.modelDetails.fileCard(filename);
    const fileCard = browser.$(fileCardSelector);

    // Check if already visible
    if (await fileCard.isDisplayed()) {
      return;
    }

    // Scroll until visible
    await fileCard.scrollIntoView();
  }

  /**
   * Close the sheet by swiping down on the handle
   * Uses getLastDisplayedElement to handle stacked sheets (finds topmost visible handle)
   */
  async close(): Promise<void> {
    const handle = await this.getLastDisplayedElement(
      Selectors.common.sheetHandle,
    );
    await Gestures.swipeDownOnElement(handle);
    await this.waitForClose();
  }
}
