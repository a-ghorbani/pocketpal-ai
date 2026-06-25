/**
 * Speculative Decoding / MTP Draft-Model Feature Tests
 *
 * Validates the "speculative no-op" graceful-degradation path (the V1 gate):
 * with speculative decoding enabled globally and NO draft model paired, a
 * plain non-MTP model (qwen3-0.6b carries no embedded MTP draft layers) still
 * loads and produces inference output with no native error. The load path
 * derives embedded mode, drops `model_draft`, and runs the model normally.
 *
 * Also exercises the Settings → Advanced Settings speculative controls and
 * captures the enabled state (draft-model picker + tuning controls).
 *
 * This is a normal RN Settings + model-load surface and runs on a
 * simulator/emulator via the standard pipeline — it is NOT an App-Intents /
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
import {Selectors, byTestId, byText, nativeTextElement} from '../../helpers/selectors';
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

const SPEC_SWITCH = byTestId('speculative-decoding-switch');
const SPEC_PICKER = byTestId('speculative-draft-model-picker');
const SPEC_DRAFT_CONTROLS = [
  'speculative-draft-model-picker',
  'speculative-draft-gpu-layers-slider',
  'speculative-draft-key-cache-button',
  'speculative-draft-value-cache-button',
];

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

/** Open Settings, expand the Advanced Settings accordion, surface the speculative switch. */
async function openSpeculativeSection(settingsPage: SettingsPage): Promise<void> {
  await settingsPage.navigateTo();
  const accordion = byText('Advanced Settings');
  await Gestures.scrollToElement(accordion, 8);
  await browser.$(accordion).click();
  await browser.pause(500);
  await Gestures.scrollToElement(SPEC_SWITCH, 8);
  await browser.$(SPEC_SWITCH).waitForExist({timeout: TIMEOUTS.element});
}

describe('Speculative Decoding / MTP draft model', () => {
  let chatPage: ChatPage;
  let settingsPage: SettingsPage;

  before(async () => {
    chatPage = new ChatPage();
    settingsPage = new SettingsPage();
    await chatPage.waitForReady(TIMEOUTS.appReady);

    // Precondition for V1: enable speculative decoding globally BEFORE loading a
    // model, since the flag is read from contextInitParams at initLlama time.
    await openSpeculativeSection(settingsPage);
    // The DS Switch carries its testID on a wrapper view; click rather than
    // relying on a `value` attribute. The draft-model picker only renders once
    // speculative is on, so its presence is our reliable "enabled" signal.
    if (!(await browser.$(SPEC_PICKER).isExisting())) {
      await browser.$(SPEC_SWITCH).click();
      await browser.pause(700);
    }
    await Gestures.scrollToElement(SPEC_PICKER, 4);
    await browser.$(SPEC_PICKER).waitForExist({timeout: TIMEOUTS.element});
    await saveShot('speculative-settings-enabled');

    // Load a non-MTP model with speculative on and NO paired draft.
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

  it('exposes the draft-model picker and tuning controls when speculative is enabled', async () => {
    await openSpeculativeSection(settingsPage);
    await Gestures.scrollToElement(SPEC_PICKER, 4);
    for (const id of SPEC_DRAFT_CONTROLS) {
      const exists = await browser.$(byTestId(id)).isExisting();
      expect(exists).toBe(true);
    }
    await saveShot('speculative-settings-controls');
  });
});
