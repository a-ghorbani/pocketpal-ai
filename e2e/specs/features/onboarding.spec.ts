/**
 * Onboarding flow E2E spec.
 *
 * Covers the canonical scenarios A, B, C, G, G', H. Runs against a
 * fresh-install state; the onboarding-bypass capability (see
 * AutomationBridge `__E2E_SKIP_ONBOARDING__`) is left UNSET for this
 * spec so the OnboardingStack actually mounts.
 *
 * Usage:
 *   yarn e2e:ios --spec onboarding --skip-build
 *   yarn e2e:android --spec onboarding --skip-build
 */

import {ChatPage} from '../../pages/ChatPage';
import {OnboardingPage} from '../../pages/OnboardingPage';
import {byTestId} from '../../helpers/selectors';

declare const driver: WebdriverIO.Browser;
declare const browser: WebdriverIO.Browser;

const TIMEOUT = 15000;

const getAppId = (): string =>
  (driver as any).isAndroid ? 'com.pocketpalai.e2e' : 'ai.pocketpal';

describe('Onboarding flow', () => {
  let onboarding: OnboardingPage;
  let chat: ChatPage;

  before(() => {
    onboarding = new OnboardingPage();
    chat = new ChatPage();
  });

  it('walks Splash → 1..6, picks topic + model, lands on Chat', async () => {
    // Splash appears for the dwell time, then auto-advances to step 1.
    await onboarding.waitForSplash(TIMEOUT);
    await onboarding.waitForScreen(1, TIMEOUT);

    // Step 1: no back, no skip, single primary CTA.
    await onboarding.tapPrimary();
    await onboarding.waitForScreen(2);

    // Steps 2..4: Continue forward.
    await onboarding.tapPrimary();
    await onboarding.waitForScreen(3);
    await onboarding.tapPrimary();
    await onboarding.waitForScreen(4);
    await onboarding.tapPrimary();
    await onboarding.waitForScreen(5);

    // Step 5: Continue disabled until at least one topic picked.
    await onboarding.tapTopic('everyday');
    await onboarding.tapPrimary();
    await onboarding.waitForScreen(6);

    // Step 6: Finish disabled until a model radio picked.
    await onboarding.tapPipModel(
      'hugging-quants/Llama-3.2-1B-Instruct-Q8_0-GGUF/llama-3.2-1b-instruct-q8_0.gguf',
    );
    await onboarding.tapPrimary();

    // Drawer mounts → Chat empty state visible.
    await chat.waitForReady(TIMEOUT);
  });

  it('cold restart skips onboarding', async () => {
    const appId = getAppId();
    await (driver as any).terminateApp(appId);
    await (driver as any).activateApp(appId);

    // Chat empty state is visible immediately; the onboarding splash
    // should NOT appear (persisted hasCompletedOnboarding survives).
    await chat.waitForReady(TIMEOUT);
    const splashVisible = await browser
      .$(byTestId('onboarding-splash'))
      .isDisplayed()
      .catch(() => false);
    expect(splashVisible).toBe(false);
  });

  it('Skip on screen 3 lands on Chat without a model bound', async () => {
    // This test depends on a fresh-onboarding state. The harness is
    // expected to clear app data between specs; if that contract is
    // ever broken the test will fail loudly (no splash → no screen 3).
    await onboarding.waitForSplash(TIMEOUT);
    await onboarding.waitForScreen(1, TIMEOUT);
    await onboarding.tapPrimary();
    await onboarding.waitForScreen(2);
    await onboarding.tapPrimary();
    await onboarding.waitForScreen(3);
    await onboarding.tapSkip();
    await chat.waitForReady(TIMEOUT);
  });

  it('Skip on screen 6 lands on Chat (no model bound, no download)', async () => {
    await onboarding.waitForSplash(TIMEOUT);
    await onboarding.waitForScreen(1, TIMEOUT);
    await onboarding.tapPrimary();
    await onboarding.waitForScreen(2);
    await onboarding.tapPrimary();
    await onboarding.waitForScreen(3);
    await onboarding.tapPrimary();
    await onboarding.waitForScreen(4);
    await onboarding.tapPrimary();
    await onboarding.waitForScreen(5);
    await onboarding.tapTopic('coding');
    await onboarding.tapPrimary();
    await onboarding.waitForScreen(6);
    await onboarding.tapSkip();
    await chat.waitForReady(TIMEOUT);
  });

  it('Stepper renders 4 dots across screens 1..4', async () => {
    await onboarding.waitForSplash(TIMEOUT);
    await onboarding.waitForScreen(1, TIMEOUT);
    for (let i = 1; i <= 4; i++) {
      expect(await onboarding.stepperDot(i).isExisting()).toBe(true);
    }
    await onboarding.tapPrimary();
    await onboarding.waitForScreen(2);
    expect(await onboarding.stepperDot(2).isExisting()).toBe(true);
    await onboarding.tapPrimary();
    await onboarding.waitForScreen(3);
    expect(await onboarding.stepperDot(3).isExisting()).toBe(true);
    await onboarding.tapPrimary();
    await onboarding.waitForScreen(4);
    expect(await onboarding.stepperDot(4).isExisting()).toBe(true);
  });
});
