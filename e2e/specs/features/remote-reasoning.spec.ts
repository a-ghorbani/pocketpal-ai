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
import {
  Selectors,
  byPartialText,
  isAndroid,
  nativeTextElement,
} from '../../helpers/selectors';
import {Gestures} from '../../helpers/gestures';
import {readControlEnabled, tapControl} from '../../helpers/control-state';
import {saveFailureScreenshot} from '../../helpers/screenshots';
import {TIMEOUTS} from '../../fixtures/models';

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
 * Read the value shown on the server-type dropdown trigger. The ui Dropdown
 * renders the selected option's label as both the trigger's accessibilityLabel
 * and a child Text node. Reads off the EXISTING element — the trigger deep in a
 * bottom sheet can report isDisplayed=false on iOS even when present, so we do
 * not gate on visibility here.
 *
 * Cross-platform read: on iOS the accessibilityLabel surfaces via the trigger's
 * "label"/"name"/"value" attributes. On Android (UiAutomator2) it maps to
 * content-desc, and the trigger's own "text" is empty because the visible value
 * lives in a child TextView — so we also try content-desc and the child Text.
 */
async function readServerTypeValue(): Promise<string> {
  const trigger = browser.$(Selectors.serverType.dropdown());
  if (!(await trigger.isExisting().catch(() => false))) {
    return '';
  }
  const attrs = isAndroid()
    ? ['content-desc', 'label', 'name', 'value']
    : ['label', 'name', 'value'];
  for (const attr of attrs) {
    const raw = await trigger.getAttribute(attr).catch(() => null);
    if (raw) {
      return raw;
    }
  }
  const direct = (await trigger.getText().catch(() => '')) || '';
  if (direct) {
    return direct;
  }
  // Fall back to the child Text node (Android renders the value there).
  const childText = await trigger
    .$(nativeTextElement())
    .getText()
    .catch(() => '');
  return childText || '';
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

/**
 * Enter the server URL and wait for the probe to report "Connected", retyping
 * the URL to re-fire it on failure.
 *
 * The probe settles into a terminal "Connection failed" state, so a longer wait
 * cannot rescue a transient network error — only another probe can.
 */
async function probeUntilConnected(
  modelsPage: ModelsPage,
  attempts = 3,
): Promise<boolean> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const urlInput = browser.$(Selectors.remoteModel.urlInput);
    await urlInput.waitForDisplayed({timeout: 5000});
    await urlInput.clearValue();
    await urlInput.setValue(SERVER_URL);

    // Dismiss the keyboard so it does not cover the lower sheet (it blocks
    // both the probe-revealed fields and scrolling to the dropdown).
    await modelsPage.hideKeyboard();

    const connected = await browser
      .$(byPartialText('Connected'))
      .waitForDisplayed({timeout: 15000})
      .then(() => true)
      .catch(() => false);
    if (connected) {
      console.log(`Probe connected to ${SERVER_URL} (attempt ${attempt})`);
      return true;
    }
    console.log(`Probe attempt ${attempt} did not connect; re-firing`);
    await browser.pause(1000);
  }
  return false;
}

/**
 * Wait for any in-flight assistant turn to finish, so the composer is back to
 * Send rather than Stop.
 */
async function waitForTurnToSettle(
  timeout = TIMEOUTS.inference,
): Promise<void> {
  await browser
    .waitUntil(
      async () =>
        !(await browser
          .$(Selectors.chat.stopButton)
          .isDisplayed()
          .catch(() => false)),
      {timeout, interval: 1000},
    )
    .catch(() => undefined);
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
      await saveFailureScreenshot(this.currentTest.title);
    }
  });

  it('probe auto-selects the "llama.cpp" server type', async () => {
    await chatPage.openDrawer();
    await drawerPage.waitForOpen();
    await drawerPage.navigateToModels();
    await modelsPage.waitForReady();

    await modelsPage.openAddRemoteModel();

    // The probe reveals the server fields incl. the server-type dropdown.
    const isConnected = await probeUntilConnected(modelsPage);
    expect(isConnected).toBe(true);

    // Scroll the dropdown trigger into the rendered region. On iOS, controls
    // deep in a bottom sheet report isDisplayed=false, so scroll by existence.
    await Gestures.scrollInSheetToElementExists(
      Selectors.serverType.dropdown(),
      6,
    );
    const trigger = browser.$(Selectors.serverType.dropdown());
    await trigger.waitForExist({timeout: 5000});

    // detectServerType -> seedServerType should pre-select "llama.cpp"; the
    // dropdown trigger shows that seeded value.
    const value = await readServerTypeValue();
    expect(value).toContain('llama.cpp');
    console.log(`Server type auto-selected: ${value}`);
  });

  it('adds the remote model, selects it, and activates it in chat', async () => {
    // Scroll the reasoning model row into view, then select it. The server
    // exposes many models, so the target row is well below the fold.
    // Unscrolled the list is clipped to a few px and the pinned Add Model
    // button overlaps its first row, so a tap at the row's centre lands on that
    // button. Expand the sheet first, then require the row to be clear of it.
    await Gestures.swipeUpInSheetBelowInputs();
    await browser.pause(400);
    const rowSelector = byPartialText(MODEL_HINT);
    const modelReachable = await Gestures.scrollInSheetClearOfOverlay(
      rowSelector,
      Selectors.remoteModel.addModelButton,
      12,
      Gestures.swipeUpInSheetBelowInputs,
    );
    expect(modelReachable).toBe(true);
    await tapControl(rowSelector);
    console.log(`Selected model matching "${MODEL_HINT}" in add sheet`);
    await browser.pause(500);

    const addButton = browser.$(Selectors.remoteModel.addModelButton);
    await addButton.waitForExist({timeout: 5000});
    await browser.waitUntil(
      () => readControlEnabled(Selectors.remoteModel.addModelButton),
      {
        timeout: 8000,
        timeoutMsg: 'Add Model stayed disabled: no model was selected',
      },
    );
    await tapControl(Selectors.remoteModel.addModelButton);
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
      await tapControl(byPartialText('Select Model'));
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
      await tapControl(byPartialText(MODEL_HINT));
    }

    // Activation (setRemoteModel) is async: it releases any context and reads
    // the API key from the keychain before activeModel resolves and the chat
    // input renders. Poll until the chat input appears.
    // The chat input is present whether or not a model is active -- when none
    // is, it just reads "Model not loaded". Wait for that text to go away, or a
    // failed activation passes here and every later test runs against a chat
    // with no model.
    const chatInput = browser.$(Selectors.chat.input);
    await chatInput.waitForDisplayed({timeout: 20000}).catch(() => undefined);
    const activated = await browser
      .waitUntil(
        async () => {
          const placeholder = await chatInput.getText().catch(() => '');
          return !placeholder.includes('Model not loaded');
        },
        {timeout: 20000, interval: 1000},
      )
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
    await browser
      .waitUntil(
        async () => {
          visible = await chatPage.isThinkingToggleVisible();
          return visible;
        },
        {timeout: 15000, interval: 1000, timeoutMsg: 'thinking pill not shown'},
      )
      .catch(() => undefined);
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
    // The ON test asserts during early stream and returns while the turn is
    // still generating; until it finishes the composer shows Stop, not Send.
    await waitForTurnToSettle();
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
