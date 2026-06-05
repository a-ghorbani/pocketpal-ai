/**
 * Context-Limit Banner Feature Tests
 *
 * Exercises the chat-surface context banner + increase-context recovery flow.
 * The banner trigger is reactive (driven by the last finished turn's snapshot),
 * so we shrink the global context to a tiny n_ctx and lift n_predict, then send
 * a long-generation prompt so a reply overflows the window and surfaces the
 * banner. From there we cover the reachable recovery affordances.
 *
 * Validates (best-effort — exact warning-vs-full depends on token counts):
 * - No context banner on a fresh chat before any inference.
 * - A context banner (warning or full) + its fullness meter appear once a reply
 *   overflows the small context.
 * - The increase-context sheet opens from the banner and can be cancelled.
 * - The banner can be dismissed.
 * - "New chat" from the full banner starts a fresh, banner-free session.
 *
 * Not covered here (covered by unit tests): clear-on-edit/regenerate (no stable
 * edit gesture in the page objects), per-locale copy, and remote-hedged (needs a
 * configured remote server).
 *
 * Usage:
 *   yarn e2e:ios --spec context-banner --skip-build
 *   yarn e2e:android --spec context-banner --skip-build
 */

import * as fs from 'fs';
import * as path from 'path';
import {expect} from '@wdio/globals';

import {ChatPage} from '../../pages/ChatPage';
import {SettingsPage} from '../../pages/SettingsPage';
import {DrawerPage} from '../../pages/DrawerPage';
import {Selectors} from '../../helpers/selectors';
import {
  downloadAndLoadModel,
  waitForInferenceComplete,
} from '../../helpers/model-actions';
import {TIMEOUTS, QUICK_TEST_MODEL} from '../../fixtures/models';
import {SCREENSHOT_DIR} from '../../wdio.shared.conf';

declare const driver: WebdriverIO.Browser;
declare const browser: WebdriverIO.Browser;

/** Tiny context so a single long reply overflows the window. */
const SMALL_N_CTX = '512';
/** A prompt that elicits a long reply, ensuring the context fills. */
const LONG_PROMPT =
  'Write a very long, richly detailed multi-paragraph story about a dragon ' +
  'who explores a vast underground kingdom. Keep going with lots of detail.';

const B = Selectors.contextBanner;

const exists = async (selector: string): Promise<boolean> =>
  browser.$(selector).isExisting();

/** Returns which context banner is currently shown, if any. */
const activeBanner = async (): Promise<'full' | 'warning' | null> => {
  if (await exists(B.full)) {
    return 'full';
  }
  if (await exists(B.warning)) {
    return 'warning';
  }
  return null;
};

/**
 * Reset the chat, send an overflowing prompt, and wait until a context banner
 * appears. Returns the banner kind. Throws (via waitUntil) if none appears.
 */
const triggerBanner = async (
  chatPage: ChatPage,
): Promise<'full' | 'warning'> => {
  await chatPage.resetChat();
  await chatPage.sendMessage(LONG_PROMPT);
  await browser.waitUntil(async () => (await activeBanner()) !== null, {
    timeout: TIMEOUTS.inference,
    interval: 1500,
    timeoutMsg: 'No context banner appeared after an overflowing reply',
  });
  // Let the turn fully settle so the snapshot is final.
  await waitForInferenceComplete().catch(() => undefined);
  return (await activeBanner()) as 'full' | 'warning';
};

describe('Context-Limit Banner', () => {
  let chatPage: ChatPage;

  before(async () => {
    chatPage = new ChatPage();
    await chatPage.waitForReady(TIMEOUTS.appReady);

    // Shrink the global context BEFORE loading so the model loads at a tiny
    // n_ctx that fills quickly.
    const settingsPage = new SettingsPage();
    await settingsPage.navigateTo();
    await settingsPage.setContextSize(SMALL_N_CTX);
    const drawerPage = new DrawerPage();
    await chatPage.openDrawer();
    await drawerPage.navigateToChat();

    // Lift n_predict so generation keeps going until it hits the context wall.
    await chatPage.openGenerationSettings();
    await chatPage.setNPredict('2000');
    await chatPage.saveGenerationSettings();

    // Smallest model for the fastest run.
    await downloadAndLoadModel(QUICK_TEST_MODEL);
  });

  beforeEach(async () => {
    chatPage = new ChatPage();
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

  it('shows no context banner on a fresh chat before any inference', async () => {
    await chatPage.resetChat();
    // A brand-new session has no completion snapshot, so no context banner.
    expect(await exists(B.full)).toBe(false);
    expect(await exists(B.warning)).toBe(false);
  });

  it('shows a context banner with a fullness meter after a reply overflows the context', async () => {
    const kind = await triggerBanner(chatPage);
    console.log(`Context banner kind after overflow: ${kind}`);
    expect(kind === 'full' || kind === 'warning').toBe(true);

    // The fullness meter renders on both nCtx-reading variants.
    expect(await exists(B.meter)).toBe(true);
  });

  it('opens the increase-context sheet from the banner and can cancel', async () => {
    // Reuse the banner from the previous test; re-trigger if it cleared.
    let kind = await activeBanner();
    if (kind === null) {
      kind = await triggerBanner(chatPage);
    }

    const increaseSelector =
      kind === 'full' ? B.fullIncrease : B.warningIncrease;

    // The increase CTA only shows when a larger tier fits the device. If it is
    // absent (device can't fit more), there is nothing to open — skip cleanly.
    if (!(await exists(increaseSelector))) {
      console.log('Increase CTA not present (no larger tier fits) — skipping');
      return;
    }

    await browser.$(increaseSelector).click();

    // The sheet shows either the confirm action (a larger size fits) or the
    // no-fit state. Either proves the sheet opened.
    await browser.waitUntil(
      async () => (await exists(B.sheetConfirm)) || (await exists(B.sheetNoFit)),
      {
        timeout: TIMEOUTS.element,
        interval: 500,
        timeoutMsg: 'Increase-context sheet did not open',
      },
    );

    // Cancel out without reloading the model.
    if (await exists(B.sheetCancel)) {
      await browser.$(B.sheetCancel).click();
      await browser
        .$(B.sheetCancel)
        .waitForDisplayed({reverse: true, timeout: TIMEOUTS.element})
        .catch(() => undefined);
    }
  });

  it('dismisses the banner', async () => {
    let kind = await activeBanner();
    if (kind === null) {
      kind = await triggerBanner(chatPage);
    }

    expect(await exists(B.dismiss)).toBe(true);
    await browser.$(B.dismiss).click();

    await browser.waitUntil(async () => (await activeBanner()) === null, {
      timeout: TIMEOUTS.element,
      interval: 500,
      timeoutMsg: 'Banner did not disappear after dismiss',
    });
  });

  it('starts a fresh, banner-free chat from the full banner', async () => {
    // This affordance lives on the full banner only.
    let kind = await activeBanner();
    if (kind !== 'full') {
      kind = await triggerBanner(chatPage);
    }
    if (kind !== 'full') {
      console.log('Could not reach a full banner — skipping new-chat check');
      return;
    }

    await browser.$(B.fullNewChat).click();

    // Banner gone and the chat is empty (no AI message in the fresh session).
    await browser.waitUntil(async () => (await activeBanner()) === null, {
      timeout: TIMEOUTS.element,
      interval: 500,
      timeoutMsg: 'Banner persisted after starting a new chat',
    });
    expect(await exists(Selectors.chat.aiMessage)).toBe(false);
  });
});
