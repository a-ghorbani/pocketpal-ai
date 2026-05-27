/**
 * Page Object for the onboarding flow.
 *
 * All locators are driven by the frozen testID surface defined in
 * `src/screens/OnboardingScreens` (and `src/components/ui/Stepper`).
 */

import {BasePage, type ChainableElement} from './BasePage';
import {byTestId} from '../helpers/selectors';

declare const browser: WebdriverIO.Browser;

export class OnboardingPage extends BasePage {
  get splash(): ChainableElement {
    return browser.$(byTestId('onboarding-splash'));
  }

  screen(n: 1 | 2 | 3 | 4 | 5 | 6): ChainableElement {
    return browser.$(byTestId(`onboarding-screen-${n}`));
  }

  get stepper(): ChainableElement {
    return browser.$(byTestId('ui-stepper'));
  }

  stepperDot(i: number): ChainableElement {
    return browser.$(byTestId(`ui-stepper-dot-${i}`));
  }

  get skip(): ChainableElement {
    return browser.$(byTestId('onboarding-skip'));
  }

  get audio(): ChainableElement {
    return browser.$(byTestId('onboarding-audio'));
  }

  get back(): ChainableElement {
    return browser.$(byTestId('onboarding-back'));
  }

  get primary(): ChainableElement {
    return browser.$(byTestId('onboarding-primary'));
  }

  topicChip(key: string): ChainableElement {
    return browser.$(byTestId(`onboarding-topic-${key}`));
  }

  pipModel(modelId: string): ChainableElement {
    return browser.$(byTestId(`onboarding-pip-model-${modelId}`));
  }

  async waitForScreen(
    n: 1 | 2 | 3 | 4 | 5 | 6,
    timeout = BasePage.DEFAULT_TIMEOUT,
  ): Promise<void> {
    await this.screen(n).waitForDisplayed({timeout});
  }

  async waitForSplash(timeout = BasePage.DEFAULT_TIMEOUT): Promise<void> {
    await this.splash.waitForDisplayed({timeout});
  }

  async tapPrimary(): Promise<void> {
    await this.primary.click();
  }

  async tapBack(): Promise<void> {
    await this.back.click();
  }

  async tapSkip(): Promise<void> {
    await this.skip.click();
  }

  async tapTopic(key: string): Promise<void> {
    await this.topicChip(key).click();
  }

  async tapPipModel(modelId: string): Promise<void> {
    await this.pipModel(modelId).click();
  }
}
