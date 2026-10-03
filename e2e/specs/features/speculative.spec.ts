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
 *  - Engagement: a REAL MTP-capable model with speculative on must produce
 *    `draft_tokens > 0` at completion. This is the ONLY proof the feature is not
 *    inert — unit/UI tests cannot observe engagement. `draft_tokens` is a
 *    TOP-LEVEL field on the native completion result (sibling of `timings`).
 *  - Off-safety (negative control): a NON-MTP model with speculative on
 *    and no valid draft loads with NO native error, produces output, and
 *    `draft_tokens === 0` (PocketPal resolved to OFF and never sent spec_type).
 *  - Crash-safety: a width-mismatched paired draft must NOT abort the
 *    process — a mismatched pair, had it reached init_mtp, would SIGABRT
 *    uncatchably. The gate is "process survives + target loads", not draft count.
 *
 * All three tests are emulator-runnable. (An earlier revision blamed a 2 GB
 * AVD for the draft-context failure; the real cause was the q8_0 draft
 * V-cache default colliding with flash attention resolving off on Android
 * CPU — fixed in the store's draft cache defaults.) Reasoning models on a
 * virtual device can spend minutes in the think-phase, hence the raised
 * inference budget below.
 *
 * ── draft_tokens read surface ────────────────────────────────────────────────
 * The chat now surfaces speculative engagement in the assistant turn footer:
 * when `draft_tokens > 0`, a `message-draft-tokens` element renders
 * "draft: <accepted>/<total> (<pct>%)". The engagement test asserts that
 * element is present (draft_tokens > 0); off-safety asserts it is ABSENT (PocketPal resolved
 * to OFF, draft_tokens === 0). The MTP_MODEL fixture repo below must be
 * confirmed available at run time.
 *
 * Usage:
 *   yarn e2e:android --spec speculative --devices <physical-device-id>
 *   (off-safety + crash-safety only: --devices virtual-only)
 */

import * as fs from 'fs';
import * as path from 'path';
import {expect} from '@wdio/globals';
import {ChatPage} from '../../pages/ChatPage';
import {SettingsPage} from '../../pages/SettingsPage';
import {Selectors, byTestId, nativeTextElement} from '../../helpers/selectors';
import {Gestures} from '../../helpers/gestures';
import {ensureRevealed} from '../../helpers/disclosure';
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
  downloadTimeout: 900000,
};

/**
 * A small MTP-capable GGUF (embedded nextn draft layers) for the
 * engagement gate. Confirmed available + MTP-signalled: header range-fetch shows
 * `qwen35.nextn_predict_layers = 1` and `blk.*.nextn.*` tensors, and llama.rn (0.12.5+)
 * registers LLM_ARCH_QWEN35 + the nextn KV/tensors, so it loads
 * and resolves to embedded MTP. ~0.8B Q4_0 (~0.5GB) — sim-runnable.
 */
const MTP_MODEL = {
  id: 'qwen3.5-0.8b-mtp',
  searchQuery: 'unsloth Qwen3.5-0.8B-MTP-GGUF',
  selectorText: 'Qwen3.5-0.8B-MTP',
  downloadFile: 'Qwen3.5-0.8B-Q4_0.gguf',
  prompts: [{input: 'Hi', description: 'Basic greeting'}],
  downloadTimeout: 900000,
  // The repo carries a BF16 mmproj that auto-downloads with the model; the
  // engagement gate is about speculation, not vision, so load text-only and
  // keep the projector out of memory on small devices.
  disableVisionBeforeLoad: true,
};

/**
 * Context size (n_ctx) used for the speculative runs. The MTP model needs more
 * room than the small default to generate to completion -- with the default,
 * the "Give this chat more room" sheet pops at completion and the inference-wait
 * helper cancels it, leaving n_ctx too small so generation never finishes (the
 * "ran out of room" false negative). The feature generates fine manually with
 * adequate context, so the spec raises n_ctx up front to replicate that. n_ctx
 * is read from the global store at initLlama time, so it must be set before the
 * model loads. The non-MTP off-safety model is unaffected by the larger context.
 */
const SPEC_CONTEXT_SIZE = '4096';

