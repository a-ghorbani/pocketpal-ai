/**
 * Local Graded-Effort Override E2E (PR #783 repro guard)
 *
 * Reproduces the user-reported flow: open the card of the loaded, active local
 * reasoning model, declare it a reasoning model with graded effort, select all
 * three effort grades (low/medium/high), save, return to chat, and verify the
 * chat-input pill becomes a graded cycle (Think → low → medium → high → Think)
 * rather than staying a binary on/off toggle.
 *
 * Usage:
 *   npx ts-node scripts/run-e2e.ts --platform ios \
 *     --spec graded-effort-override --devices iphone-17-pro-sim --skip-build
 */

import * as fs from 'fs';
import * as path from 'path';
import {expect} from '@wdio/globals';
import {ChatPage} from '../../pages/ChatPage';
import {DrawerPage} from '../../pages/DrawerPage';
import {ModelsPage} from '../../pages/ModelsPage';
import {Selectors} from '../../helpers/selectors';
import {Gestures} from '../../helpers/gestures';
import {
  downloadAndLoadModel,
  dismissPerformanceWarningIfPresent,
} from '../../helpers/model-actions';
import {TIMEOUTS} from '../../fixtures/models';
import {SCREENSHOT_DIR} from '../../wdio.shared.conf';

declare const driver: WebdriverIO.Browser;
declare const browser: WebdriverIO.Browser;

/** Qwen3-0.6B: small reasoning-capable model — matches thinking.spec.ts. */
const THINKING_MODEL = {
  id: 'qwen3-0.6b',
  searchQuery: 'bartowski Qwen_Qwen3-0.6B',
  selectorText: 'Qwen_Qwen3-0.6B',
  downloadFile: 'Qwen_Qwen3-0.6B-Q4_0.gguf',
  prompts: [{input: "What's up?", description: 'Casual greeting'}],
};

/**
 * The pill TouchableOpacity is accessible on iOS, which collapses its inner
 * effort/"Think" Text node — so the grade word is not directly readable from
 * the accessibility tree. Instead we read the pill's on/off state from its
 * accessibilityLabel ("Disable thinking mode" = ON, "Enable thinking mode" =
 * OFF) and distinguish graded from binary by the transition pattern:
 *   binary  : every tap flips on↔off.
 *   graded  : from OFF the pill stays ON for each effort grade (low, medium,
 *             high) before returning to OFF — i.e. several consecutive ON taps.
 */
async function isPillOn(): Promise<boolean> {
  return browser
    .$(Selectors.thinking.toggleEnabled)
    .isExisting()
    .catch(() => false);
}

/**
 * Single raw tap on the pill. Unlike ChatPage.tapThinkingToggle (which retries
 * until the on/off state flips, and so cannot drive a graded pill that stays ON
 * across grades), this taps the clear part of the toggle exactly once and
 * dismisses any TTS sheet that the VoiceChip overlap may open.
 */
async function tapPillOnce(chatPage: ChatPage): Promise<void> {
  await chatPage.dismissVoicesSheetIfPresent();
  const sel = (await browser.$(Selectors.thinking.toggleEnabled).isExisting())
    ? Selectors.thinking.toggleEnabled
    : Selectors.thinking.toggleDisabled;
  const el = browser.$(sel);
  if (!(await el.isExisting())) {
    return;
  }
  const loc = await el.getLocation();
  const size = await el.getSize();
  const x = Math.round(loc.x + 8);
  const y = Math.round(loc.y + size.height / 2);
  await browser
    .action('pointer', {parameters: {pointerType: 'touch'}})
    .move({x, y})
    .down()
    .pause(60)
    .up()
    .perform();
  await browser.pause(350);
  await chatPage.dismissVoicesSheetIfPresent();
}

