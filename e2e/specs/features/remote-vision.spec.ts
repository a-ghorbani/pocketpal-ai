/**
 * Remote Vision Capability Feature Tests
 *
 * Exercises the llama.cpp GET /props capability-discovery path end to end:
 * a remote server that reports `modalities.vision` enables the chat image
 * attachment affordance; a server that does not keeps it disabled. This is the
 * user-visible surface of the /props -> ServerConfig.supportsVision ->
 * ModelStore.isMultimodalEnabled -> ChatInput isVisionEnabled chain.
 *
 * The attach button is always rendered (ChatScreen showImageUpload={true}); only
 * its enabled state flips with the discovered capability, so isEnabled() on the
 * "Add image" button is the assertion. (Sending an actual image needs the native
 * gallery picker, which is not automatable here; that path is covered by the
 * committed visual capture.)
 *
 * Prerequisites:
 *   - REMOTE_VISION_URL points at a llama.cpp server whose GET /props reports
 *     modalities.vision === true (e.g. a SmolVLM build).
 *   - REMOTE_NONVISION_URL (optional) points at a text-only server (no vision in
 *     /props). When unset, the negative test is skipped.
 *
 * Environment variables:
 *   REMOTE_VISION_URL         - vision-capable server (default http://192.168.0.62:1234)
 *   REMOTE_VISION_MODEL_HINT  - partial model name in the picker (default 'SmolVLM')
 *   REMOTE_NONVISION_URL      - text-only server (optional; negative test)
 *   REMOTE_NONVISION_MODEL_HINT - partial model name for the text server (optional)
 */

import * as fs from 'fs';
import * as path from 'path';
import {expect} from '@wdio/globals';
import {ChatPage} from '../../pages/ChatPage';
import {DrawerPage} from '../../pages/DrawerPage';
import {ModelsPage} from '../../pages/ModelsPage';
import {Selectors, byPartialText} from '../../helpers/selectors';
import {Gestures} from '../../helpers/gestures';
import {TIMEOUTS} from '../../fixtures/models';
import {SCREENSHOT_DIR} from '../../wdio.shared.conf';

declare const driver: WebdriverIO.Browser;
declare const browser: WebdriverIO.Browser;

const VISION_URL = process.env.REMOTE_VISION_URL || 'http://192.168.0.62:1234';
const VISION_HINT = process.env.REMOTE_VISION_MODEL_HINT || 'SmolVLM';
const NONVISION_URL = process.env.REMOTE_NONVISION_URL || '';
const NONVISION_HINT = process.env.REMOTE_NONVISION_MODEL_HINT || '';

const ADD_IMAGE_BUTTON = '~Add image';

