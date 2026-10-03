import {expect} from '@wdio/globals';
import {Gestures} from './gestures';
import {Selectors, byPartialText, nativeTextElement} from './selectors';

declare const browser: WebdriverIO.Browser;
declare const driver: WebdriverIO.Browser;

export interface FixtureStatus {
  requestCount: number;
  requests: Array<{
    id: number;
    method: string;
    path: string;
    headers: Record<string, string | string[]>;
    authorizationPresent: boolean;
    authorizationScheme?: string;
    body?: any;
    scenario?: string;
    completed: boolean;
    aborted: boolean;
  }>;
  toolReplayValidated: boolean;
  scoutToolsValidated: boolean;
  scoutCalculateValidated: boolean;
  scoutHtmlValidated: boolean;
  scoutSearchValidated: boolean;
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    return await fetch(input, {...init, signal: controller.signal});
  } finally {
    clearTimeout(timer);
  }
}

export async function fixtureStatus(baseUrl: string): Promise<FixtureStatus> {
  const response = await fetchWithTimeout(`${baseUrl}/__fixture/status`, {});
  if (!response.ok) {
    throw new Error(`Fixture status failed with HTTP ${response.status}`);
  }
  return (await response.json()) as FixtureStatus;
}

export async function resetFixture(baseUrl: string): Promise<void> {
  const response = await fetchWithTimeout(`${baseUrl}/__fixture/reset`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error(`Fixture reset failed with HTTP ${response.status}`);
  }
}

export async function selectChatModel(modelId: string): Promise<void> {
  const selectButton = browser.$(byPartialText('Select Model'));
  if (await selectButton.isDisplayed().catch(() => false)) {
    await selectButton.click();
  } else {
    const palSelector = browser.$('~Select Pal');
    await palSelector.waitForDisplayed({timeout: 10000});
    await palSelector.click();
  }
  await browser.pause(700);
  const model = browser.$(byPartialText(modelId));
  if (!(await model.isDisplayed().catch(() => false))) {
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
    await browser.pause(700);
  }
  await model.waitForDisplayed({timeout: 10000});
  await model.click();
  await browser.$(Selectors.chat.input).waitForDisplayed({timeout: 15000});
}

export async function latestAssistantText(timeout = 30000): Promise<string> {
  await browser.$(Selectors.chat.aiMessage).waitForExist({timeout});
  let text = '';
  await browser.waitUntil(
    async () => {
      const messages = browser.$$(Selectors.chat.aiMessage);
      const count = await messages.length;
      if (count === 0) {
        return false;
      }
      // Chat uses an inverted FlatList; native accessibility order exposes
      // the newest assistant turn first.
      const latest = messages[0];
      text =
        (await latest
          .$(nativeTextElement())
          .getText()
          .catch(() => '')) || (await latest.getText().catch(() => ''));
      return text.length > 0;
    },
    {timeout, interval: 250},
  );
  return text;
}

export async function waitForAssistantText(
  expected: string,
  timeout = 30000,
): Promise<void> {
  await browser.waitUntil(
    async () => (await latestAssistantText(timeout)).includes(expected),
    {timeout, interval: 300, timeoutMsg: `Missing assistant text: ${expected}`},
  );
}

export async function addModelFromOpenRemoteSheet(
  modelId: string,
): Promise<void> {
  await Gestures.swipeUpInSheetBelowInputs();
  await browser.pause(300);
  const reachable = await Gestures.scrollInSheetClearOfOverlay(
    byPartialText(modelId),
    Selectors.remoteModel.addModelButton,
    12,
    Gestures.swipeUpInSheetBelowInputs,
  );
  expect(reachable).toBe(true);
  await browser.$(byPartialText(modelId)).click();
  const addButton = browser.$(Selectors.remoteModel.addModelButton);
  await addButton.waitForExist({timeout: 5000});
  await browser.waitUntil(() => addButton.isEnabled(), {timeout: 5000});
  await addButton.click();
}
