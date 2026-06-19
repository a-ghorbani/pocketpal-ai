/**
 * Remote Reasoning Feature Tests
 *
 * Exercises the remote (OpenAI-compatible) thinking/reasoning controls:
 *   1. Add a remote server; the probe seeds the server-type selector to
 *      "llama.cpp" (detectServerType -> seedServerType).
 *   2. Save the server and select the remote reasoning model.
 *   3. The thinking pill is reachable for the remote model (the headline fix —
 *      the pill was previously gated on a native context the remote path lacks,
 *      so it was never shown).
 *   4. Thinking ON -> a reasoning bubble renders.
 *   5. Thinking OFF -> no reasoning bubble (the server honors the off hint).
 *
 * Backend-gated, mirroring purchase-flow.spec.ts: the suite self-skips when the
 * server is unreachable so CI without the LAN server stays green.
 *
 * Requires a real llama.cpp server with a reasoning model loaded.
 *
 * Environment:
 *   E2E_LLAMACPP_SERVER_URL - server base URL
 *                             (default http://192.168.0.92:8080)
 *   E2E_LLAMACPP_MODEL_HINT - partial model name to find in pickers
 *                             (default "Qwen3-1.7B")
 *
 * Usage:
 *   npx ts-node scripts/run-e2e.ts --platform ios --spec remote-reasoning \
 *     --devices iphone-17-pro-sim --skip-build
 */

import * as fs from 'fs';
import * as http from 'http';
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

const SERVER_URL =
  process.env.E2E_LLAMACPP_SERVER_URL || 'http://192.168.0.92:8080';
const MODEL_HINT = process.env.E2E_LLAMACPP_MODEL_HINT || 'Qwen3-1.7B';

/**
 * Ping GET {SERVER_URL}/v1/models from the test host. Resolves true when the
 * server answers 2xx, false on any error or non-2xx. Used to backend-gate the
 * suite (self-skip when the server is down).
 */
function pingModelsEndpoint(timeoutMs = 4000): Promise<boolean> {
  return new Promise(resolve => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (!settled) {
        settled = true;
        resolve(ok);
      }
    };
    try {
      const req = http.get(`${SERVER_URL}/v1/models`, res => {
        const status = res.statusCode || 0;
        res.resume();
        finish(status >= 200 && status < 300);
      });
      req.setTimeout(timeoutMs, () => {
        req.destroy();
        finish(false);
      });
      req.on('error', () => finish(false));
    } catch {
      finish(false);
    }
  });
}

/**
 * Read whether a server-type chip is currently selected. react-native-paper's
 * Chip sets accessibilityState.selected, which iOS surfaces via the "selected"
 * attribute and Android via "selected"/"checked". Reads the attribute off the
 * EXISTING element — chips deep in a bottom sheet report isDisplayed=false on
 * iOS even when present, so we do not gate on visibility here.
 */
async function isServerTypeChipSelected(option: string): Promise<boolean> {
  const chip = browser.$(Selectors.serverType.chip(option));
  if (!(await chip.isExisting().catch(() => false))) {
    return false;
  }
  for (const attr of ['selected', 'checked']) {
    const raw = await chip.getAttribute(attr).catch(() => null);
    if (raw === 'true' || raw === '1') {
      return true;
    }
  }
  return false;
}

/** Dump the current page source to debug-output for diagnosis. */
async function dumpPageSource(name: string): Promise<void> {
  try {
    const dir = path.join(__dirname, '../../debug-output');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, {recursive: true});
    }
    fs.writeFileSync(path.join(dir, name), await driver.getPageSource());
    console.log(`Page source dumped to ${name}`);
  } catch (e) {
    console.log(`Failed to dump page source: ${(e as Error).message}`);
  }
}

