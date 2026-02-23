/**
 * Remote Server Feature Tests
 *
 * Tests adding an OpenAI-compatible remote server, verifying remote models
 * appear in the model picker, and chatting with a remote model.
 *
 * Prerequisites:
 *   - A real OpenAI-compatible server running at the configured URL
 *   - The server must respond to GET /v1/models and POST /v1/chat/completions
 *
 * Usage:
 *   yarn e2e:ios --spec remote-server --skip-build
 *   yarn e2e:android --spec remote-server --skip-build
 */

import * as fs from 'fs';
import * as path from 'path';
import {expect} from '@wdio/globals';
import {ChatPage} from '../../pages/ChatPage';
import {DrawerPage} from '../../pages/DrawerPage';
import {SettingsPage} from '../../pages/SettingsPage';
import {
  Selectors,
  byText,
  byPartialText,
  nativeTextElement,
} from '../../helpers/selectors';
import {TIMEOUTS} from '../../fixtures/models';
import {SCREENSHOT_DIR} from '../../wdio.shared.conf';

declare const driver: WebdriverIO.Browser;
declare const browser: WebdriverIO.Browser;

/**
 * Remote server configuration.
 * Override via environment variables if needed:
 *   REMOTE_SERVER_URL, REMOTE_SERVER_NAME, REMOTE_SERVER_API_KEY
 */
const SERVER_CONFIG = {
  name: process.env.REMOTE_SERVER_NAME || 'Test Server',
  url: process.env.REMOTE_SERVER_URL || 'http://192.168.68.63:8000',
  apiKey: process.env.REMOTE_SERVER_API_KEY || undefined,
};

