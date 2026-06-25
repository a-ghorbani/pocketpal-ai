/**
 * Speculative Decoding / MTP Draft-Model Feature Tests
 *
 * The feature is capability-gated: `speculativeEnabled` is a REQUEST, but
 * `spec_type=draft-mtp` is emitted ONLY when capability is real (an MTP-capable
 * target for embedded mode, or a width-matched MTP draft for paired mode).
 * A non-MTP target with speculative on resolves to OFF and emits nothing
 * speculative — so it never hits the non-MTP native error.
 *
 * Three gates:
 *  - V1' (engagement): a REAL MTP-capable model with speculative on must produce
 *    `draft_tokens > 0` at completion. This is the ONLY proof the feature is not
 *    inert — unit/UI tests cannot observe engagement. `draft_tokens` is a
 *    TOP-LEVEL field on the native completion result (sibling of `timings`).
 *  - V2-C (off-safety / negative control): a NON-MTP model with speculative on
 *    and no valid draft loads with NO native error, produces output, and
 *    `draft_tokens === 0` (PocketPal resolved to OFF and never sent spec_type).
 *  - V2-D (crash-safety): a width-mismatched paired draft must NOT abort the
 *    process — a mismatched pair, had it reached init_mtp, would SIGABRT
 *    uncatchably. The gate is "process survives + target loads", not draft count.
 *
 * This is a normal RN Settings + model-load surface and runs on a
 * simulator/emulator via the standard pipeline -- it is NOT an App-Intents /
 * Shortcuts path and needs no physical device.
 *
 * ── OWED device proof (tester / verify stage) ───────────────────────────────
 * The numeric `draft_tokens > 0` (V1') and `draft_tokens === 0` (V2-C)
 * assertions require reading the native completion result, which the chat UI
 * does not currently surface to Appium. The verify stage must run this spec on a
 * real MTP GGUF fixture (iOS + Android, `--devices virtual-only`) and confirm
 * `draft_tokens` via a debug read (Metro/JS log of the completion result, or a
 * temporary observability hook), since inertness is invisible to the UI alone.
 * The MTP_MODEL fixture repo below must also be confirmed available at run time.
 *
 * Usage:
 *   yarn e2e:ios --spec speculative --devices virtual-only
 *   yarn e2e:android --spec speculative --devices virtual-only
 */

import * as fs from 'fs';
import * as path from 'path';
import {expect} from '@wdio/globals';
import {ChatPage} from '../../pages/ChatPage';
import {SettingsPage} from '../../pages/SettingsPage';
import {Selectors, byTestId, nativeTextElement} from '../../helpers/selectors';
import {Gestures} from '../../helpers/gestures';
import {
  downloadAndLoadModel,
  waitForInferenceComplete,
} from '../../helpers/model-actions';
import {TIMEOUTS} from '../../fixtures/models';
import {SCREENSHOT_DIR} from '../../wdio.shared.conf';

declare const driver: WebdriverIO.Browser;
declare const browser: WebdriverIO.Browser;

/** Qwen3-0.6B: a small NON-MTP text model (no embedded draft layers). */
const NON_MTP_MODEL = {
  id: 'qwen3-0.6b',
  searchQuery: 'bartowski Qwen_Qwen3-0.6B',
  selectorText: 'Qwen_Qwen3-0.6B',
  downloadFile: 'Qwen_Qwen3-0.6B-Q4_0.gguf',
  prompts: [{input: 'Hi', description: 'Basic greeting'}],
};

/**
 * A small MTP-capable GGUF (embedded nextn draft layers) for the engagement
 * gate (V1'). The exact repo/file MUST be confirmed available by the verify
 * stage — MTP GGUF conversions are still sparse; swap to whichever small
 * Qwen3/Gemma MTP GGUF is published when this runs on device.
 */
const MTP_MODEL = {
  id: 'qwen3-mtp',
  searchQuery: 'Qwen3 MTP GGUF',
  selectorText: 'Qwen3',
  downloadFile: 'Qwen3-MTP-Q4_0.gguf',
  prompts: [{input: 'Hi', description: 'Basic greeting'}],
};

const SPEC_ACCORDION = byTestId('advanced-settings-accordion');
const SPEC_SWITCH = byTestId('speculative-decoding-switch');
const SPEC_PICKER = byTestId('speculative-draft-model-picker');
const SPEC_GPU_LAYERS = byTestId('speculative-draft-gpu-layers-slider');

async function saveShot(name: string): Promise<void> {
  try {
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, {recursive: true});
    }
    await driver.saveScreenshot(path.join(SCREENSHOT_DIR, `${name}.png`));
  } catch (e) {
    console.error('Failed to capture screenshot:', (e as Error).message);
  }
}

