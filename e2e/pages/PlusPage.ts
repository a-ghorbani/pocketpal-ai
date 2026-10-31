/**
 * Page object for the Plus screen and its sidebar entry.
 *
 * Plus testIDs overlap as prefixes (plus-restore / plus-restore-note), so
 * every selector here is exact. iOS can't see container testIDs, so waits
 * target leaves (plus-close, plus-cta, plus-done).
 */

import {BasePage} from './BasePage';
import {byExactTestId} from '../helpers/selectors';
import {readControlEnabled} from '../helpers/control-state';

declare const browser: WebdriverIO.Browser;
declare const driver: WebdriverIO.Browser;

export class PlusPage extends BasePage {
  async openFromDrawer(timeout = 20000): Promise<void> {
    await this.tap(byExactTestId('drawer-item-plus'), timeout);
    await this.waitForScreen(timeout);
  }

  async waitForScreen(timeout = 20000): Promise<void> {
    await this.waitForElement(byExactTestId('plus-close'), timeout);
  }

  async isShown(testId: string, timeout = 3000): Promise<boolean> {
    return this.isElementDisplayed(byExactTestId(testId), timeout);
  }

  async waitFor(testId: string, timeout = 20000): Promise<void> {
    await this.waitForElement(byExactTestId(testId), timeout);
  }

  async waitGone(testId: string, timeout = 20000): Promise<void> {
    await this.waitForElementToDisappear(byExactTestId(testId), timeout);
  }

  async text(testId: string, timeout = 20000): Promise<string> {
    const element = await this.waitForElement(byExactTestId(testId), timeout);
    const own = (await element.getText()).trim();
    if (own || !driver.isAndroid) {
      return own;
    }
    const parts: string[] = [];
    for (const child of await element.$$('.//android.widget.TextView')) {
      parts.push((await child.getText()).trim());
    }
    return parts.filter(Boolean).join(' ');
  }

  async ctaLabel(timeout = 20000): Promise<string> {
    return this.text('plus-cta', timeout);
  }

  async ctaEnabled(timeout = 20000): Promise<boolean> {
    await this.waitForElement(byExactTestId('plus-cta'), timeout);
    return readControlEnabled(byExactTestId('plus-cta'));
  }

  async selectTile(productId: string, timeout = 20000): Promise<void> {
    await this.tap(byExactTestId(`plus-tile-${productId}`), timeout);
  }

  async buy(timeout = 20000): Promise<void> {
    const button = await this.waitForEnabled(
      byExactTestId('plus-cta'),
      timeout,
    );
    await button.click();
  }

  async waitForPurchased(timeout = 30000): Promise<void> {
    await this.waitFor('plus-done', timeout);
  }

  async done(timeout = 20000): Promise<void> {
    await this.tap(byExactTestId('plus-done'), timeout);
    await this.waitGone('plus-close');
  }

  async close(timeout = 20000): Promise<void> {
    await this.tap(byExactTestId('plus-close'), timeout);
    await this.waitGone('plus-close');
  }

  async restore(timeout = 20000): Promise<void> {
    await this.tap(byExactTestId('plus-restore'), timeout);
  }

  async restoreNote(timeout = 30000): Promise<string> {
    return this.text('plus-restore-note', timeout);
  }

  /** The sidebar entry's subtitle: Android reads the text, iOS the accessibility value. */
  async sidebarSubtitle(timeout = 20000): Promise<string> {
    if (driver.isAndroid) {
      return this.text('drawer-item-plus-subtitle', timeout);
    }
    const item = await this.waitForElement(
      byExactTestId('drawer-item-plus'),
      timeout,
    );
    return String(await item.getAttribute('value')).trim();
  }

  async hasSidebarEntry(timeout = 3000): Promise<boolean> {
    return this.isShown('drawer-item-plus', timeout);
  }

  async pageSource(): Promise<string> {
    return browser.getPageSource();
  }
}
