/**
 * Page object for the in-app purchase flow: Pals list -> Pal sheet ->
 * purchase footer phases -> model step, plus the restore rows.
 */

import {BasePage} from './BasePage';
import {byTestId} from '../helpers/selectors';

declare const browser: WebdriverIO.Browser;
declare const driver: WebdriverIO.Browser;

export class PalBuyPage extends BasePage {
  palCard(palId: string): string {
    return byTestId(`palshub-pal-card-${palId}`);
  }

  async scrollToCard(testId: string): Promise<void> {
    try {
      if (driver.isAndroid) {
        await browser.$(
          `android=new UiScrollable(new UiSelector().scrollable(true)).scrollIntoView(new UiSelector().resourceIdMatches(".*${testId}.*"))`,
        );
      } else {
        await browser.execute('mobile: scroll', {
          predicateString: `name == "${testId}"`,
        });
      }
    } catch {
      // Already visible, or nothing to scroll.
    }
  }

  async openPal(palId: string, timeout = 20000): Promise<void> {
    await this.scrollToCard(`palshub-pal-card-${palId}`);
    await this.tap(this.palCard(palId), timeout);
    await this.waitForExist(byTestId('sheet-close-button'), timeout).catch(
      () => undefined,
    );
  }

  async waitFor(testId: string, timeout = 20000): Promise<void> {
    await this.waitForElement(byTestId(testId), timeout);
  }

  async isShown(testId: string, timeout = 3000): Promise<boolean> {
    return this.isElementDisplayed(byTestId(testId), timeout);
  }

  async waitGone(testId: string, timeout = 20000): Promise<void> {
    await this.waitForElementToDisappear(byTestId(testId), timeout);
  }

  async text(testId: string, timeout = 20000): Promise<string> {
    const element = await this.waitForElement(byTestId(testId), timeout);
    return element.getText();
  }

  async buy(timeout = 20000): Promise<void> {
    const button = await this.waitForEnabled(byTestId('buy-button'), timeout);
    await button.click();
  }

  async buyLabel(timeout = 20000): Promise<string> {
    return this.text('buy-button', timeout);
  }

  async tapRetry(timeout = 20000): Promise<void> {
    await this.tap(byTestId('purchase-retry-button'), timeout);
  }

  async tapOwned(timeout = 20000): Promise<void> {
    await this.tap(byTestId('owned-button'), timeout);
  }

  async downloadModel(timeout = 20000): Promise<void> {
    await this.tap(byTestId('model-step-download'), timeout);
  }

  async startChat(timeout = 300000): Promise<void> {
    const button = await this.waitForEnabled(
      byTestId('model-step-start-chat'),
      timeout,
    );
    await button.click();
  }

  async closeSheet(): Promise<void> {
    if (await this.isShown('sheet-close-button', 2000)) {
      await this.tap(byTestId('sheet-close-button'));
    } else {
      await browser.back();
    }
    await browser.pause(500);
  }

  async restoreFromList(timeout = 20000): Promise<void> {
    await this.tap(byTestId('restore-purchases-row'), timeout);
  }

  async dismissLinkPrompt(timeout = 20000): Promise<void> {
    await this.tap(byTestId('purchase-link-dismiss'), timeout);
  }

  async startLinkSignIn(timeout = 20000): Promise<void> {
    await this.tap(byTestId('purchase-link-signin'), timeout);
  }
}
