import {expect} from '@wdio/globals';
import {ChatPage} from '../../pages/ChatPage';
import {DrawerPage} from '../../pages/DrawerPage';
import {ModelsPage} from '../../pages/ModelsPage';
import {CHAT_MODEL_ID} from '../../fixtures/remote-responses-server';
import {Selectors, byPartialText} from '../../helpers/selectors';
import {Gestures} from '../../helpers/gestures';
import {
  addModelFromOpenRemoteSheet,
  fixtureStatus,
  resetFixture,
  selectChatModel,
  waitForAssistantText,
} from '../../helpers/remote-responses';
import {TIMEOUTS} from '../../fixtures/models';

declare const browser: WebdriverIO.Browser;

const FIXTURE_URL =
  process.env.E2E_REMOTE_FIXTURE_URL || 'http://127.0.0.1:18080';
const CHAT_FIXTURE_URL =
  process.env.E2E_CHAT_FIXTURE_URL || 'http://127.0.0.1:18081';

describe('Remote Chat Completions fallback', () => {
  it('routes a Chat-only catalog model through chat completions', async () => {
    await fixtureStatus(FIXTURE_URL);
    await resetFixture(FIXTURE_URL);
    const chatPage = new ChatPage();
    const drawerPage = new DrawerPage();
    const modelsPage = new ModelsPage();
    await chatPage.waitForReady(TIMEOUTS.appReady);

    await chatPage.openDrawer();
    await drawerPage.waitForOpen();
    await drawerPage.navigateToModels();
    await modelsPage.waitForReady();
    await modelsPage.openAddRemoteModel();
    await browser.$(Selectors.serverType.dropdown()).click();
    await browser
      .$(Selectors.serverType.option('GitHub Copilot'))
      .waitForDisplayed({timeout: 5000});
    await browser.$(Selectors.serverType.option('GitHub Copilot')).click();
    const urlInput = browser.$(Selectors.remoteModel.urlInput);
    await urlInput.setValue(CHAT_FIXTURE_URL);
    await modelsPage.hideKeyboard();
    await browser
      .$(byPartialText('Connected'))
      .waitForDisplayed({timeout: 15000});

    await Gestures.scrollInSheetToElementExists(
      Selectors.remoteModel.protocolRow(CHAT_MODEL_ID),
      10,
    );
    expect(
      await browser
        .$(Selectors.remoteModel.protocolRow(CHAT_MODEL_ID))
        .getText(),
    ).toContain('Chat Completions');
    await addModelFromOpenRemoteSheet(CHAT_MODEL_ID);

    await chatPage.openDrawer();
    await drawerPage.waitForOpen();
    await drawerPage.navigateToChat();
    await selectChatModel(CHAT_MODEL_ID);
    await chatPage.sendMessage('verify chat routing');
    await waitForAssistantText('Chat completions route confirmed.');

    const status = await fixtureStatus(FIXTURE_URL);
    const request = status.requests.at(-1);
    expect(request?.method).toBe('POST');
    expect(request?.path).toBe('/chat/completions');
    expect(request?.headers['copilot-integration-id']).toBe(
      'copilot-developer-cli-test',
    );
  });
});