describe('Remote Reasoning Features', () => {
  let chatPage: ChatPage;
  let drawerPage: DrawerPage;
  let modelsPage: ModelsPage;

  before(async function (this: Mocha.Context) {
    const reachable = await pingModelsEndpoint();
    if (!reachable) {
      // eslint-disable-next-line no-console
      console.log(
        `[remote-reasoning] Skipping: ${SERVER_URL}/v1/models unreachable. ` +
          'Set E2E_LLAMACPP_SERVER_URL to a running llama.cpp server.',
      );
      this.skip();
      return;
    }

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
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const name = this.currentTest.title.replace(/\s+/g, '-');
      try {
        if (!fs.existsSync(SCREENSHOT_DIR)) {
          fs.mkdirSync(SCREENSHOT_DIR, {recursive: true});
        }
        await driver.saveScreenshot(
          path.join(SCREENSHOT_DIR, `failure-${name}-${stamp}.png`),
        );
      } catch (e) {
        console.error('Failed to capture screenshot:', (e as Error).message);
      }
    }
  });

  it('probe auto-selects the "llama.cpp" server type', async () => {
    await chatPage.openDrawer();
    await drawerPage.waitForOpen();
    await drawerPage.navigateToModels();
    await modelsPage.waitForReady();

    await modelsPage.openAddRemoteModel();

    // Enter server URL and let the auto-probe fire (debounce + network).
    const urlInput = browser.$(Selectors.remoteModel.urlInput);
    await urlInput.waitForDisplayed({timeout: 5000});
    await urlInput.clearValue();
    await urlInput.setValue(SERVER_URL);
    console.log(`Entered server URL: ${SERVER_URL}`);

    // Dismiss the keyboard so it does not cover the lower sheet (it blocks
    // both the probe-revealed fields and scrolling to the chip row).
    await modelsPage.hideKeyboard();
    await browser.pause(4000);

    // The probe reveals the server fields incl. the server-type chip row.
    const connectedText = browser.$(byPartialText('Connected'));
    const isConnected = await connectedText
      .waitForDisplayed({timeout: 12000})
      .then(() => true)
      .catch(() => false);
    expect(isConnected).toBe(true);

    // Scroll the chip row into the rendered region. On iOS, chips deep in a
    // bottom sheet report isDisplayed=false, so scroll by existence.
    await Gestures.scrollInSheetToElementExists(
      Selectors.serverType.chip('llama.cpp'),
      6,
    );
    const llamaChip = browser.$(Selectors.serverType.chip('llama.cpp'));
    await llamaChip.waitForExist({timeout: 5000});

    // detectServerType -> seedServerType should pre-select "llama.cpp".
    const selected = await isServerTypeChipSelected('llama.cpp');
    expect(selected).toBe(true);
    console.log('Server type auto-selected: llama.cpp');
  });

  it('adds the remote model, selects it, and activates it in chat', async () => {
    // Scroll the reasoning model row into view, then select it. The server
    // exposes many models, so the target row is well below the fold.
    await Gestures.scrollInSheetToElementExists(byPartialText(MODEL_HINT), 12);
    const modelEl = browser.$(byPartialText(MODEL_HINT));
    const modelExists = await modelEl
      .waitForExist({timeout: 8000})
      .then(() => true)
      .catch(() => false);
    expect(modelExists).toBe(true);
    await modelEl.click();
    console.log(`Selected model matching "${MODEL_HINT}" in add sheet`);
    await browser.pause(500);

    // Scroll to and tap "Add Model" (enabled once a model is selected).
    await Gestures.scrollInSheetToElementExists(
      Selectors.remoteModel.addModelButton,
      6,
    );
    const addButton = browser.$(Selectors.remoteModel.addModelButton);
    await addButton.waitForExist({timeout: 5000});
    await addButton.waitForEnabled({timeout: 8000});
    await addButton.click();
    await browser.pause(1000);
    console.log('Remote reasoning model added');

    // Open chat and select the remote model from the picker.
    await chatPage.openDrawer();
    await drawerPage.waitForOpen();
    await drawerPage.navigateToChat();
    await browser.pause(2000);

    const selectModelBtn = browser.$(byPartialText('Select Model'));
    const needsPick = await selectModelBtn
      .waitForDisplayed({timeout: 8000})
      .then(() => true)
      .catch(() => false);
    if (needsPick) {
      await selectModelBtn.click();
      await browser.pause(1000);

      // Picker opens on the Pals tab; swipe to the Models tab.
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

      const pickerModel = browser.$(byPartialText(MODEL_HINT));
      await pickerModel.waitForExist({timeout: 10000});
      await pickerModel.click();
    }

    // Activation (setRemoteModel) is async: it releases any context and reads
    // the API key from the keychain before activeModel resolves and the chat
    // input renders. Poll until the chat input appears.
    const chatInput = browser.$(Selectors.chat.input);
    const activated = await chatInput
      .waitForDisplayed({timeout: 20000})
      .then(() => true)
      .catch(() => false);
    if (!activated) {
      await dumpPageSource('remote-not-activated.xml');
    }
    expect(activated).toBe(true);
    console.log('Remote reasoning model activated in chat');
  });

  it('exposes the thinking pill for the remote model', async () => {
    // The headline fix: the pill is reachable for a remote model whose
    // reasoning capability is "unknown" (fail-open), not gated on a native
    // context the remote path lacks. Poll because activation just settled.
    let visible = false;
    await browser.waitUntil(
      async () => {
        visible = await chatPage.isThinkingToggleVisible();
        return visible;
      },
      {timeout: 15000, interval: 1000, timeoutMsg: 'thinking pill not shown'},
    ).catch(() => undefined);
    if (!visible) {
      await dumpPageSource('remote-pill-missing.xml');
    }
    expect(visible).toBe(true);
    console.log('Thinking pill reachable for remote model');
  });

  it('renders a reasoning bubble when thinking is ON', async () => {
    await chatPage.resetChat();

    // A fresh session defaults the toggle ON; ensure it is on.
    if (!(await chatPage.isThinkingEnabled())) {
      await chatPage.tapThinkingToggle();
    }
    expect(await chatPage.isThinkingEnabled()).toBe(true);

    await chatPage.sendMessage('What is 17*23?');

    // The reasoning bubble renders as the assistant turn begins streaming, so
    // assert it during early stream — well before completion. (A reasoning
    // model on a real server returns reasoning_content first.)
    const thinkingVisible = await chatPage.isThinkingBubbleVisible(45000);
    if (!thinkingVisible) {
      await dumpPageSource('remote-reasoning-on-missing.xml');
    }
    expect(thinkingVisible).toBe(true);
    console.log('Reasoning bubble rendered with thinking ON');
  });

  it('renders no reasoning bubble when thinking is OFF', async () => {
    await chatPage.resetChat();

    // Guard against a false pass: the OFF assertion is only meaningful if the
    // pill is actually present and starts enabled (default on).
    expect(await chatPage.isThinkingEnabled()).toBe(true);

    // Disable thinking and confirm the toggle actually flipped.
    await chatPage.tapThinkingToggle();
    expect(await chatPage.isThinkingEnabled()).toBe(false);

    await chatPage.sendMessage('What is 17*23?');

    // Wait for the assistant turn to begin streaming so the absence check is
    // meaningful (not asserting before any reply has started).
    const aiMessageEl = browser.$(Selectors.chat.aiMessage);
    await aiMessageEl.waitForExist({timeout: TIMEOUTS.inference});
    await browser.pause(3000);

    // The server honors the off hint -> no reasoning_content -> no bubble.
    const thinkingVisible = await chatPage.isThinkingBubbleVisible(3000);
    if (thinkingVisible) {
      await dumpPageSource('remote-reasoning-off-present.xml');
    }
    expect(thinkingVisible).toBe(false);
    console.log('No reasoning bubble with thinking OFF (off hint honored)');
  });
});
