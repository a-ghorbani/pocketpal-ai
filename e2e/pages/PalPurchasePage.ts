/**
 * Page object for the PalsHub premium-pal purchase flow:
 * browse card -> detail sheet -> Buy -> AuthSheet sign-in -> Download flip.
 */

import {BasePage} from './BasePage';
import {byTestId, isAndroid} from '../helpers/selectors';

declare const browser: WebdriverIO.Browser;

export class PalPurchasePage extends BasePage {
  private palCard(palId: string): string {
    return byTestId(`palshub-pal-card-${palId}`);
  }
  private get buyButton(): string {
    return byTestId('buy-button');
  }
  private get downloadButton(): string {
    return byTestId('download-button');
  }
  // Paper's outlined TextInput puts the testID resource-id on a container View;
  // the editable node is an inner EditText. Target it directly on Android so
  // setValue lands on the field, not the non-editable wrapper.
  private editableInput(testId: string): string {
    if (isAndroid()) {
      return `//*[contains(@resource-id, "${testId}")]//android.widget.EditText | //android.widget.EditText[contains(@resource-id, "${testId}")]`;
    }
    return byTestId(testId);
  }
  private get emailInput(): string {
    return this.editableInput('email-input');
  }
  private get passwordInput(): string {
    return this.editableInput('password-input');
  }
  // The AuthSheet visibility probe can match the container; keep a plain
  // resource-id match for the "is the sheet open?" check.
  private get emailInputProbe(): string {
    return byTestId('email-input');
  }
  private get authSubmit(): string {
    return byTestId('auth-submit-button');
  }
  private get disclosureContinue(): string {
    return byTestId('disclosure-continue-button');
  }
  private get disclosureCancel(): string {
    return byTestId('disclosure-cancel-button');
  }

  /** Open the premium pal's detail sheet from the browse list. */
  async openPalDetail(palId: string, timeout = 20000): Promise<void> {
    await this.tap(this.palCard(palId), timeout);
    await this.waitForElement(this.buyButton, timeout);
  }

  async tapBuy(timeout = 15000): Promise<void> {
    const btn = await this.waitForEnabled(this.buyButton, timeout);
    await btn.click();
  }

  /** Fill the AuthSheet email/password and submit. */
  async fillAndSubmitSignIn(
    email: string,
    password: string,
    timeout = 20000,
  ): Promise<void> {
    await this.typeText(this.emailInput, email, timeout);
    await this.typeText(this.passwordInput, password, timeout);
    await this.dismissKeyboard();
    await this.tap(this.authSubmit, timeout);
  }

  /** Dismiss the post-submit confirmation alert ("OK") if one appears. */
  async dismissAlertIfPresent(timeout = 4000): Promise<void> {
    const ok = isAndroid()
      ? browser.$('//*[@resource-id="android:id/button1" or @text="OK" or @text="Ok"]')
      : browser.$(
          '-ios predicate string:type == "XCUIElementTypeButton" AND (label == "OK" OR label == "Ok")',
        );
    try {
      await ok.waitForDisplayed({timeout});
      await ok.click();
    } catch {
      // No alert — proceed.
    }
  }

  /**
   * Tap Buy; if it routes to sign-in, authenticate and retry. Sign-in is async,
   * so a Buy tap before the session settles re-opens the AuthSheet — retry until
   * Buy actually starts checkout (the AuthSheet no longer appears).
   */
  async signInAndStartCheckout(
    email: string,
    password: string,
    attempts = 4,
  ): Promise<void> {
    for (let i = 0; i < attempts; i++) {
      await this.tapBuy();
      const authOpened = await this.isElementDisplayed(this.emailInputProbe, 4000);
      if (!authOpened) {
        return; // checkout started
      }
      await this.fillAndSubmitSignIn(email, password);
      await this.dismissAlertIfPresent();
      await this.waitForElementToDisappear(this.emailInputProbe, 15000).catch(
        () => {},
      );
      await browser.pause(2500); // let the session + observable state settle
    }
    throw new Error('Buy kept routing to sign-in; authentication never settled');
  }

  /**
   * ASWebAuthenticationSession shows a one-time system consent alert before the
   * page loads. Accept it if present; a no-op otherwise (already granted).
   */
  async acceptAuthConsentIfPresent(timeout = 8000): Promise<void> {
    const continueBtn = browser.$(
      '-ios predicate string:type == "XCUIElementTypeButton" AND label == "Continue"',
    );
    try {
      await continueBtn.waitForDisplayed({timeout});
      await continueBtn.click();
    } catch {
      // No consent prompt surfaced — proceed.
    }
  }

  /**
   * Android shows a required pre-purchase external-offers disclosure before the
   * Custom Tab opens. Consent to it; a no-op on iOS (no gate) or if absent.
   * Reaching this consent button proves the buy press routed into the in-app
   * checkout flow (the native auth-session module is registered).
   */
  async acceptDisclosureIfPresent(timeout = 8000): Promise<void> {
    const shown = await this.isElementDisplayed(this.disclosureContinue, timeout);
    if (!shown) {
      return;
    }
    await this.tap(this.disclosureContinue);
  }

  /** Decline the Android disclosure gate (cancel = no checkout). */
  async declineDisclosure(timeout = 8000): Promise<void> {
    await this.tap(this.disclosureCancel, timeout);
  }

  /** The reconcile poll flips Buy -> Download once ownership is granted. */
  async waitForDownloadButton(timeout = 30000): Promise<void> {
    await this.waitForElement(this.downloadButton, timeout);
  }
}
