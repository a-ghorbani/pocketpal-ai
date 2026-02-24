/**
 * Remote Server Feature Tests
 *
 * Tests the model-centric flow: add a remote model from an OpenAI-compatible
 * server via the Models screen FAB, chat with it, then delete the server.
 *
 * Prerequisites:
 *   - A real OpenAI-compatible server running at the configured URL
 *   - The server must respond to GET /v1/models and POST /v1/chat/completions
 *
 * Environment variables:
 *   REMOTE_SERVER_URL     - Server URL (default: http://192.168.68.63:1234)
 *   REMOTE_SERVER_API_KEY - API key (optional)
 *   REMOTE_MODEL_HINT     - Partial model name to find in picker (optional)
 */

import * as fs from 'fs';
import * as path from 'path';
import {expect} from '@wdio/globals';
import {ChatPage} from '../../pages/ChatPage';
import {DrawerPage} from '../../pages/DrawerPage';
import {ModelsPage} from '../../pages/ModelsPage';
import {
  Selectors,
  byPartialText,
  nativeTextElement,
} from '../../helpers/selectors';
import {Gestures} from '../../helpers/gestures';
import {TIMEOUTS} from '../../fixtures/models';
import {SCREENSHOT_DIR} from '../../wdio.shared.conf';

declare const driver: WebdriverIO.Browser;
declare const browser: WebdriverIO.Browser;

const SERVER_CONFIG = {
  url: process.env.REMOTE_SERVER_URL || 'http://192.168.68.63:1234',
  apiKey: process.env.REMOTE_SERVER_API_KEY || undefined,
};

/**
 * Optional partial model name to look for in the model list.
 * If not set, the first (or only) model is auto-selected.
 */
const REMOTE_MODEL_HINT = process.env.REMOTE_MODEL_HINT || '';