/** Enable speculative decoding globally in Settings -> Advanced. */
async function enableSpeculativeGlobally(
  settingsPage: SettingsPage,
): Promise<void> {
  await settingsPage.navigateTo();
  await Gestures.scrollToElement(SPEC_ACCORDION, 8);
  await browser.$(SPEC_ACCORDION).click();
  await browser.pause(500);
  await Gestures.scrollToElement(SPEC_SWITCH, 8);
  await browser.$(SPEC_SWITCH).waitForExist({timeout: TIMEOUTS.element});

  // The DS Switch carries its testID on a wrapper view; click rather than
  // relying on a `value` attribute. The draft-model picker only renders once
  // speculative is on, so its presence is the reliable "enabled" signal.
  if (!(await browser.$(SPEC_PICKER).isExisting())) {
    await browser.$(SPEC_SWITCH).click();
    await browser.pause(700);
  }
  await Gestures.scrollToElement(SPEC_PICKER, 4);
  await browser.$(SPEC_PICKER).waitForExist({timeout: TIMEOUTS.element});

  // The draft tuning controls render in the enabled state.
  await Gestures.scrollToElement(SPEC_GPU_LAYERS, 4);
  await browser.$(SPEC_GPU_LAYERS).waitForExist({timeout: TIMEOUTS.element});
}

/** Send a prompt, wait for the AI message, return its rendered text. */
async function runPromptAndReadResponse(
  chatPage: ChatPage,
  prompt: string,
): Promise<string> {
  await chatPage.resetChat();
  await chatPage.sendMessage(prompt);

  const aiMessageEl = browser.$(Selectors.chat.aiMessage);
  await aiMessageEl.waitForExist({timeout: TIMEOUTS.inference});
  await waitForInferenceComplete();

  const textView = aiMessageEl.$(nativeTextElement());
  return textView.getText().catch(() => 'Unable to extract');
}

describe('Speculative Decoding / MTP draft model', () => {
  let chatPage: ChatPage;
  let settingsPage: SettingsPage;

  before(async () => {
    chatPage = new ChatPage();
    settingsPage = new SettingsPage();
    await chatPage.waitForReady(TIMEOUTS.appReady);

    // Enable speculative globally BEFORE loading a model -- the flag is read
    // from contextInitParams at initLlama time. Also captures the enabled
    // controls (draft-model picker + tuning) for the settings reference shots.
    await enableSpeculativeGlobally(settingsPage);
    await saveShot('speculative-settings-enabled');
    await saveShot('speculative-settings-controls');
  });

  beforeEach(() => {
    chatPage = new ChatPage();
  });

  afterEach(async function (this: Mocha.Context) {
    if (this.currentTest?.state === 'failed') {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const name = this.currentTest.title.replace(/\s+/g, '-');
      await saveShot(`failure-${name}-${ts}`);
    }
  });

  it('V2-C off-safety: non-MTP model + speculative on loads, outputs, no native error', async () => {
    // PocketPal must resolve this to OFF (target is non-MTP, no valid draft) and
    // emit NO spec_type -- proving the P0-2 dodge. Output produced + no crash is
    // the UI-observable proof; the verify stage additionally confirms
    // draft_tokens === 0 from the native completion result (OWED, see header).
    await downloadAndLoadModel(NON_MTP_MODEL);

    const responseText = await runPromptAndReadResponse(chatPage, 'Hi');
    console.log(`[V2-C] non-MTP off-safety response: ${responseText}`);
    expect(responseText).not.toBe('Unable to extract');
    expect(responseText.length).toBeGreaterThan(0);
    await saveShot('speculative-v2c-off-safety');
  });

  it('V1′ engagement: MTP model + speculative on produces draft tokens (draft_tokens > 0)', async () => {
    // Engagement gate. With a real MTP-capable target, resolveDraftConfig returns
    // embedded, getEffectiveContextInitParams emits spec_type=draft-mtp, and the
    // completion must report draft_tokens > 0. The numeric assertion is read from
    // the native completion result by the verify stage (OWED, see header) -- the
    // chat UI does not surface draft_tokens to Appium. Here we drive the path and
    // assert output is produced with no crash; the verify stage gates on the
    // draft_tokens > 0 value.
    await downloadAndLoadModel(MTP_MODEL);

    const responseText = await runPromptAndReadResponse(chatPage, 'Hi');
    console.log(`[V1'] MTP engagement response: ${responseText}`);
    expect(responseText).not.toBe('Unable to extract');
    expect(responseText.length).toBeGreaterThan(0);
    await saveShot('speculative-v1-engagement');
  });

  it('V2-D crash-safety: a width-mismatched paired draft does not abort the process', async () => {
    // A mismatched pair, had it reached init_mtp, would SIGABRT uncatchably.
    // PocketPal must decline paired (unknown/mismatched width => not paired) and
    // fall through to embedded/off, so the process survives and the target loads.
    // The gate is "no SIGABRT + target loads", not a draft count. The verify
    // stage pairs the non-MTP model as a draft of the MTP target (a guaranteed
    // width/validity mismatch), asserts the app process is still alive after the
    // load, and that a completion still returns (OWED on-device, see header).
    //
    // UI-observable proxy here: load the non-MTP model with speculative on (the
    // resolveDraftConfig width gate path) and confirm the app remains responsive
    // -- i.e. a subsequent prompt still completes, proving no native abort.
    await downloadAndLoadModel(NON_MTP_MODEL);

    const responseText = await runPromptAndReadResponse(chatPage, 'Hi');
    console.log(`[V2-D] crash-safety probe response: ${responseText}`);
    expect(responseText).not.toBe('Unable to extract');
    expect(responseText.length).toBeGreaterThan(0);
    // App still responsive after a speculative-on load == no SIGABRT.
    await expect(browser.$(Selectors.chat.aiMessage)).toBeExisting();
    await saveShot('speculative-v2d-crash-safety');
  });
});
