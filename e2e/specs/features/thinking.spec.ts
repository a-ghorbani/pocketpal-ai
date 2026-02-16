/**
 * Thinking Model Feature Tests
 *
 * Tests thinking toggle behavior with a thinking-capable model (qwen3-0.6b).
 * Validates:
 * - Thinking toggle is visible and enabled by default
 * - Thinking bubble ("Reasoning") appears during inference
 * - AI produces a textual response
 * - Toggling thinking off suppresses the thinking bubble
 *
 * Usage:
 *   yarn e2e:ios --spec thinking --skip-build
 *   yarn e2e:android --spec thinking --skip-build
 */

import * as fs from 'fs';
import * as path from 'path';
import {expect} from '@wdio/globals';
import {ChatPage} from '../../pages/ChatPage';
import {Selectors, nativeTextElement} from '../../helpers/selectors';
import {
  downloadAndLoadModel,
  waitForInferenceComplete,
} from '../../helpers/model-actions';
import {TIMEOUTS} from '../../fixtures/models';
import {SCREENSHOT_DIR} from '../../wdio.shared.conf';

declare const driver: WebdriverIO.Browser;
declare const browser: WebdriverIO.Browser;

/** Qwen3-0.6B: small thinking-capable model */
const THINKING_MODEL = {
  id: 'qwen3-0.6b',
  searchQuery: 'bartowski Qwen_Qwen3-0.6B',
  selectorText: 'Qwen_Qwen3-0.6B',
  downloadFile: 'Qwen_Qwen3-0.6B-Q4_0.gguf',
  prompts: [{input: "What's up?", description: 'Casual greeting'}],
};

describe('Thinking Model Features', () => {
  let chatPage: ChatPage;

  before(async () => {
    chatPage = new ChatPage();
    await chatPage.waitForReady(TIMEOUTS.appReady);

    // Set temperature=0 and seed=1 for deterministic output before loading model
    await chatPage.openGenerationSettings();
    await chatPage.setTemperature('0');
    await chatPage.setSeed('1');
    await chatPage.saveGenerationSettings();

    // Download and load the thinking model
    await downloadAndLoadModel(THINKING_MODEL);
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

  it('thinking toggle should be visible and enabled by default', async () => {
    const isVisible = await chatPage.isThinkingToggleVisible();
    expect(isVisible).toBe(true);

    const isEnabled = await chatPage.isThinkingEnabled();
    expect(isEnabled).toBe(true);
  });

  it('should show thinking bubble and produce a response', async () => {
    await chatPage.resetChat();
    await chatPage.sendMessage("What's up?");

    // Wait for the AI message to appear
    const aiMessageEl = browser.$(Selectors.chat.aiMessage);
    await aiMessageEl.waitForExist({timeout: TIMEOUTS.inference});

    // The thinking bubble ("Reasoning") should appear during or after inference
    const thinkingVisible = await chatPage.isThinkingBubbleVisible(
      TIMEOUTS.inference,
    );
    expect(thinkingVisible).toBe(true);

    // Wait for inference to complete
    const timingText = await waitForInferenceComplete();
    console.log(`Thinking test timing: ${timingText}`);

    // Verify there's a text response from the AI
    const aiMessage = browser.$(Selectors.chat.aiMessage);
    const textView = aiMessage.$(nativeTextElement());
    const responseText = await textView
      .getText()
      .catch(() => 'Unable to extract');
    console.log(`Response: ${responseText}`);
    expect(responseText).not.toBe('Unable to extract');
    expect(responseText.length).toBeGreaterThan(0);
  });

  it('should not show thinking bubble when thinking is toggled off', async () => {
    // Reset chat first - new session resets thinking toggle to default (on)
    await chatPage.resetChat();

    // Now disable thinking in the new session
    await chatPage.tapThinkingToggle();
    const isEnabled = await chatPage.isThinkingEnabled();
    expect(isEnabled).toBe(false);

    // Send message with thinking disabled
    await chatPage.sendMessage("What's up?");

    // Wait for AI message to appear
    const aiMessageEl = browser.$(Selectors.chat.aiMessage);
    await aiMessageEl.waitForExist({timeout: TIMEOUTS.inference});

    // Wait for inference to complete
    await waitForInferenceComplete();

    // Thinking bubble should NOT be visible
    const thinkingVisible = await chatPage.isThinkingBubbleVisible(3000);
    expect(thinkingVisible).toBe(false);

    // Re-enable thinking for subsequent tests
    await chatPage.tapThinkingToggle();
  });
});
