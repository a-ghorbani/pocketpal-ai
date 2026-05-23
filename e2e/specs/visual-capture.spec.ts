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
import {DrawerPage} from '../pages/DrawerPage';
import {ModelsPage} from '../pages/ModelsPage';
import {PalSheetPage} from '../pages/PalSheetPage';
import {Selectors, byText} from '../helpers/selectors';
import {
  downloadAndLoadModel,
  dismissPerformanceWarningIfPresent,
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

interface VisualCapturePal {
  name: string;
  systemPrompt?: string;
  talents: string[];
}

const capturesJson = process.env.VISUAL_CAPTURES;
const captures: VisualCapture[] = capturesJson
  ? JSON.parse(capturesJson)
  : [];

const palJson = process.env.VISUAL_CAPTURE_PAL;
const palConfig: VisualCapturePal | null = palJson ? JSON.parse(palJson) : null;

const models = getModelsToTest(true);
const model = models[0] || QUICK_TEST_MODEL;

const VISUAL_DIR = path.join(SCREENSHOT_DIR, 'visual-captures');

const getAppBundleId = (): string =>
  (driver as any).isAndroid ? 'com.pocketpalai.e2e' : 'ai.pocketpal';

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

    // Optional: create a Pal with talents enabled, then re-load the model
    // and select the Pal so the captures below exercise tool calls.
    if (palConfig) {
      console.log(`Creating Pal "${palConfig.name}" with talents:`,
        palConfig.talents);
      const drawerPage = new DrawerPage();
      const palSheetPage = new PalSheetPage();

      await chatPage.openDrawer();
      await drawerPage.navigateToPals();

      const addBtn = browser.$(Selectors.palsScreen.addButton);
      await addBtn.waitForDisplayed({timeout: 15000});
      await addBtn.click();
      await browser.pause(500);

      const assistantItem = browser.$(byText('Assistant'));
      await assistantItem.waitForDisplayed({timeout: 5000});
      await assistantItem.click();
      await browser.pause(500);

      await palSheetPage.setName(palConfig.name);
      if (palConfig.systemPrompt) {
        await palSheetPage.setSystemPrompt(palConfig.systemPrompt);
      }
      for (const talent of palConfig.talents) {
        await palSheetPage.enableTalent(talent);
      }
      await palSheetPage.submit();

      // Restart the app so we land back on Chat reliably; the Pal
      // persists in the DB. Then re-load the model and select the Pal.
      await browser.pause(1000);
      await driver.terminateApp(getAppBundleId());
      await browser.pause(1000);
      await driver.activateApp(getAppBundleId());
      await chatPage.waitForReady(TIMEOUTS.appReady);

      await chatPage.openDrawer();
      await drawerPage.waitForOpen();
      await drawerPage.navigateToModels();

      const modelsPage = new ModelsPage();
      await modelsPage.waitForReady();
      const cardSelector = Selectors.modelCard.cardContainer(model.downloadFile);
      const modelCard = browser.$(cardSelector);
      await modelCard.waitForDisplayed({timeout: 30000});
      const loadBtn = modelCard.$(Selectors.modelCard.loadButtonElement);
      await loadBtn.waitForDisplayed({timeout: 10000});
      await loadBtn.click();
      await dismissPerformanceWarningIfPresent();
      await chatPage.waitForReady();

      await chatPage.openPalPicker();
      await chatPage.selectPal(palConfig.name);
    }

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
