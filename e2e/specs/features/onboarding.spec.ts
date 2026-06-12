/**
 * Onboarding flow E2E spec.
 *
 * Runs against a fresh-install state; the onboarding-bypass capability
 * (see AutomationBridge `__E2E_SKIP_ONBOARDING__`) is left UNSET for this
 * spec so the OnboardingStack actually mounts.
 *
 * Per-screen chrome contract this spec encodes:
 *   - Screens 1..4: Stepper + Skip top-right, back inside the bottom bar.
 *   - Screen 5:     no Skip, no primary, back-only bottom bar; chip-tap
 *                   auto-advances to screen 6.
 *   - Screen 6:     no Skip, back + primary in the bottom bar, models
 *                   resolved from the pal mapped to the topic chosen
 *                   on screen 5 (`else` and null both fall back to Pip).
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

// Pal-balanced model IDs come from src/store/onboarding/onboardingPals.ts;
// each entry id is `${repo}/${filename}`. Picked by topic on screen 5;
// the matching model is the one ModelRadioGroup renders on screen 6 with
// the Recommended badge.
const PIP_BALANCED_MODEL_ID =
  'bartowski/Llama-3.2-1B-Instruct-GGUF/Llama-3.2-1B-Instruct-Q4_K_M.gguf';
const CODIE_BALANCED_MODEL_ID =
  'lmstudio-community/Qwen3.5-2B-GGUF/Qwen3.5-2B-Q4_K_M.gguf';

const getAppId = (): string =>
  (driver as any).isAndroid ? 'com.pocketpalai.e2e' : 'ai.pocketpal';

const isDisplayedSafe = async (testId: string): Promise<boolean> =>
  browser
    .$(byTestId(testId))
    .isDisplayed()
    .catch(() => false);

describe('Onboarding flow', () => {
  let onboarding: OnboardingPage;
  let chat: ChatPage;

  before(() => {
    onboarding = new OnboardingPage();
    chat = new ChatPage();
  });

  it('walks Splash → 1..6 (topic=smartchat → Pip), picks balanced, lands on Chat', async () => {
    await onboarding.waitForSplash(TIMEOUT);
    await onboarding.waitForScreen(1, TIMEOUT);

    // Screens 1..4: Skip visible, primary advances.
    expect(await onboarding.skip.isDisplayed()).toBe(true);
    await onboarding.tapPrimary();
    await onboarding.waitForScreen(2);
    expect(await onboarding.skip.isDisplayed()).toBe(true);
    await onboarding.tapPrimary();
    await onboarding.waitForScreen(3);
    await onboarding.tapPrimary();
    await onboarding.waitForScreen(4);
    await onboarding.tapPrimary();
    await onboarding.waitForScreen(5);

    // Screen 5: no primary, no Skip; back-only bottom bar visible.
    expect(await isDisplayedSafe('onboarding-primary')).toBe(false);
    expect(await isDisplayedSafe('onboarding-skip')).toBe(false);
    expect(await onboarding.back.isDisplayed()).toBe(true);
    await onboarding.tapTopic('smartchat');
    await onboarding.waitForScreen(6);

    // Screen 6: no Skip, primary present (pre-seeded with the recommended
    // tier so it's enabled on arrival), back present in the bottom bar.
    expect(await isDisplayedSafe('onboarding-skip')).toBe(false);
    expect(await onboarding.primary.isDisplayed()).toBe(true);
    expect(await onboarding.back.isDisplayed()).toBe(true);
    await onboarding.tapPalModel(PIP_BALANCED_MODEL_ID);
    await onboarding.tapPrimary();

    await chat.waitForReady(TIMEOUT);
  });

  it('cold restart skips onboarding', async () => {
    const appId = getAppId();
    await (driver as any).terminateApp(appId);
    await (driver as any).activateApp(appId);

    await chat.waitForReady(TIMEOUT);
    expect(await isDisplayedSafe('onboarding-splash')).toBe(false);
  });

  it('Skip on screen 3 lands on Chat without a model bound', async () => {
    await onboarding.waitForSplash(TIMEOUT);
    await onboarding.waitForScreen(1, TIMEOUT);
    await onboarding.tapPrimary();
    await onboarding.waitForScreen(2);
    await onboarding.tapPrimary();
    await onboarding.waitForScreen(3);
    await onboarding.tapSkip();
    await chat.waitForReady(TIMEOUT);
  });

  it("'else' chip on screen 5 auto-advances to screen 6 with Pip as the fallback pal", async () => {
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
    await onboarding.tapTopic('else');
    await onboarding.waitForScreen(6);
    // 'else' falls back to Pip — Pip's balanced model is on screen 6.
    expect(
      await onboarding.palModel(PIP_BALANCED_MODEL_ID).isExisting(),
    ).toBe(true);
    await onboarding.tapPalModel(PIP_BALANCED_MODEL_ID);
    await onboarding.tapPrimary();
    await chat.waitForReady(TIMEOUT);
  });

  it('topic=coding renders Codie pal models (Qwen3.5 2B set)', async () => {
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
    await onboarding.waitForScreen(6);

    // Screen 6 must show Codie's balanced model (Qwen3.5 2B), not
    // Pip's Llama. This is the pal-per-topic guarantee.
    expect(
      await onboarding.palModel(CODIE_BALANCED_MODEL_ID).isExisting(),
    ).toBe(true);
    expect(
      await onboarding.palModel(PIP_BALANCED_MODEL_ID).isExisting(),
    ).toBe(false);

    await onboarding.tapPalModel(CODIE_BALANCED_MODEL_ID);
    await onboarding.tapPrimary();
    await chat.waitForReady(TIMEOUT);
  });

  it('back on screen 5 returns to screen 4 (mid-flow retreat affordance)', async () => {
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

    await onboarding.tapBack();
    await onboarding.waitForScreen(4);
  });

  it('Stepper renders 4 dots on screens 1..4 and is hidden on 5..6', async () => {
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

    // Persistent chrome hides the stepper on screens 5 and 6.
    await onboarding.tapPrimary();
    await onboarding.waitForScreen(5);
    expect(await isDisplayedSafe('ui-stepper')).toBe(false);
    await onboarding.tapTopic('else');
    await onboarding.waitForScreen(6);
    expect(await isDisplayedSafe('ui-stepper')).toBe(false);
  });
});