describe('Remote Server Features', () => {
  let chatPage: ChatPage;
  let drawerPage: DrawerPage;
  let settingsPage: SettingsPage;

  before(async () => {
    chatPage = new ChatPage();
    drawerPage = new DrawerPage();
    settingsPage = new SettingsPage();

    await chatPage.waitForReady(TIMEOUTS.appReady);
  });

  beforeEach(async () => {
    chatPage = new ChatPage();
    drawerPage = new DrawerPage();
    settingsPage = new SettingsPage();
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

  it('should add a remote server and test connection', async () => {
    // Navigate: Chat -> Drawer -> Settings
    await chatPage.openDrawer();
    await drawerPage.waitForOpen();
    await drawerPage.navigateToSettings();
    await settingsPage.waitForReady();

    // Add the remote server (scrolls, fills form, tests, saves)
    await settingsPage.addRemoteServer(
      SERVER_CONFIG.name,
      SERVER_CONFIG.url,
      SERVER_CONFIG.apiKey,
    );

    // Verify the server appears in the settings list
    const serverVisible = await settingsPage.isServerVisible(
      SERVER_CONFIG.name,
    );
    expect(serverVisible).toBe(true);
    console.log(
      `Server "${SERVER_CONFIG.name}" added and visible in settings`,
    );
  });

  it('should show remote models in the model picker', async () => {
    // Navigate back to Chat screen
    await chatPage.openDrawer();
    await drawerPage.waitForOpen();
    await drawerPage.navigateToChat();
    await chatPage.waitForReady();

    // Tap the chat input area to trigger the model picker
    // The model picker shows both local and remote models
    const chatInput = browser.$(Selectors.chat.input);
    await chatInput.waitForDisplayed({timeout: 5000});
    await chatInput.click();

    // Wait briefly for the model picker to appear
    await browser.pause(1000);

    // Look for the remote model name in the picker
    // Remote model names match the model ID from the server (e.g., "tiny-aya-global-q4_k_m.gguf")
    const remoteModelElement = browser.$(byPartialText('tiny-aya'));
    const modelVisible = await remoteModelElement
      .isDisplayed()
      .catch(() => false);

    if (modelVisible) {
      console.log('Remote model found in model picker');
      expect(modelVisible).toBe(true);
    } else {
      // The model picker might need the "Models" tab to be selected
      // Try tapping the Models tab within the picker
      const modelsTab = browser.$(byText('Models'));
      const tabExists = await modelsTab.isExisting().catch(() => false);
      if (tabExists) {
        await modelsTab.click();
        await browser.pause(500);
      }

      const modelVisibleAfterTab = await browser
        .$(byPartialText('tiny-aya'))
        .isDisplayed()
        .catch(() => false);
      expect(modelVisibleAfterTab).toBe(true);
      console.log('Remote model found in model picker (after switching tab)');
    }
  });

  it('should chat with a remote model', async () => {
    // Make sure we are on the chat screen
    const chatDisplayed = await chatPage.isDisplayed();
    if (!chatDisplayed) {
      await chatPage.openDrawer();
      await drawerPage.waitForOpen();
      await drawerPage.navigateToChat();
      await chatPage.waitForReady();
    }

    // Open the model picker by tapping the input
    const chatInput = browser.$(Selectors.chat.input);
    await chatInput.waitForDisplayed({timeout: 5000});
    await chatInput.click();
    await browser.pause(1000);

    // Navigate to Models tab if needed and select the remote model
    const modelsTab = browser.$(byText('Models'));
    const tabExists = await modelsTab.isExisting().catch(() => false);
    if (tabExists && (await modelsTab.isDisplayed().catch(() => false))) {
      await modelsTab.click();
      await browser.pause(500);
    }

    // Tap the remote model to select it
    const remoteModelElement = browser.$(byPartialText('tiny-aya'));
    await remoteModelElement.waitForDisplayed({timeout: 10000});
    await remoteModelElement.click();
    await browser.pause(1000);

    // The model picker should close and the model should be selected
    // Now send a message
    await chatPage.waitForReady();
    await chatPage.resetChat();
    await chatPage.sendMessage('Hello');

    // Wait for AI message to appear (remote model responds quickly)
    const aiMessageEl = browser.$(Selectors.chat.aiMessage);
    await aiMessageEl.waitForExist({timeout: 30000});
    console.log('AI message element appeared');

    // Wait for the response to complete
    // For remote models, poll for the message content to stabilize
    // Remote models may not show the same "tokens/sec" timing as local models
    // so we poll for the AI message text to be non-empty
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
          // Check if inference is still ongoing by looking for the stop button
          const stopButton = browser.$(Selectors.chat.stopButton);
          const stopVisible = await stopButton.isDisplayed().catch(() => false);
          if (!stopVisible) {
            // Inference complete - stop button gone
            break;
          }
        }
      } catch {
        // Element not ready yet
      }
      await browser.pause(pollIntervalMs);
    }

    expect(responseText.length).toBeGreaterThan(0);
    console.log(`Remote model response: "${responseText.substring(0, 100)}"`);
    console.log('Chat with remote model succeeded');
  });

  it('should delete the remote server', async () => {
    // Navigate to Settings
    await chatPage.openDrawer();
    await drawerPage.waitForOpen();
    await drawerPage.navigateToSettings();
    await settingsPage.waitForReady();

    // Scroll to the Remote Servers section
    const found = await settingsPage.scrollToRemoteServers();
    expect(found).toBe(true);

    // The server entry should be visible
    const serverVisible = await settingsPage.isServerVisible(
      SERVER_CONFIG.name,
    );
    expect(serverVisible).toBe(true);

    // Find and tap the delete button for the server
    // The delete button testID pattern is `server-delete-${server.id}`
    // Since we don't know the server ID, use the delete icon near the server name.
    // We find the delete icon by looking for all elements with "delete-outline" icon
    // near the server name. The simplest approach: find any delete touchable
    // with a testID starting with "server-delete-".
    const deleteButtons = browser.$$('-ios predicate string:name BEGINSWITH "server-delete-"');
    let deleteCount = 0;

    try {
      deleteCount = await deleteButtons.length;
    } catch {
      // Fallback for Android
    }

    if (deleteCount > 0) {
      // Tap the last (or only) delete button
      await deleteButtons[deleteCount - 1].click();
    } else {
      // Fallback: try Android XPath
      const androidDeleteButtons = browser.$$(
        '//*[contains(@resource-id, "server-delete-")]',
      );
      const androidCount = await androidDeleteButtons.length;
      if (androidCount > 0) {
        await androidDeleteButtons[androidCount - 1].click();
      } else {
        throw new Error('Could not find server delete button');
      }
    }

    // Confirm deletion in the alert dialog
    await browser.pause(500);
    const deleteButton = browser.$(Selectors.alert.button('Delete'));
    await deleteButton.waitForDisplayed({timeout: 5000});
    await deleteButton.click();
    await browser.pause(500);

    // Verify the server is no longer visible
    // The "Add Server" button should now show the empty state again
    const addButton = browser.$(Selectors.serverConfig.addServerButton);
    await addButton.waitForDisplayed({timeout: 5000});

    const serverStillVisible = await settingsPage.isServerVisible(
      SERVER_CONFIG.name,
      2000,
    );
    expect(serverStillVisible).toBe(false);
    console.log(`Server "${SERVER_CONFIG.name}" deleted successfully`);
  });
});
