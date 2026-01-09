/**
 * Model Details Sheet Page Object
 * Handles interactions with the model details bottom sheet
 *
 * Uses shared Selectors utility for consistent cross-platform selectors
 */

import {BasePage, ChainableElement} from './BasePage';
import {Gestures} from '../helpers/gestures';
import {Selectors} from '../helpers/selectors';

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
   * Tap download button
   */
  async tapDownload(): Promise<void> {
    await this.tap(Selectors.modelDetails.downloadButton);
  }

  /**
   * Close the sheet by swiping down on the handle
   */
  async close(): Promise<void> {
    const handle = await this.waitForElement(Selectors.common.sheetHandle);
    await Gestures.swipeDownOnElement(handle);
    await this.waitForClose();
  }
}
