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
   * Simply waits for the sheet animation to complete.
   * Note: On iOS, isDisplayed() is unreliable for elements in bottom sheets
   * so we don't try to verify file cards are visible. Instead, we rely on
   * scrollToFile and tapDownloadForFile to find specific elements.
   */
  async waitForReady(_timeout = 10000): Promise<void> {
    // Wait for sheet opening animation to complete
    // The actual content verification happens in scrollToFile/tapDownloadForFile
    await browser.pause(1000);
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
  async tapDownloadForFile(filename: string, timeout = 10000): Promise<void> {
    // Wait for the specific file card to exist in DOM
    // We use waitForExist because isDisplayed is unreliable for sheet content on iOS
    const fileCardSelector = Selectors.modelDetails.fileCard(filename);
    await this.waitForExist(fileCardSelector, timeout);

    // A card can exist in the hierarchy while still below the fold (the sheet
    // scroll stops on existence, not visibility), and an off-screen card
    // exposes no children — a bare button lookup then misreads "not rendered"
    // as "already downloaded". Swipe the sheet until the button is reachable
    // before concluding anything.
    const findButton = () =>
      browser
        .$(fileCardSelector)
        .$(Selectors.modelDetails.downloadButtonElement)
        .waitForExist({timeout: 2000})
        .then(() => true)
        .catch(() => false);
    let exists = await findButton();
    for (let i = 0; i < 6 && !exists; i++) {
      await Gestures.swipeUpInSheet();
      await browser.pause(300);
      exists = await findButton();
    }

    if (exists) {
      await browser
        .$(fileCardSelector)
        .$(Selectors.modelDetails.downloadButtonElement)
        .click();
    } else {
      console.log(
        `[tapDownloadForFile] no download button on card for ${filename} ` +
          `after scrolling; assuming already downloaded`,
      );
    }
  }

  /**
   * Scroll to a specific model file card if not visible
   * Uses safe scroll coordinates that won't trigger Android home gesture
   *
   * @param filename - The exact filename to scroll to
   */
  async scrollToFile(filename: string): Promise<void> {
    const fileCardSelector = Selectors.modelDetails.fileCard(filename);

    // Try to scroll until element exists in DOM
    // We use isExisting instead of isDisplayed due to iOS sheet visibility bug
    const found = await Gestures.scrollInSheetToElementExists(
      fileCardSelector,
      5,
    );
    if (!found) {
      // Fallback: element might already be in DOM but needs scroll into view
      const fileCard = browser.$(fileCardSelector);
      try {
        await fileCard.scrollIntoView();
      } catch {
        // Element may not be in the DOM yet - will be caught by tapDownloadForFile
      }
    }
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
