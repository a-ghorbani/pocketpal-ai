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
import {Selectors, byTestId, isAndroid} from '../../helpers/selectors';
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
 * A GRADED pill carries a different accessibilityLabel than a binary one:
 * "Reasoning effort: {Level}. Double tap to cycle effort level" — where {Level}
 * is the active grade (Low/Medium/High) when ON and EMPTY when OFF. (A binary
 * pill instead reads "Disable thinking mode" / "Enable thinking mode".) The
 * pill is always present via testID "thinking-toggle"; we read its state from
 * that label rather than the binary-only "Disable/Enable thinking mode"
 * selectors, which never match a graded pill.
 *
 * On iOS the testID becomes the element `name`, but when an accessibilityLabel
 * is also present the `~accessibility-id` strategy may resolve to the label
 * instead — so match by `name` via predicate. On Android the testID maps to
 * resource-id.
 */
const pillSelector = (): string =>
  isAndroid()
    ? byTestId('thinking-toggle')
    : '-ios predicate string:name == "thinking-toggle"';

/** Read the pill's accessibilityLabel ("label" on iOS, "content-desc" on Android). */
async function pillLabel(): Promise<string> {
  const el = browser.$(pillSelector());
  if (!(await el.isExisting().catch(() => false))) {
    return '';
  }
  const attr = isAndroid() ? 'content-desc' : 'label';
  return (await el.getAttribute(attr).catch(() => null)) ?? '';
}

/**
 * The active effort grade as shown on the pill (e.g. "Low"/"Medium"/"High"),
 * or "" when the pill is OFF. The label format is "Reasoning effort: {Level}.
 * Double tap to cycle effort level"; OFF renders an empty level. A binary pill
 * (the bug this test guards against) instead reads "Disable/Enable thinking
 * mode" — reported here as "ON"/"" so the cycle never holds across grades.
 */
async function pillEffort(): Promise<string> {
  const label = await pillLabel();
  const match = label.match(/Reasoning effort:\s*([^.]*)\./);
  if (match) {
    return match[1].trim();
  }
  return /Disable thinking mode/.test(label) ? 'ON' : '';
}

/** The pill is ON when it shows a non-empty effort grade. */
async function isPillOn(): Promise<boolean> {
  return (await pillEffort()).length > 0;
}

/**
 * Single raw tap on the pill. Unlike ChatPage.tapThinkingToggle (which retries
 * until the on/off state flips, and so cannot drive a graded pill that stays ON
 * across grades), this taps the clear part of the toggle exactly once and
 * dismisses any TTS sheet that the VoiceChip overlap may open.
 */
async function tapPillOnce(chatPage: ChatPage): Promise<void> {
  await chatPage.dismissVoicesSheetIfPresent();
  const el = browser.$(pillSelector());
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

    // Ensure axis-1 is ON (it reveals the axis-2 effort controls). The paper
    // Switch does not expose a reliable "value" attribute on iOS (returns null),
    // so a blind value-based click would toggle an already-ON reasoning model
    // OFF and unmount the effort switch. Steer by presence of the dependent
    // axis-2 control instead: only click axis-1 if the effort switch is absent.
    const effortSwitchPresent = async (): Promise<boolean> =>
      browser
        .$(Selectors.modelSettings.supportsEffortSwitch)
        .isExisting()
        .catch(() => false);
    if (!(await effortSwitchPresent())) {
      await isReasoning.click();
      await browser.pause(400);
    }

    await Gestures.scrollToElement(
      Selectors.modelSettings.supportsEffortSwitch,
      6,
    );
    const supportsEffort = browser.$(Selectors.modelSettings.supportsEffortSwitch);
    await supportsEffort.waitForDisplayed({timeout: 10000});

    // Ensure axis-2 is ON (it reveals the effort chips). Same paper-Switch
    // limitation as axis-1: steer by presence of the dependent effort chips
    // rather than the unreliable "value" attribute. Only click if absent.
    const effortChipsPresent = async (): Promise<boolean> =>
      browser
        .$(Selectors.modelSettings.effortChip('low'))
        .isExisting()
        .catch(() => false);
    if (!(await effortChipsPresent())) {
      await supportsEffort.click();
      await browser.pause(400);
    }

    // Enabling axis-2 pre-selects the standard low/medium/high subset — exactly
    // the graded set this test wants. The chip is a toggle, so TAPPING a
    // pre-selected chip would DESELECT it and persist an empty effort set (a
    // binary pill). The chip's selected state is also not reliably readable
    // across platforms (paper Chip's accessibilityState.selected surfaces as
    // selected="true" on iOS but selected="false" on Android even when chosen),
    // so a read-then-tap approach is unsafe. Instead we rely on the pre-applied
    // selection and only confirm the chips are present — no tapping.
    for (const level of ['low', 'medium', 'high']) {
      await Gestures.scrollToElement(
        Selectors.modelSettings.effortChip(level),
        4,
      );
      const chip = browser.$(Selectors.modelSettings.effortChip(level));
      await chip.waitForDisplayed({timeout: 10000});
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

    // The pill is present via testID "thinking-toggle" regardless of binary vs
    // graded state — but ChatPage.isThinkingToggleVisible() keys off the
    // BINARY "Disable/Enable thinking mode" labels, which a graded pill never
    // carries. Assert pill presence by testID instead. The chat re-render after
    // the settings save + drawer navigation can lag a beat, so wait for it.
    const pill = browser.$(pillSelector());
    await pill.waitForDisplayed({timeout: 15000});
    expect(await pill.isDisplayed()).toBe(true);

    // Drive the pill to a known OFF state first. We steer by the graded
    // accessibilityLabel ("Reasoning effort: {Level}.") rather than the inner
    // Text, which iOS collapses into the toggle.
    if (await isPillOn()) {
      // From any on-state, a graded pill needs up to 3 taps to wrap to OFF; a
      // binary pill needs 1. Tap until OFF.
      for (let i = 0; i < 4 && (await isPillOn()); i++) {
        await tapPillOnce(chatPage);
      }
    }
    expect(await isPillOn()).toBe(false);

    // Advance the pill one cycle step: tap until the effort label CHANGES. The
    // first pill interaction after navigation can be swallowed by the TTS
    // VoiceChip overlap, so a single blind tap is unreliable — retry until the
    // label moves (or we exhaust the attempt budget).
    const advance = async (from: string): Promise<string> => {
      for (let attempt = 0; attempt < 4; attempt++) {
        await tapPillOnce(chatPage);
        const now = await pillEffort();
        if (now !== from) {
          return now;
        }
      }
      return pillEffort();
    };

    // Record the on/off state across one full cycle from OFF. A graded pill
    // cycles off → low → medium → high → off, so the four steps read
    // ON, ON, ON, OFF. A binary pill (the bug) flips on↔off every tap
    // (ON, OFF, ON, OFF) and never holds ON across three consecutive grades.
    const states: boolean[] = [];
    let current = '';
    for (let i = 0; i < 4; i++) {
      current = await advance(current);
      const on = current.length > 0;
      states.push(on);
      console.log(`pill state after step ${i + 1}: ${on ? `ON (${current})` : 'OFF'}`);
    }

    expect(states).toEqual([true, true, true, false]);
  });
});
