/**
 * Page object for the in-app purchase flow: Pals list -> Pal sheet ->
 * purchase footer phases -> model step, plus the restore rows.
 */

import {BasePage} from './BasePage';
import {Gestures} from '../helpers/gestures';
import {byTestId} from '../helpers/selectors';

declare const browser: WebdriverIO.Browser;
declare const driver: WebdriverIO.Browser;

export class PalBuyPage extends BasePage {
  palCard(palId: string): string {
    return byTestId(`palshub-pal-card-${palId}`);
  }

  async scrollToCard(testId: string): Promise<void> {
    await Gestures.scrollToElement(byTestId(testId), 8);
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

  async waitForInList(testId: string, timeout = 20000): Promise<void> {
    await this.scrollToCard(testId);
    await this.waitFor(testId, timeout);
  }

  async startChat(timeout = 300000): Promise<void> {
    await this.waitGone('model-step-download', timeout);
    await this.waitGone('model-step-progress', timeout);
    await this.tap(byTestId('model-step-start-chat'), timeout);
  }

  async closeSheet(): Promise<void> {
    if (await this.isShown('sheet-close-button', 2000)) {
      await this.tap(byTestId('sheet-close-button'));
    } else {
      await browser.back();
    }
    await browser.pause(500);
  }

  async closeAllSheets(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      if (!(await this.isShown('sheet-close-button', 1500))) {
        return;
      }
      await this.tap(byTestId('sheet-close-button'));
      await browser.pause(600);
    }
  }

  async restoreFromList(timeout = 20000): Promise<void> {
    await this.scrollToCard('restore-purchases-row');
    await this.tap(byTestId('restore-purchases-row'), timeout);
  }

  async dismissLinkPrompt(timeout = 20000): Promise<void> {
    await this.tap(byTestId('purchase-link-dismiss'), timeout);
  }

  async startLinkSignIn(timeout = 20000): Promise<void> {
    await this.tap(byTestId('purchase-link-signin'), timeout);
  }
}
