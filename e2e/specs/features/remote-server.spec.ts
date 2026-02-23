/**
 * Remote Server Feature Tests
 *
 * Tests adding an OpenAI-compatible remote server, selecting a remote model
 * from the model picker, and chatting with it.
 *
 * Prerequisites:
 *   - A real OpenAI-compatible server running at the configured URL
 *   - The server must respond to GET /v1/models and POST /v1/chat/completions
 *
 * Environment variables:
 *   REMOTE_SERVER_URL   - Server URL (default: http://192.168.68.63:8000)
 *   REMOTE_SERVER_NAME  - Display name (default: Test Server)
 *   REMOTE_SERVER_API_KEY - API key (optional)
 *   REMOTE_MODEL_HINT   - Partial model name to find in picker (optional)
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
  isAndroid,
} from '../../helpers/selectors';
import {Gestures} from '../../helpers/gestures';
import {TIMEOUTS} from '../../fixtures/models';
import {SCREENSHOT_DIR} from '../../wdio.shared.conf';

declare const driver: WebdriverIO.Browser;
declare const browser: WebdriverIO.Browser;

const SERVER_CONFIG = {
  name: process.env.REMOTE_SERVER_NAME || 'Test Server',
  url: process.env.REMOTE_SERVER_URL || 'http://192.168.68.63:8000',
  apiKey: process.env.REMOTE_SERVER_API_KEY || undefined,
};

/**
 * Optional partial model name to look for in the picker.
 * If not set, the test taps the first model item by position.
 */
const REMOTE_MODEL_HINT = process.env.REMOTE_MODEL_HINT || '';

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

  it('should select and chat with a remote model', async () => {
    // Navigate back to Chat screen
    await chatPage.openDrawer();
    await drawerPage.waitForOpen();
    await drawerPage.navigateToChat();
    await chatPage.waitForReady();

    // Wait for remote models to be fetched from the server
    await browser.pause(3000);

    // The placeholder shows "Activate Model To Get Started" with a "Select Model"
    // button when remote models are available. Tap it to open the model picker.
    const selectModelBtn = browser.$(byText('Select Model'));
    await selectModelBtn.waitForDisplayed({timeout: 10000});
    await selectModelBtn.click();
    await browser.pause(1000);

    // The model picker (ChatPalModelPickerSheet) opens on the Pals tab.
    // The tabs are [Pals, Models] rendered in a horizontal FlatList with paging.
    // Swipe LEFT to navigate from Pals tab to Models tab.
    // This avoids text selector conflicts with the drawer's "Models" button.
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

    // Now on the Models tab, remote models should be listed.
    // Find and tap a remote model.
    if (REMOTE_MODEL_HINT) {
      // Use the hint to find a specific model
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
      // No hint provided — tap the first model item by position.
      // The picker sheet covers the bottom ~70% of screen. Tab labels are near
      // the top of the sheet (~42% from top). First model item is below that.
      await driver
        .action('pointer', {parameters: {pointerType: 'touch'}})
        .move({x: Math.round(width * 0.5), y: Math.round(height * 0.5)})
        .down()
        .up()
        .perform();
      console.log('Tapped first model position in picker');
    }

    // Wait for model selection to complete
    await browser.pause(2000);

    // After selecting a remote model, the placeholder should disappear.
    // Send a message.
    const chatInput = browser.$(Selectors.chat.input);
    await chatInput.waitForDisplayed({timeout: 10000});

    await chatPage.sendMessage('Hello');

    // Wait for AI message to appear
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
          const stopVisible = await stopButton.isDisplayed().catch(() => false);
          if (!stopVisible) {
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

    // Settings may already be scrolled down from previous test navigation.
    // Skip waitForReady() (which looks for gpu-layers-slider at top) and
    // go directly to scrolling to the Remote Servers section.
    await browser.pause(1000);

    // Scroll to the Remote Servers section
    const found = await settingsPage.scrollToRemoteServers();
    expect(found).toBe(true);

    // The server entry should be visible
    const serverVisible = await settingsPage.isServerVisible(
      SERVER_CONFIG.name,
    );
    expect(serverVisible).toBe(true);

    // Find and tap the delete button for the server.
    let deleteTapped = false;

    if (!isAndroid()) {
      const deleteButtons = await browser.$$(
        '-ios predicate string:name BEGINSWITH "server-delete-"',
      );
      if (deleteButtons.length > 0) {
        await deleteButtons[deleteButtons.length - 1].click();
        deleteTapped = true;
      }
    } else {
      const deleteButtons = await browser.$$(
        '//*[contains(@resource-id, "server-delete-")]',
      );
      if (deleteButtons.length > 0) {
        await deleteButtons[deleteButtons.length - 1].click();
        deleteTapped = true;
      }
    }

    expect(deleteTapped).toBe(true);

    // Confirm deletion in the alert dialog
    await browser.pause(500);
    const deleteButton = browser.$(Selectors.alert.button('Delete'));
    await deleteButton.waitForDisplayed({timeout: 5000});
    await deleteButton.click();
    await browser.pause(500);

    // Verify the server is no longer visible
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
