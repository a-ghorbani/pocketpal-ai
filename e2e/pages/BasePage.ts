/**
 * Base Page Object class
 * Contains common methods and wait utilities for all pages
 */

declare const browser: WebdriverIO.Browser;

export type ChainableElement = ReturnType<WebdriverIO.Browser['$']>;

export abstract class BasePage {
  protected static readonly DEFAULT_TIMEOUT = 10000;

  /**
   * Wait for an element to be displayed and return it
   */
  protected async waitForElement(
    selector: string,
    timeout = BasePage.DEFAULT_TIMEOUT,
  ): Promise<ChainableElement> {
    const element = browser.$(selector);
    await element.waitForDisplayed({timeout});
    return element;
  }

  /**
   * Wait for an element to exist in DOM (may not be visible)
   */
  protected async waitForExist(
    selector: string,
    timeout = BasePage.DEFAULT_TIMEOUT,
  ): Promise<ChainableElement> {
    const element = browser.$(selector);
    await element.waitForExist({timeout});
    return element;
  }

  /**
   * Check if element is displayed within timeout
   */
  protected async isElementDisplayed(
    selector: string,
    timeout = 3000,
  ): Promise<boolean> {
    try {
      const element = browser.$(selector);
      await element.waitForDisplayed({timeout});
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Wait for element to disappear
   */
  protected async waitForElementToDisappear(
    selector: string,
    timeout = BasePage.DEFAULT_TIMEOUT,
  ): Promise<void> {
    const element = browser.$(selector);
    await element.waitForDisplayed({timeout, reverse: true});
  }

  /**
   * Wait for an element to be displayed and enabled
   */
  protected async waitForEnabled(
    selector: string,
    timeout = BasePage.DEFAULT_TIMEOUT,
  ): Promise<ChainableElement> {
    const element = browser.$(selector);
    await element.waitForDisplayed({timeout});
    await element.waitForEnabled({timeout});
    return element;
  }

  /**
   * Tap on an element
   */
  protected async tap(
    selector: string,
    timeout = BasePage.DEFAULT_TIMEOUT,
  ): Promise<void> {
    const element = await this.waitForElement(selector, timeout);
    await element.click();
  }

  /**
   * Type text into an input field
   */
  protected async typeText(
    selector: string,
    text: string,
    timeout = BasePage.DEFAULT_TIMEOUT,
  ): Promise<void> {
    const element = await this.waitForElement(selector, timeout);
    await element.clearValue();
    await element.setValue(text);
  }

  /**
   * Dismiss keyboard if visible
   */
  protected async dismissKeyboard(): Promise<void> {
    try {
      await (
        browser as unknown as {hideKeyboard: () => Promise<void>}
      ).hideKeyboard();
    } catch {
      // Keyboard might not be visible
    }
  }

  /**
   * Get element by selector for use with expect matchers
   */
  protected getElement(selector: string): ChainableElement {
    return browser.$(selector);
  }
}
