/**
 * Visual Capture Spec
 *
 * Parametrized E2E spec that captures screenshots of features for visual
 * confirmation in PRs. Reads capture definitions from VISUAL_CAPTURES env var.
 *
 * If VISUAL_CAPTURES is not set, the spec gracefully skips all tests.
 *
 * Usage:
 *   VISUAL_CAPTURES='[{"prompt":"Create a comparison table","name":"table-rendering"}]' \
 *     yarn e2e:ios --spec visual-capture --skip-build
 *
 * Env vars:
 *   VISUAL_CAPTURES  - JSON array of {prompt, name, description?}
 *   TEST_MODELS      - Model ID to use (default: smollm2-135m)
 *
 * Examples:
 *   # Single capture
 *   VISUAL_CAPTURES='[{"prompt":"Create a 3-column table comparing Python, JS, and Rust","name":"table-rendering","description":"markdown table in chat"}]' \
 *     yarn e2e:ios --spec visual-capture --skip-build
 *
 *   # Multiple captures in one run
 *   VISUAL_CAPTURES='[
 *     {"prompt":"Create a table comparing Python vs JS","name":"table-basic","description":"basic table"},
 *     {"prompt":"Write a Python hello world with code block","name":"code-block","description":"code syntax highlighting"}
 *   ]' yarn e2e:ios --spec visual-capture --skip-build
 */

import * as fs from 'fs';
import * as path from 'path';
import {ChatPage} from '../pages/ChatPage';
import {Selectors} from '../helpers/selectors';
import {
  downloadAndLoadModel,
  waitForInferenceComplete,
} from '../helpers/model-actions';
import {QUICK_TEST_MODEL, TIMEOUTS, getModelsToTest} from '../fixtures/models';
import {SCREENSHOT_DIR} from '../wdio.shared.conf';

declare const driver: WebdriverIO.Browser;
declare const browser: WebdriverIO.Browser;

interface VisualCapture {
  /** Message to send to the model */
  prompt: string;
  /** Screenshot filename (without extension) */
  name: string;
  /** Human-readable description (used as test name) */
  description?: string;
}

const capturesJson = process.env.VISUAL_CAPTURES;
const captures: VisualCapture[] = capturesJson
  ? JSON.parse(capturesJson)
  : [];

const models = getModelsToTest();
const model = models[0] || QUICK_TEST_MODEL;

const VISUAL_DIR = path.join(SCREENSHOT_DIR, 'visual-captures');

describe('Visual Capture', () => {
  let chatPage: ChatPage;

  before(async function () {
    if (captures.length === 0) {
      console.log(
        'VISUAL_CAPTURES not set — skipping visual capture spec.',
        'Set VISUAL_CAPTURES env var with a JSON array of {prompt, name, description?}.',
      );
      this.skip();
      return;
    }

    chatPage = new ChatPage();
    await chatPage.waitForReady(TIMEOUTS.appReady);

    console.log(`Loading model: ${model.id}`);
    await downloadAndLoadModel(model);

    // Ensure screenshot output directory exists
    if (!fs.existsSync(VISUAL_DIR)) {
      fs.mkdirSync(VISUAL_DIR, {recursive: true});
    }
  });

  beforeEach(async () => {
    chatPage = new ChatPage();
  });

  afterEach(async function (this: Mocha.Context) {
    if (this.currentTest?.state === 'failed') {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const testName = this.currentTest.title.replace(/\s+/g, '-');
      try {
        if (!fs.existsSync(VISUAL_DIR)) {
          fs.mkdirSync(VISUAL_DIR, {recursive: true});
        }
        await driver.saveScreenshot(
          path.join(VISUAL_DIR, `failure-${testName}-${timestamp}.png`),
        );
      } catch (e) {
        console.error('Failed to capture failure screenshot:', (e as Error).message);
      }
    }
  });

  for (const capture of captures) {
    it(`capture: ${capture.description || capture.name}`, async () => {
      await chatPage.resetChat();
      await chatPage.sendMessage(capture.prompt);

      // Wait for AI response to appear
      const aiMessage = browser.$(Selectors.chat.aiMessage);
      await aiMessage.waitForExist({timeout: TIMEOUTS.inference});

      // Wait for inference to complete
      const timingText = await waitForInferenceComplete();
      console.log(`[${capture.name}] inference: ${timingText}`);

      // Take the screenshot
      const screenshotPath = path.join(VISUAL_DIR, `${capture.name}.png`);
      await driver.saveScreenshot(screenshotPath);
      console.log(`Screenshot saved: ${screenshotPath}`);
    });
  }
});
