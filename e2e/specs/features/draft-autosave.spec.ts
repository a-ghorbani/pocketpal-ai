/**
 * Draft Autosave Feature Tests
 *
 * Tests that unsent input text is preserved when switching between sessions
 * and restored when returning. Validates:
 * - Draft text persists across session switches
 * - Draft is cleared after sending a message
 * - Draft text in new chat persists across session switches
 *
 * Usage:
 *   yarn e2e:ios --spec draft-autosave --skip-build
 *   yarn e2e:android --spec draft-autosave --skip-build
 */

import * as fs from 'fs';
import * as path from 'path';
import {expect} from '@wdio/globals';
import {ChatPage} from '../../pages/ChatPage';
import {DrawerPage} from '../../pages/DrawerPage';
import {Selectors} from '../../helpers/selectors';
import {
  downloadAndLoadModel,
  waitForInferenceComplete,
} from '../../helpers/model-actions';
import {QUICK_TEST_MODEL, TIMEOUTS, getModelsToTest} from '../../fixtures/models';
import {SCREENSHOT_DIR} from '../../wdio.shared.conf';

declare const driver: WebdriverIO.Browser;
declare const browser: WebdriverIO.Browser;

const models = getModelsToTest(true);
const model = models[0] || QUICK_TEST_MODEL;

// Distinctive session identifiers (used as messages → become session titles)
const SESSION_A_MSG = 'DraftTestAlpha session marker';
const SESSION_B_MSG = 'DraftTestBeta session marker';
const DRAFT_TEXT = 'unsent draft text to preserve';

describe('Draft Autosave', () => {
  let chatPage: ChatPage;
  let drawerPage: DrawerPage;

  before(async () => {
    chatPage = new ChatPage();
    drawerPage = new DrawerPage();
    await chatPage.waitForReady(TIMEOUTS.appReady);

    // Download and load model (needed to create sessions by sending messages)
    console.log(`Loading model: ${model.id}`);
    await downloadAndLoadModel(model);
  });

  beforeEach(async () => {
    chatPage = new ChatPage();
    drawerPage = new DrawerPage();
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

  it('should create two sessions for draft testing', async () => {
    // Create Session A
    await chatPage.resetChat();
    await chatPage.sendMessage(SESSION_A_MSG);
    const aiMessage = browser.$(Selectors.chat.aiMessage);
    await aiMessage.waitForExist({timeout: TIMEOUTS.inference});
    await waitForInferenceComplete();
    console.log('Session A created');

    // Create Session B
    await chatPage.resetChat();
    await chatPage.sendMessage(SESSION_B_MSG);
    const aiMessage2 = browser.$(Selectors.chat.aiMessage);
    await aiMessage2.waitForExist({timeout: TIMEOUTS.inference});
    await waitForInferenceComplete();
    console.log('Session B created');
  });

  it('should preserve draft text when switching sessions', async () => {
    // We should be in Session B from the previous test
    // Type draft text but don't send
    await chatPage.typeInInput(DRAFT_TEXT);
    console.log(`Typed draft: "${DRAFT_TEXT}"`);

    // Switch to Session A
    await chatPage.openDrawer();
    await drawerPage.tapSession('DraftTestAlpha');
    console.log('Switched to Session A');

    // Verify input is empty in Session A (no draft was saved for it)
    const inputInA = await chatPage.getInputText();
    console.log(`Input in Session A: "${inputInA}"`);
    expect(inputInA).toBe('');

    // Switch back to Session B
    await chatPage.openDrawer();
    await drawerPage.tapSession('DraftTestBeta');
    console.log('Switched back to Session B');

    // Verify draft text is restored
    const restoredText = await chatPage.getInputText();
    console.log(`Restored input in Session B: "${restoredText}"`);
    expect(restoredText).toBe(DRAFT_TEXT);
  });

  it('should clear draft after sending a message', async () => {
    // We should be in Session B with the draft still in input
    // Tap send to dispatch the draft text as a message
    await chatPage.tapSendButton();

    // Wait for inference to start
    const aiMessage = browser.$(Selectors.chat.aiMessage);
    await aiMessage.waitForExist({timeout: TIMEOUTS.inference});
    await waitForInferenceComplete();

    // Switch away and back — draft should be gone (cleared on send)
    await chatPage.openDrawer();
    await drawerPage.tapSession('DraftTestAlpha');
    await chatPage.openDrawer();
    await drawerPage.tapSession('DraftTestBeta');

    const inputAfterSend = await chatPage.getInputText();
    console.log(`Input after send+switch: "${inputAfterSend}"`);
    expect(inputAfterSend).toBe('');
  });

  it('should preserve draft text in new chat state', async () => {
    // Reset to new chat
    await chatPage.resetChat();

    // Type draft in new chat (no session yet)
    const newChatDraft = 'new chat draft text';
    await chatPage.typeInInput(newChatDraft);

    // Verify the input actually has our text (React state synced)
    const typed = await chatPage.getInputText();
    console.log(`Verified typed in new chat: "${typed}"`);
    expect(typed).toBe(newChatDraft);

    // Small pause to ensure React state is fully committed
    await browser.pause(500);

    // Switch to an existing session
    await chatPage.openDrawer();
    await drawerPage.tapSession('DraftTestAlpha');
    console.log('Switched to Session A');

    // Switch back to new chat via reset
    await chatPage.resetChat();

    // Verify new chat draft is restored
    const restoredText = await chatPage.getInputText();
    console.log(`Restored in new chat: "${restoredText}"`);
    expect(restoredText).toBe(newChatDraft);
  });
});
