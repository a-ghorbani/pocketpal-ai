/**
 * Speculative Decoding / MTP Draft-Model Feature Tests
 *
 * Validates the "speculative no-op" graceful-degradation path (the V1 gate):
 * with speculative decoding enabled globally and NO draft model paired, a
 * plain non-MTP model (qwen3-0.6b carries no embedded MTP draft layers) still
 * loads and produces inference output with no native error. The load path
 * derives embedded mode, drops `model_draft`, and runs the model normally.
 *
 * Also exercises the Settings -> Advanced Settings speculative controls and
 * captures the enabled state (draft-model picker + tuning controls).
 *
 * This is a normal RN Settings + model-load surface and runs on a
 * simulator/emulator via the standard pipeline -- it is NOT an App-Intents /
 * Shortcuts path and needs no physical device.
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

describe('Speculative Decoding / MTP draft model', () => {
  let chatPage: ChatPage;
  let settingsPage: SettingsPage;

  before(async () => {
    chatPage = new ChatPage();
    settingsPage = new SettingsPage();
    await chatPage.waitForReady(TIMEOUTS.appReady);

    // Enable speculative decoding globally BEFORE loading a model -- the flag is
    // read from contextInitParams at initLlama time. This Settings visit happens
    // while no model is loaded (clean navigation), so we also assert the enabled
    // controls render and capture them here rather than re-navigating later.
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
    await saveShot('speculative-settings-enabled');

    // The draft tuning controls render in the enabled state.
    await Gestures.scrollToElement(SPEC_GPU_LAYERS, 4);
    await browser.$(SPEC_GPU_LAYERS).waitForExist({timeout: TIMEOUTS.element});
    await saveShot('speculative-settings-controls');

    // Load a non-MTP model with speculative on and NO paired draft. Ends in chat.
    await downloadAndLoadModel(NON_MTP_MODEL);
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

  it('loads a non-MTP model with speculative enabled and no draft, producing output (V1 no-op)', async () => {
    await chatPage.resetChat();
    await chatPage.sendMessage('Hi');

    const aiMessageEl = browser.$(Selectors.chat.aiMessage);
    await aiMessageEl.waitForExist({timeout: TIMEOUTS.inference});
    await waitForInferenceComplete();

    // Output produced + no native error/crash == the speculative no-op holds.
    const textView = aiMessageEl.$(nativeTextElement());
    const responseText = await textView
      .getText()
      .catch(() => 'Unable to extract');
    console.log(`Speculative no-op response: ${responseText}`);
    expect(responseText).not.toBe('Unable to extract');
    expect(responseText.length).toBeGreaterThan(0);
    await saveShot('speculative-noop-inference');
  });
});
