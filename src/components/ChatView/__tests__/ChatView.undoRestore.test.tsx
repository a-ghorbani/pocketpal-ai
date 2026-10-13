import * as React from 'react';

import {textMessage, user} from '../../../../jest/fixtures';
import {sessionFixtures} from '../../../../jest/fixtures/chatSessions';
import {l10n} from '../../../locales';
import {ChatView} from '../ChatView';
import {act, fireEvent, render} from '../../../../jest/test-utils';
import {chatSessionStore, modelStore} from '../../../store';
import type {UndoneSend} from '../../../hooks/useChatSession';

jest.useFakeTimers();

jest.mock('../../ChatEmptyPlaceholder', () => ({
  ChatEmptyPlaceholder: jest.fn(() => null),
}));

const sentText = 'u2';
const sentImages = ['file:///a.jpg'];

const renderChat = () => {
  let settle!: (undone: UndoneSend | undefined) => void;
  const onSendPress = jest.fn(
    () =>
      new Promise<UndoneSend | undefined>(resolve => {
        settle = resolve;
      }),
  );
  const screen = render(
    <ChatView messages={[textMessage]} onSendPress={onSendPress} user={user} />,
    {withNavigation: true, withBottomSheetProvider: true},
  );
  const input = () =>
    screen.getByPlaceholderText(l10n.en.components.chatInput.inputPlaceholder);
  const send = () => {
    fireEvent.changeText(input(), sentText);
    fireEvent.press(
      screen.getByLabelText(l10n.en.components.sendButton.accessibilityLabel),
    );
  };
  const settleWith = async (undone: UndoneSend | undefined) => {
    await act(async () => {
      settle(undone);
    });
  };
  const images = () =>
    screen
      .queryAllByLabelText(/^Image preview \d+ of \d+$/)
      .map(node => node.props.source.uri);
  return {input, send, settleWith, images};
};

const undoneIn = (sessionId: string): UndoneSend => ({
  message: {type: 'text', text: sentText, imageUris: sentImages},
  sessionId,
});

describe('a send that comes back undone', () => {
  beforeEach(() => {
    chatSessionStore.sessions = sessionFixtures as any;
    chatSessionStore.activeSessionId = 'session-1';
    modelStore.activeModelId = 'test-model-id';
    (chatSessionStore.getDraft as jest.Mock).mockImplementation(
      (sessionId: string) => (sessionId === 'session-2' ? 'prior' : ''),
    );
  });

  afterEach(() => {
    modelStore.activeModelId = undefined;
    (chatSessionStore.getDraft as jest.Mock).mockReturnValue('');
  });

  it('puts the text and images back in an empty composer', async () => {
    const chat = renderChat();
    chat.send();
    expect(chat.input().props.value).toBe('');

    await chat.settleWith(undoneIn('session-1'));

    expect(chat.input().props.value).toBe(sentText);
    expect(chat.images()).toEqual(sentImages);
  });

  it('puts the text before anything typed while waiting', async () => {
    const chat = renderChat();
    chat.send();
    fireEvent.changeText(chat.input(), 'typed');

    await chat.settleWith(undoneIn('session-1'));

    expect(chat.input().props.value).toBe(`${sentText}\ntyped`);
  });

  it('puts the text in the draft of a chat that is not showing', async () => {
    const chat = renderChat();
    chat.send();

    await chat.settleWith(undoneIn('session-2'));

    expect(chatSessionStore.saveDraft).toHaveBeenCalledWith(
      'session-2',
      `${sentText}\nprior`,
    );
    expect(chat.input().props.value).toBe('');
  });

  it('restores nothing for a chat deleted while waiting', async () => {
    const chat = renderChat();
    chat.send();

    await chat.settleWith(undoneIn('deleted'));

    expect(chatSessionStore.saveDraft).not.toHaveBeenCalledWith(
      'deleted',
      expect.anything(),
    );
    expect(chat.input().props.value).toBe('');
  });

  it('leaves the composer empty after a send that went through', async () => {
    const chat = renderChat();
    chat.send();

    await chat.settleWith(undefined);

    expect(chat.input().props.value).toBe('');
    expect(chat.images()).toEqual([]);
  });
});