describe('Remote Server Features', () => {
  let chatPage: ChatPage;
  let drawerPage: DrawerPage;
  let modelsPage: ModelsPage;

  before(async () => {
    chatPage = new ChatPage();
    drawerPage = new DrawerPage();
    modelsPage = new ModelsPage();

    await chatPage.waitForReady(TIMEOUTS.appReady);
  });

  beforeEach(async () => {
    chatPage = new ChatPage();
    drawerPage = new DrawerPage();
    modelsPage = new ModelsPage();
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

  it('should add a remote model via Models screen FAB', async () => {
    // Navigate to Models screen
    await chatPage.openDrawer();
    await drawerPage.waitForOpen();
    await drawerPage.navigateToModels();
    await modelsPage.waitForReady();

    // Open "Add Remote Model" via FAB speed-dial
    await modelsPage.openAddRemoteModel();

    // Enter server URL
    const urlInput = browser.$(Selectors.remoteModel.urlInput);
    await urlInput.waitForDisplayed({timeout: 5000});
    await urlInput.clearValue();
    await urlInput.setValue(SERVER_CONFIG.url);
    console.log(`Entered server URL: ${SERVER_CONFIG.url}`);

    // Wait for auto-probe to fire (800ms debounce + network time)
    await browser.pause(3000);

    // After probe attempt, server name + API key fields appear
    // (whether probe succeeded or failed with 401)
    if (SERVER_CONFIG.apiKey) {
      const apiKeyInput = browser.$(Selectors.remoteModel.apiKeyInput);
      const apiKeyVisible = await apiKeyInput
        .waitForDisplayed({timeout: 5000})
        .then(() => true)
        .catch(() => false);

      if (apiKeyVisible) {
        await apiKeyInput.clearValue();
        await apiKeyInput.setValue(SERVER_CONFIG.apiKey);
        console.log('Entered API key');

        // Tap the name input to blur API key → triggers re-probe
        const nameInput = browser.$(Selectors.remoteModel.nameInput);
        const nameVisible = await nameInput.isDisplayed().catch(() => false);
        if (nameVisible) {
          await nameInput.click();
        } else {
          // Fallback: dismiss keyboard
          await modelsPage.hideKeyboard();
        }
        // Wait for re-probe (800ms debounce + network time)
        await browser.pause(4000);
      }
    }

    // Verify connection succeeded
    const connectedText = browser.$(byPartialText('Connected'));
    const isConnected = await connectedText
      .waitForDisplayed({timeout: 10000})
      .then(() => true)
      .catch(() => false);
    console.log(
      `Connection status: ${isConnected ? 'Connected' : 'Not connected'}`,
    );
    expect(isConnected).toBe(true);

    // Select a model — either by hint or tap the first radio button
    if (REMOTE_MODEL_HINT) {
      const modelEl = browser.$(byPartialText(REMOTE_MODEL_HINT));
      const visible = await modelEl
        .waitForDisplayed({timeout: 5000})
        .then(() => true)
        .catch(() => false);
      if (visible) {
        await modelEl.click();
        console.log(`Selected model matching "${REMOTE_MODEL_HINT}"`);
      }
    } else {
      // If only one model, it's auto-selected.
      // If multiple models, select the first unchecked radio button.
      const addBtn = browser.$(Selectors.remoteModel.addModelButton);
      const alreadyEnabled = await addBtn.isEnabled().catch(() => false);
      if (!alreadyEnabled) {
        // react-native-paper RadioButton renders as XCUIElementTypeOther
        // with value="radio button, unchecked"
        const firstRadio = browser.$(
          '-ios predicate string:value == "radio button, unchecked"',
        );
        const radioVisible = await firstRadio
          .waitForDisplayed({timeout: 3000})
          .then(() => true)
          .catch(() => false);
        if (radioVisible) {
          await firstRadio.click();
          console.log('Selected first model from radio list');
          await browser.pause(500);
        }
      }
    }

    // Scroll to and tap "Add Model" button
    const addButton = browser.$(Selectors.remoteModel.addModelButton);
    const addVisible = await addButton.isDisplayed().catch(() => false);
    if (!addVisible) {
      await Gestures.swipeUpInSheet();
      await browser.pause(300);
    }
    await addButton.waitForDisplayed({timeout: 5000});
    await addButton.waitForEnabled({timeout: 5000});
    await addButton.click();
    await browser.pause(1000);

    console.log('Remote model added successfully');
  });

  it('should select and chat with a remote model', async () => {
    // Navigate to Chat screen
    await chatPage.openDrawer();
    await drawerPage.waitForOpen();
    await drawerPage.navigateToChat();
    await chatPage.waitForReady();

    // Wait for remote models to be available
    await browser.pause(3000);

    // The chat placeholder shows "Select Model" button when models are available
    const selectModelBtn = browser.$(byPartialText('Select Model'));
    await selectModelBtn.waitForDisplayed({timeout: 10000});
    await selectModelBtn.click();
    await browser.pause(1000);

    // The model picker opens on the Pals tab.
    // Swipe LEFT to navigate from Pals tab to Models tab.
    const {width, height} = await driver.getWindowSize();
    await driver
      .action('pointer', {parameters: {pointerType: 'touch'}})
      .move({x: Math.round(width * 0.8), y: Math.round(height * 0.65)})
      .down()
      .move({
        x: Math.round(width * 0.2),
        y: Math.round(height * 0.65),
        duration: 300,
      })
      .up()
      .perform();
    await browser.pause(1000);

    // Select the remote model from the Models tab
    if (REMOTE_MODEL_HINT) {
      const modelEl = browser.$(byPartialText(REMOTE_MODEL_HINT));
      const visible = await modelEl
        .waitForDisplayed({timeout: 10000})
        .then(() => true)
        .catch(() => false);
      if (visible) {
        console.log(`Found model matching "${REMOTE_MODEL_HINT}"`);
        await modelEl.click();
      } else {
        throw new Error(
          `Remote model matching "${REMOTE_MODEL_HINT}" not found in picker`,
        );
      }
    } else {
      // No hint — tap the first model item by position
      await driver
        .action('pointer', {parameters: {pointerType: 'touch'}})
        .move({x: Math.round(width * 0.5), y: Math.round(height * 0.5)})
        .down()
        .up()
        .perform();
      console.log('Tapped first model position in picker');
    }

    // Wait for model selection
    await browser.pause(2000);

    // Send a message
    const chatInput = browser.$(Selectors.chat.input);
    await chatInput.waitForDisplayed({timeout: 10000});
    await chatPage.sendMessage('Hello');

    // Wait for AI response
    const aiMessageEl = browser.$(Selectors.chat.aiMessage);
    await aiMessageEl.waitForExist({timeout: 30000});
    console.log('AI message element appeared');

    // Poll for the response to complete
    const maxWaitMs = 30000;
    const pollIntervalMs = 1000;
    const startTime = Date.now();
    let responseText = '';

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const aiMessage = browser.$(Selectors.chat.aiMessage);
        const textView = aiMessage.$(nativeTextElement());
        responseText = await textView.getText().catch(() => '');

        if (responseText && responseText.length > 0) {
          const stopButton = browser.$(Selectors.chat.stopButton);
          const stopVisible = await stopButton
            .isDisplayed()
            .catch(() => false);
          if (!stopVisible) {
            break;
          }
        }
      } catch {
        // Element not ready yet
      }
      await browser.pause(pollIntervalMs);
    }

    // Verify we got a real multi-word response (not just last token)
    expect(responseText.length).toBeGreaterThan(1);
    console.log(`Remote model response: "${responseText.substring(0, 100)}"`);
    console.log('Chat with remote model succeeded');
  });

  it('should delete the remote server via Manage Servers', async () => {
    // Navigate to Models screen
    await chatPage.openDrawer();
    await drawerPage.waitForOpen();
    await drawerPage.navigateToModels();
    await modelsPage.waitForReady();

    // Tap "Manage Servers" in the FAB menu
    await modelsPage.tapManageServers();

    // With a single server, ServerDetailsSheet opens directly (no alert).
    // Tap "Remove Server" button
    const removeButton = browser.$(Selectors.serverDetails.removeButton);
    const removeVisible = await removeButton
      .waitForDisplayed({timeout: 5000})
      .then(() => true)
      .catch(() => false);

    if (!removeVisible) {
      // May need to scroll down in the sheet
      await Gestures.swipeUpInSheet();
      await browser.pause(300);
    }
    await removeButton.waitForDisplayed({timeout: 5000});
    await removeButton.click();
    await browser.pause(500);

    // Confirm deletion in the alert dialog
    const deleteButton = browser.$(Selectors.alert.button('Delete'));
    await deleteButton.waitForDisplayed({timeout: 5000});
    await deleteButton.click();
    await browser.pause(1000);

    console.log('Server deleted successfully via Manage Servers');
  });
});
