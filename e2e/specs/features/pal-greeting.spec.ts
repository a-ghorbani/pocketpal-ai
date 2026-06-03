/**
 * Pal Greeting E2E Test
 *
 * Round-trip test for the in-app greeting editor: create a Pal with a
 * greeting message and one suggested-prompt chip, restart the app,
 * select the pal in chat, and verify the greeting bubble + chip render.
 * Then tap the chip and verify the prompt is sent as a user message.
 *
 * Uses the smallest viable model (Qwen3-0.6B) — no tool calls are needed.
 *
 * Usage:
 *   yarn e2e:ios --spec pal-greeting --skip-build
 *   yarn e2e:android --spec pal-greeting --skip-build
 */

import * as fs from 'fs';
import * as path from 'path';
import {ChatPage} from '../../pages/ChatPage';
import {DrawerPage} from '../../pages/DrawerPage';
import {ModelsPage} from '../../pages/ModelsPage';
import {PalSheetPage} from '../../pages/PalSheetPage';
import {
  Selectors,
  byText,
  byPartialText,
} from '../../helpers/selectors';
import {
  downloadAndLoadModel,
  dismissPerformanceWarningIfPresent,
} from '../../helpers/model-actions';
import {TIMEOUTS, ALL_MODELS} from '../../fixtures/models';
import {SCREENSHOT_DIR} from '../../wdio.shared.conf';

declare const driver: WebdriverIO.Browser;
declare const browser: WebdriverIO.Browser;

const GREETING_MODEL = ALL_MODELS.find(m => m.id === 'qwen3-0.6b');
if (!GREETING_MODEL) {
  throw new Error('qwen3-0.6b model fixture missing — update e2e/fixtures/models.ts');
}

const PAL_NAME = 'Greeter';
const GREETING_TEXT = 'Hi from a friendly pal';
const SUGGESTED_PROMPT = 'Send a test message';

const getAppBundleId = (): string =>
  (driver as any).isAndroid ? 'com.pocketpalai.e2e' : 'ai.pocketpal';

describe('Pal greeting editor round-trip', () => {
  let chatPage: ChatPage;
  let drawerPage: DrawerPage;
  let palSheetPage: PalSheetPage;

  before(async () => {
    chatPage = new ChatPage();
    drawerPage = new DrawerPage();
    palSheetPage = new PalSheetPage();

    await chatPage.waitForReady(TIMEOUTS.appReady);

    // Download and load the small model. Failure here is loud (no silent skip).
    await downloadAndLoadModel(GREETING_MODEL!);
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

  it('should save a pal greeting, render bubble + chip, and send chip prompt', async () => {
    // === Phase 1: Create a Pal with greeting + chip ===

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

    await palSheetPage.setName(PAL_NAME);
    await palSheetPage.setGreetingText(GREETING_TEXT);
    await palSheetPage.addSuggestedPrompt(SUGGESTED_PROMPT);

    await palSheetPage.submit();

    // === Phase 2: Restart app to land on Chat with a clean state ===

    await browser.pause(1000);
    await driver.terminateApp(getAppBundleId());
    await browser.pause(1000);
    await driver.activateApp(getAppBundleId());
    await chatPage.waitForReady(TIMEOUTS.appReady);

    // Re-load the model — app restart clears the loaded context.
    await chatPage.openDrawer();
    await drawerPage.waitForOpen();
    await drawerPage.navigateToModels();

    const modelsPage = new ModelsPage();
    await modelsPage.waitForReady();

    const cardSelector = Selectors.modelCard.cardContainer(
      GREETING_MODEL!.downloadFile,
    );
    const modelCard = browser.$(cardSelector);
    await modelCard.waitForDisplayed({timeout: 30000});

    const loadBtn = modelCard.$(Selectors.modelCard.loadButtonElement);
    await loadBtn.waitForDisplayed({timeout: 10000});
    await loadBtn.click();

    await dismissPerformanceWarningIfPresent();
    await chatPage.waitForReady();

    // === Phase 3: Select the pal and verify greeting renders ===

    await chatPage.openPalPicker();
    await chatPage.selectPal(PAL_NAME);

    await chatPage.resetChat();
    await browser.pause(500);

    // Greeting bubble visible. iOS sometimes reports markdown-wrapped text
    // as isDisplayed=false even when on-screen; use waitForExist where the
    // tree-level presence is the contract.
    const greetingBubble = browser.$(Selectors.chat.greetingBubble);
    await greetingBubble.waitForExist({timeout: 10000});

    const greetingTextEl = browser.$(byPartialText(GREETING_TEXT));
    await greetingTextEl.waitForExist({timeout: 5000});

    // First chip visible.
    const firstChip = browser.$(Selectors.chat.suggestedPromptChip(0));
    await firstChip.waitForExist({timeout: 5000});

    // === Phase 4: Tap chip → verify user message sent ===

    await firstChip.click();

    const userMessage = browser.$(Selectors.chat.userMessage);
    await userMessage.waitForExist({timeout: 10000});

    const userPromptEl = browser.$(byPartialText(SUGGESTED_PROMPT));
    await userPromptEl.waitForExist({timeout: 5000});

    // After sending the first user message, both bubble and chip row are
    // re-gated off by the chat render. Use waitForExist + reverse so we
    // check tree-level absence consistently with the visible-state asserts.
    await greetingBubble.waitForExist({timeout: 5000, reverse: true});
    const chipRow = browser.$(Selectors.chat.suggestedPromptsRow);
    await chipRow.waitForExist({timeout: 5000, reverse: true});

    try {
      if (!fs.existsSync(SCREENSHOT_DIR)) {
        fs.mkdirSync(SCREENSHOT_DIR, {recursive: true});
      }
      await driver.saveScreenshot(
        path.join(SCREENSHOT_DIR, 'pal-greeting-result.png'),
      );
    } catch (e) {
      console.error('Failed to capture screenshot:', (e as Error).message);
    }
  });
});