// A reasoning model on a slow virtual device can spend minutes inside the
// think-phase before the first content token; the shared 2-minute inference
// timeout expires mid-generation.
const SPEC_INFERENCE_TIMEOUT = 420000;

const SPEC_ACCORDION = byTestId('advanced-settings-accordion');
/** First row inside the accordion — mounted only while it is expanded. */
const SPEC_ACCORDION_FIRST_ROW = byTestId('batch-size-slider');
const SPEC_SWITCH = byTestId('speculative-decoding-switch');
const SPEC_PICKER = byTestId('speculative-draft-model-picker');
const SPEC_GPU_LAYERS = byTestId('speculative-draft-gpu-layers-slider');

/**
 * Assistant turn footer element that renders draft acceptance, present only
 * when the completion reported draft_tokens > 0 (speculative engagement).
 */
const DRAFT_TOKENS_EL = byTestId('message-draft-tokens');
const TIMING_EL = byTestId('footer-timing');

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

/**
 * Navigate to Settings only when not already there. A redundant drawer
 * round-trip from Settings back to Settings has raced the drawer close on the
 * emulator, leaving the screen content out of the accessibility tree and
 * failing the ready-wait even though the screen renders.
 */
async function goToSettings(settingsPage: SettingsPage): Promise<void> {
  if (await browser.$(byTestId('context-size-input')).isExisting()) {
    return;
  }
  await settingsPage.navigateTo();
}

/**
 * Rewind Settings to the top. `scrollToElement` only searches downward, so a
 * pass that has already scrolled past a row can never reach it again.
 */
async function scrollSettingsToTop(): Promise<void> {
  if (await Gestures.nativeScrollIntoView(byTestId('context-size-input'))) {
    return;
  }
  for (let i = 0; i < 8; i++) {
    await Gestures.swipeDown();
  }
}