describe('Local Graded-Effort Override', () => {
  let chatPage: ChatPage;
  let drawerPage: DrawerPage;
  let modelsPage: ModelsPage;

  before(async () => {
    chatPage = new ChatPage();
    drawerPage = new DrawerPage();
    modelsPage = new ModelsPage();

    await chatPage.waitForReady(TIMEOUTS.appReady);
    // Settle after the fresh app launch before driving the drawer; tapping the
    // menu button too early after relaunch can miss the open animation.
    await browser.pause(1500);

    await downloadAndLoadModel(THINKING_MODEL);
    await dismissPerformanceWarningIfPresent();
    await chatPage.waitForReady();
  });

  afterEach(async function (this: Mocha.Context) {
    if (this.currentTest?.state === 'failed') {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const testName = this.currentTest.title.replace(/\s+/g, '-');
      try {
        if (!fs.existsSync(SCREENSHOT_DIR)) {
          fs.mkdirSync(SCREENSHOT_DIR, {recursive: true});
        }
        await driver.saveScreenshot(
          path.join(SCREENSHOT_DIR, `failure-${testName}-${timestamp}.png`),
        );
      } catch (e) {
        console.error('Failed to capture screenshot:', (e as Error).message);
      }
    }
  });

  it('graded-effort override on the active model makes the pill cycle low/medium/high', async () => {
    // Open the active model's card and declare graded effort.
    await chatPage.openDrawer();
    await drawerPage.waitForOpen();
    await drawerPage.navigateToModels();
    await modelsPage.waitForReady();
    await modelsPage.openModelSettings(THINKING_MODEL.downloadFile);

    // The reasoning section sits at the bottom of the settings ScrollView;
    // scroll it into view before driving the controls.
    await Gestures.scrollToElement(Selectors.modelSettings.isReasoningSwitch, 6);
    const isReasoning = browser.$(Selectors.modelSettings.isReasoningSwitch);
    await isReasoning.waitForDisplayed({timeout: 10000});

    // Ensure axis-1 is ON (reveals the axis-2 controls). The switch exposes its
    // value via the "value" attribute ("1"/"0" on iOS); only toggle when off.
    const isOn = await isReasoning.getAttribute('value').catch(() => null);
    if (isOn === '0' || isOn === 'false' || isOn === null) {
      await isReasoning.click();
      await browser.pause(400);
    }

    await Gestures.scrollToElement(
      Selectors.modelSettings.supportsEffortSwitch,
      6,
    );
    const supportsEffort = browser.$(Selectors.modelSettings.supportsEffortSwitch);
    await supportsEffort.waitForDisplayed({timeout: 10000});
    const effortOn = await supportsEffort.getAttribute('value').catch(() => null);
    if (effortOn === '0' || effortOn === 'false' || effortOn === null) {
      await supportsEffort.click();
      await browser.pause(400);
    }

    for (const level of ['low', 'medium', 'high']) {
      await Gestures.scrollToElement(
        Selectors.modelSettings.effortChip(level),
        4,
      );
      const chip = browser.$(Selectors.modelSettings.effortChip(level));
      await chip.waitForDisplayed({timeout: 10000});
      await chip.click();
      await browser.pause(200);
    }

    const save = browser.$(Selectors.generationSettings.saveChangesButton);
    await save.waitForDisplayed({timeout: 10000});
    await save.click();
    await browser.pause(600);

    // Back to chat. resetChat from the models flow is unreliable (gesture
    // conflicts), so navigate via the drawer.
    await modelsPage.openDrawer();
    await drawerPage.waitForOpen();
    await drawerPage.navigateToChat();
    await chatPage.waitForReady();

    expect(await chatPage.isThinkingToggleVisible()).toBe(true);

    // Drive the pill to a known OFF state first (the inner Text is collapsed by
    // iOS accessibility, so we steer by the on/off accessibilityLabel).
    if (await isPillOn()) {
      // From any on-state, a graded pill needs up to 3 taps to wrap to OFF; a
      // binary pill needs 1. Tap until OFF.
      for (let i = 0; i < 4 && (await isPillOn()); i++) {
        await tapPillOnce(chatPage);
      }
    }
    expect(await isPillOn()).toBe(false);

    // Record the on/off state after each of four taps from OFF.
    //   graded  : ON, ON, ON, OFF   (low → medium → high → off)
    //   binary  : ON, OFF, ON, OFF  (on → off → on → off)
    const states: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      await tapPillOnce(chatPage);
      const on = await isPillOn();
      states.push(on);
      console.log(`pill state after tap ${i + 1}: ${on ? 'ON' : 'OFF'}`);
    }

    // A graded pill stays ON across the three effort grades before wrapping to
    // OFF. A binary pill (the bug) alternates every tap and never holds ON for
    // three consecutive taps.
    expect(states).toEqual([true, true, true, false]);
  });
});
