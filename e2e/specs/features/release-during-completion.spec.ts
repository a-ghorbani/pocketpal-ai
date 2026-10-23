/**
 * Release During a Completion
 *
 * Stops or releases a local model while a long prompt is still being
 * processed, then sends again through the real chat UI:
 * - Stop mid-prefill, then send at once: the new message gets a reply, with no
 *   "Context is busy" or "Completion failed" row.
 * - Home mid-prefill (the app auto-releases the context in the background),
 *   come back, send: the model reloads and the message gets a reply.
 * The app process must keep the same PID throughout.
 *
 * Usage:
 *   yarn e2e:android --spec release-during-completion --skip-build
 */

import {expect} from '@wdio/globals';
import {ChatPage} from '../../pages/ChatPage';
import {Selectors, byPartialText} from '../../helpers/selectors';
import {tapControl} from '../../helpers/control-state';
import {saveFailureScreenshot} from '../../helpers/screenshots';
import {
  downloadAndLoadModel,
  dismissContextRoomSheetIfPresent,
  readNewestTimingText,
} from '../../helpers/model-actions';
import {adb} from '../../helpers/bench-runner';
import {TIMEOUTS, TEST_MODELS, getModelsToTest} from '../../fixtures/models';

declare const driver: WebdriverIO.Browser;
declare const browser: WebdriverIO.Browser;

const ANDROID_PACKAGE = 'com.pocketpalai.e2e';
const IOS_BUNDLE_ID = 'ai.pocketpal';
const appId = (): string =>
  driver.isAndroid ? ANDROID_PACKAGE : IOS_BUNDLE_ID;

const model = process.env.TEST_MODELS
  ? getModelsToTest(true)[0]
  : TEST_MODELS.find(m => m.id === 'qwen3-0.6b')!;

// ~1,000 tokens: two prompt batches, so prefill outlasts the Stop tap or the
// trip to the home screen, while the turn after it still fits the default
// 2,048-token context.
const LONG_PROMPT =
  Array.from(
    {length: 30},
    (_, i) =>
      `Note ${i + 1}: the lighthouse keeper logged wind, tide and visibility at dawn, noon and dusk, and filed the readings in ledger ${i + 1}.`,
  ).join(' ') + ' Summarise these notes in one sentence.';
const FOLLOW_UP = 'Reply with the single word OK.';

const PREFILL_HEAD_START_MS = 1500;
// A resend after an interrupted prefill evaluates the whole prompt again, which
// takes minutes on a slow phone.
const REPLY_TIMEOUT_MS = 300000;
const STOP_TO_SEND_MS = 5000;
const BACKGROUND_MS = 10000;
const ERROR_TEXTS = ['Context is busy', 'Completion failed'];
const APP_STATE_RUNNING_IN_BACKGROUND = 3;
const APP_STATE_RUNNING_IN_FOREGROUND = 4;

async function appPid(): Promise<string> {
  if (!driver.isAndroid) {
    return '';
  }
  try {
    return adb(process.env.E2E_DEVICE_UDID, 'shell', 'pidof', ANDROID_PACKAGE);
  } catch {
    return '';
  }
}

async function expectAppAlive(pid: string, expectedState: number) {
  expect(await driver.queryAppState(appId())).toBe(expectedState);
  if (driver.isAndroid) {
    expect(await appPid()).toBe(pid);
  }
}

async function shownErrorRow(): Promise<string | undefined> {
  for (const text of ERROR_TEXTS) {
    if (
      await browser
        .$(byPartialText(text))
        .isExisting()
        .catch(() => false)
    ) {
      return text;
    }
  }
  return undefined;
}

async function expectNoErrorRow() {
  expect(await shownErrorRow()).toBeUndefined();
}

async function waitForNoRun(): Promise<void> {
  await browser
    .$(Selectors.chat.stopButton)
    .waitForExist({timeout: REPLY_TIMEOUT_MS, reverse: true});
}

async function waitForRunStart(): Promise<void> {
  await browser
    .$(Selectors.chat.stopButton)
    .waitForExist({timeout: TIMEOUTS.element});
}

async function lowestY(selector: string): Promise<number> {
  const nodes = browser.$$(selector);
  const count = await nodes.length;
  let lowest = -Infinity;
  for (let i = 0; i < count; i++) {
    lowest = Math.max(
      lowest,
      await nodes[i].getLocation('y').catch(() => -Infinity),
    );
  }
  return lowest;
}

function userBubble(message: string): string {
  return driver.isAndroid
    ? `${Selectors.chat.userMessage}//*[contains(@text, "${message}")]`
    : byPartialText(message);
}

async function replyFinishedBelow(message: string): Promise<boolean> {
  if (await browser.$(Selectors.chat.stopButton).isExisting()) {
    return false;
  }
  const bubbleY = await lowestY(userBubble(message));
  return (
    bubbleY > -Infinity &&
    (await lowestY(Selectors.chat.inferenceComplete)) > bubbleY
  );
}