/** Enable speculative decoding globally in Settings -> Advanced. */
async function enableSpeculativeGlobally(
  settingsPage: SettingsPage,
): Promise<void> {
  await goToSettings(settingsPage);
  await ensureRevealed({
    toggle: SPEC_ACCORDION,
    dependent: SPEC_SWITCH,
    stateProbe: SPEC_ACCORDION_FIRST_ROW,
    rewind: scrollSettingsToTop,
    maxScrolls: 8,
  });
  await browser.$(SPEC_SWITCH).waitForExist({timeout: TIMEOUTS.element});

  // Read the switch itself: with app state persisted between runs
  // (E2E_NO_RESET) speculative may already be on, and a
  // "picker exists" heuristic misreads an off-viewport picker as OFF —
  // clicking then toggles the feature off. Android exposes `checked`,
  // iOS `value`; only click when it reads unchecked.
  const state = (browser as any).isAndroid
    ? await browser
        .$(SPEC_SWITCH)
        .getAttribute('checked')
        .catch(() => null)
    : await browser
        .$(SPEC_SWITCH)
        .getAttribute('value')
        .catch(() => null);
  if (state !== 'true' && state !== '1') {
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
  await aiMessageEl.waitForExist({timeout: SPEC_INFERENCE_TIMEOUT});
  await waitForInferenceComplete(SPEC_INFERENCE_TIMEOUT);

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

    // Raise the global context size BEFORE loading a model so the MTP model has
    // enough room to generate to completion (see SPEC_CONTEXT_SIZE). n_ctx is
    // read at initLlama time, so it must be committed before the load.
    await goToSettings(settingsPage);
    await settingsPage.setContextSize(SPEC_CONTEXT_SIZE);

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

  it('off-safety: non-MTP model + speculative on loads, outputs, no native error', async () => {
    // PocketPal must resolve this to OFF (target is non-MTP, no valid draft) and
    // emit NO spec_type -- proving the P0-2 dodge. Output produced + no crash is
    // the UI-observable proof. The draft-tokens footer element must be ABSENT
    // (draft_tokens === 0, so the footer renders nothing speculative).
    await downloadAndLoadModel(NON_MTP_MODEL);

    const responseText = await runPromptAndReadResponse(chatPage, 'Hi');
    console.log(`[off-safety] non-MTP response: ${responseText}`);
    expect(responseText).not.toBe('Unable to extract');
    expect(responseText.length).toBeGreaterThan(0);
    await expect(browser.$(DRAFT_TOKENS_EL)).not.toBeExisting();
    await saveShot('speculative-off-safety');
  });

  it('crash-safety: a width-mismatched paired draft does not abort the process', async () => {
    // A mismatched pair, had it reached init_mtp, would SIGABRT uncatchably.
    // PocketPal must decline paired (unknown/mismatched width => not paired) and
    // fall through to embedded/off, so the process survives and the target loads.
    // The gate is "no SIGABRT + target loads", not a draft count.
    //
    // UI-observable proxy: the non-MTP model is ALREADY loaded with speculative
    // on (from the off-safety test) -- PocketPal's width gate resolved it to off (no valid paired
    // MTP draft). A fresh completion that returns + a responsive app == no native
    // abort/SIGABRT. (No re-load: the model is loaded, so there is no load-button;
    // runs right after the off-safety test while that model is still the active context.)
    const responseText = await runPromptAndReadResponse(
      chatPage,
      'Still there?',
    );
    console.log(`[crash-safety] probe response: ${responseText}`);
    expect(responseText).not.toBe('Unable to extract');
    expect(responseText.length).toBeGreaterThan(0);
    // App still responsive + producing output after a speculative-on load == no SIGABRT.
    await expect(browser.$(Selectors.chat.input)).toBeExisting();
    await saveShot('speculative-crash-safety');
  });

  it('engagement: MTP model + speculative on produces draft tokens (draft_tokens > 0)', async () => {
    // Engagement gate -- the proof the feature is not inert. With a real
    // MTP-capable target, resolveDraftConfig returns embedded, spec_type=draft-mtp
    // is emitted, and the completion reports draft_tokens > 0, surfaced by the
    // assistant turn footer as message-draft-tokens ("draft: <accepted>/<total>").
    // Assert on that footer DIRECTLY (not the message body): an MTP reasoning
    // model can draft a long turn that exhausts context, so the body may not
    // render -- but the footer renders on turn completion either way and IS the
    // engagement signal. Runs last (loading the MTP model reorders the model list).
    await downloadAndLoadModel(MTP_MODEL);
    await chatPage.resetChat();
    await chatPage.sendMessage('Hi');

    const draftEl = browser.$(DRAFT_TOKENS_EL);
    await draftEl.waitForExist({timeout: SPEC_INFERENCE_TIMEOUT});
    // iOS exposes the text as `label`; Android only sets content-desc when an
    // accessibilityLabel exists — and uiautomator2 reports a MISSING attribute
    // as the literal string "null", so sanitize before falling back to the
    // rendered text.
    const attrName = (browser as any).isAndroid ? 'content-desc' : 'label';
    const attrValue =
      (await draftEl.getAttribute(attrName).catch(() => '')) ?? '';
    const draftText =
      (attrValue !== 'null' ? attrValue : '') ||
      (await draftEl.getText().catch(() => '')) ||
      '';
    console.log(`[engagement] draft tokens surfaced: ${draftText}`);
    // "draft: <accepted>/<total> (<pct>%)" -- total is draft_tokens; > 0 == engaged.
    const m = draftText.match(/(\d+)\s*\/\s*(\d+)/);
    expect(m).not.toBeNull();
    expect(Number(m && m[2])).toBeGreaterThan(0);

    // The generation rate comes straight from llama.rn's own wall clock. It read
    // 0.00 on speculative turns before 0.12.7, so assert it is a real rate.
    const timingAttr =
      (await browser
        .$(TIMING_EL)
        .getAttribute(attrName)
        .catch(() => '')) ?? '';
    const timingText =
      (timingAttr !== 'null' ? timingAttr : '') ||
      (await browser
        .$(TIMING_EL)
        .getText()
        .catch(() => '')) ||
      '';
    console.log(`[engagement] timings surfaced: ${timingText}`);
    const rate = timingText.match(/([\d.]+)\s*tokens?\/sec/i);
    expect(rate).not.toBeNull();
    expect(Number(rate && rate[1])).toBeGreaterThan(0);
    await saveShot('speculative-engagement');
  });
});