describe('Remote Vision Capability', () => {
  let chatPage: ChatPage;
  let drawerPage: DrawerPage;
  let modelsPage: ModelsPage;

  before(async () => {
    chatPage = new ChatPage();
    drawerPage = new DrawerPage();
    modelsPage = new ModelsPage();
    await chatPage.waitForReady(TIMEOUTS.appReady);
  });

  beforeEach(() => {
    chatPage = new ChatPage();
    drawerPage = new DrawerPage();
    modelsPage = new ModelsPage();
  });

  afterEach(async function (this: Mocha.Context) {
    if (this.currentTest?.state === 'failed') {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const name = this.currentTest.title.replace(/\s+/g, '-');
      try {
        if (!fs.existsSync(SCREENSHOT_DIR)) {
          fs.mkdirSync(SCREENSHOT_DIR, {recursive: true});
        }
        await driver.saveScreenshot(
          path.join(SCREENSHOT_DIR, `failure-${name}-${ts}.png`),
        );
      } catch (e) {
        console.error('Failed to capture screenshot:', (e as Error).message);
      }
    }
  });

  /** Add a remote server, wait for the /props probe, select a model, add it. */
  async function addRemoteModel(url: string, hint: string): Promise<void> {
    await chatPage.openDrawer();
    await drawerPage.waitForOpen();
    await drawerPage.navigateToModels();
    await modelsPage.waitForReady();

    await modelsPage.openAddRemoteModel();

    const urlInput = browser.$(Selectors.remoteModel.urlInput);
    await urlInput.waitForDisplayed({timeout: 5000});
    await urlInput.clearValue();
    await urlInput.setValue(url);
    console.log(`Entered server URL: ${url}`);

    // Dismiss keyboard so it does not cover the sheet, then wait for the
    // debounced probe (models + /props) to resolve.
    await modelsPage.hideKeyboard();
    await browser.pause(3000);

    // Select the model (by hint if given, else the first radio).
    if (hint) {
      await Gestures.scrollInSheetToElementExists(byPartialText(hint), 12);
      const modelEl = browser.$(byPartialText(hint));
      const exists = await modelEl
        .waitForExist({timeout: 8000})
        .then(() => true)
        .catch(() => false);
      if (exists) {
        await modelEl.click();
        await browser.pause(500);
      }
    } else {
      const addBtn = browser.$(Selectors.remoteModel.addModelButton);
      const alreadyEnabled = await addBtn.isEnabled().catch(() => false);
      if (!alreadyEnabled) {
        const radio = '-ios predicate string:value == "radio button, unchecked"';
        await Gestures.scrollInSheetToElementExists(radio, 12);
        const firstRadio = browser.$(radio);
        const radioExists = await firstRadio
          .waitForExist({timeout: 3000})
          .then(() => true)
          .catch(() => false);
        if (radioExists) {
          await firstRadio.click();
          await browser.pause(500);
        }
      }
    }

    await Gestures.scrollInSheetToElementExists(
      Selectors.remoteModel.addModelButton,
      6,
    );
    const addButton = browser.$(Selectors.remoteModel.addModelButton);
    await addButton.waitForExist({timeout: 5000});
    await addButton.waitForEnabled({timeout: 8000});
    await addButton.click();
    await browser.pause(1000);
  }

  /** From the chat screen, open the picker and activate the remote model. */
  async function activateInChat(hint: string): Promise<void> {
    await chatPage.openDrawer();
    await drawerPage.waitForOpen();
    await drawerPage.navigateToChat();
    await chatPage.waitForReady();
    await browser.pause(3000);

    // Open the model picker. The empty-state "Select Model" button only shows
    // when no model is active; the "Select Pal" button in the input bar is
    // always present and toggles the picker, so it works whether or not a model
    // is already active (e.g. after a previous test activated one).
    const palBtn = browser.$('~Select Pal');
    const palVisible = await palBtn
      .waitForDisplayed({timeout: 10000})
      .then(() => true)
      .catch(() => false);
    if (palVisible) {
      await palBtn.click();
    } else {
      const selectModelBtn = browser.$(byPartialText('Select Model'));
      await selectModelBtn.waitForDisplayed({timeout: 10000});
      await selectModelBtn.click();
    }
    await browser.pause(1000);

    // Picker opens on the Pals tab; swipe left to the Models tab.
    const {width, height} = await driver.getWindowSize();
    await driver
      .action('pointer', {parameters: {pointerType: 'touch'}})
      .move({x: Math.round(width * 0.8), y: Math.round(height * 0.65)})
      .down()
      .move({x: Math.round(width * 0.2), y: Math.round(height * 0.65), duration: 300})
      .up()
      .perform();
    await browser.pause(1000);

    const modelEl = browser.$(byPartialText(hint));
    const visible = await modelEl
      .waitForDisplayed({timeout: 10000})
      .then(() => true)
      .catch(() => false);
    if (!visible) {
      throw new Error(`Remote model "${hint}" not found in chat picker`);
    }
    await modelEl.click();
    await browser.pause(2000);

    // Chat input should now be present with the remote model active.
    await browser.$(Selectors.chat.input).waitForDisplayed({timeout: 10000});
  }

  it('enables the image-attach button for a vision-capable remote server', async () => {
    await addRemoteModel(VISION_URL, VISION_HINT);
    await activateInChat(VISION_HINT);

    const addImage = browser.$(ADD_IMAGE_BUTTON);
    await addImage.waitForExist({timeout: 10000});
    const enabled = await addImage.isEnabled();
    console.log(`vision server -> Add image button enabled=${enabled}`);
    expect(enabled).toBe(true);
  });

  it('keeps the image-attach button disabled for a non-vision remote server', async function (this: Mocha.Context) {
    if (!NONVISION_URL) {
      console.log('REMOTE_NONVISION_URL unset — skipping non-vision case');
      this.skip();
      return;
    }
    await addRemoteModel(NONVISION_URL, NONVISION_HINT);
    await activateInChat(NONVISION_HINT);

    const addImage = browser.$(ADD_IMAGE_BUTTON);
    await addImage.waitForExist({timeout: 10000});
    const enabled = await addImage.isEnabled();
    console.log(`non-vision server -> Add image button enabled=${enabled}`);
    expect(enabled).toBe(false);
  });
});