/**
 * Every finished reply carries a timing label, the stopped one included, so the
 * reply to `message` is the one whose label sits below its bubble.
 * An error row ends the wait at once.
 */
async function sendAndExpectReply(
  chatPage: ChatPage,
  message: string,
): Promise<void> {
  await chatPage.sendMessage(message);
  const deadline = Date.now() + REPLY_TIMEOUT_MS;
  while (!(await replyFinishedBelow(message))) {
    const error = await shownErrorRow();
    if (error) {
      throw new Error(`"${message}" got an error row: ${error}`);
    }
    if (Date.now() > deadline) {
      throw new Error(`no finished reply below "${message}"`);
    }
    await dismissContextRoomSheetIfPresent();
    await browser.pause(1000);
  }
  console.log(
    `[release-during-completion] reply timing: ${await readNewestTimingText()}`,
  );
}

/** The input's placeholder reads "Loading model ..." until the engine is back. */
async function waitForModelReloaded(chatPage: ChatPage): Promise<void> {
  await browser.waitUntil(
    async () =>
      (await browser
        .$(Selectors.chat.input)
        .getText()
        .catch(() => '')) === 'Type your message here',
    {
      timeout: TIMEOUTS.appReady,
      interval: 1000,
      timeoutMsg: 'model did not reload after returning to the app',
    },
  );
  await chatPage.waitForReady();
}

describe('Release During a Completion', function () {
  // Qwen3-0.6B is downloaded on every fullReset run before any test starts.
  this.timeout(Math.max(Number(process.env.E2E_MOCHA_TIMEOUT) || 0, 900000));

  let chatPage: ChatPage;
  let pid: string;

  before(async () => {
    chatPage = new ChatPage();
    await chatPage.waitForReady(TIMEOUTS.appReady);

    // Short replies keep each turn well inside the default context.
    await chatPage.openGenerationSettings();
    await chatPage.setNPredict('64');
    await chatPage.saveGenerationSettings();

    await downloadAndLoadModel(model);

    // With the default idle wait every lookup blocks while tokens stream, so a
    // Stop or Home meant for prefill would land after the reply has finished.
    if (driver.isAndroid) {
      await driver.updateSettings({waitForIdleTimeout: 0});
    }
    pid = await appPid();
    console.log(`[release-during-completion] app pid: ${pid}`);
  });

  after(async () => {
    if (driver.isAndroid) {
      await driver.updateSettings({waitForIdleTimeout: 10000});
    }
  });

  afterEach(async function (this: Mocha.Context) {
    if (this.currentTest?.state === 'failed') {
      await saveFailureScreenshot(this.currentTest.title);
    }
  });

  it('replies to a message sent right after Stop during prefill', async () => {
    await chatPage.resetChat();
    await chatPage.sendMessage(LONG_PROMPT);
    await waitForRunStart();
    await browser.pause(PREFILL_HEAD_START_MS);

    const stopTappedAt = Date.now();
    await tapControl(Selectors.chat.stopButton);
    await browser.waitUntil(
      async () =>
        (await browser.$(Selectors.chat.sendButton).isDisplayed()) ||
        (await browser.$(Selectors.chat.voiceModeButton).isDisplayed()),
      {
        timeout: STOP_TO_SEND_MS,
        timeoutMsg: `Composer did not go idle within ${STOP_TO_SEND_MS}ms of Stop`,
      },
    );
    await sendAndExpectReply(chatPage, FOLLOW_UP);
    console.log(
      `[release-during-completion] Stop tap to reply done: ${Date.now() - stopTappedAt}ms`,
    );

    await expectNoErrorRow();
    await expectAppAlive(pid, APP_STATE_RUNNING_IN_FOREGROUND);
  });

  it('replies after the app is backgrounded during prefill', async () => {
    await waitForNoRun();
    await chatPage.resetChat();
    await chatPage.sendMessage(LONG_PROMPT);
    await waitForRunStart();
    await browser.pause(PREFILL_HEAD_START_MS);

    if (driver.isAndroid) {
      await driver.pressKeyCode(3);
    } else {
      await driver.execute('mobile: pressButton', {name: 'home'});
    }
    await browser.pause(BACKGROUND_MS);
    await expectAppAlive(pid, APP_STATE_RUNNING_IN_BACKGROUND);

    await driver.activateApp(appId());
    await chatPage.waitForReady(TIMEOUTS.appReady);
    await expectAppAlive(pid, APP_STATE_RUNNING_IN_FOREGROUND);
    await waitForModelReloaded(chatPage);

    await sendAndExpectReply(chatPage, FOLLOW_UP);

    await expectNoErrorRow();
    await expectAppAlive(pid, APP_STATE_RUNNING_IN_FOREGROUND);
  });
});
