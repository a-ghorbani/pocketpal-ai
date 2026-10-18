import React from 'react';
import {runInAction} from 'mobx';

import {fireEvent, render} from '../../../../jest/test-utils';
import {derivedTextMessage} from '../../../../jest/fixtures';

import {L10nContext} from '../../../utils';
import {assistant} from '../../../utils/chat';
import {l10n} from '../../../locales';
import {modelStore, ttsStore} from '../../../store';
import type {MessageType} from '../../../utils/types';

import {PlayButton, shouldShowPlayButton} from '../PlayButton';

const makeAssistantMsg = (overrides: Partial<MessageType.DerivedText> = {}) =>
  ({
    ...derivedTextMessage,
    id: 'msg-1',
    author: {id: assistant.id},
    text: 'Hello there friend',
    metadata: {completionResult: {content: 'Hello there friend'}},
    ...overrides,
  }) as MessageType.DerivedText;

const renderButton = (message: MessageType.DerivedText) =>
  render(
    <L10nContext.Provider value={l10n.en}>
      <PlayButton message={message} />
    </L10nContext.Provider>,
  );

const resetStores = () => {
  runInAction(() => {
    ttsStore.deviceMeetsMemory = true;
    ttsStore.userTTSOverride = null;
    ttsStore.currentVoice = null;
    ttsStore.playbackState = {mode: 'idle'};
    modelStore.isStreaming = false;
  });
};

const makeTurn = (steps: Array<{content: string; partial?: boolean}>) =>
  ({
    id: 'turn-1',
    type: 'assistant_turn',
    author: {id: assistant.id},
    createdAt: 0,
    steps,
    metadata: {},
  }) as unknown as MessageType.Any;

describe('shouldShowPlayButton', () => {
  beforeEach(resetStores);

  it('is true for a finished multi-word assistant reply with TTS available', () => {
    expect(shouldShowPlayButton(makeAssistantMsg())).toBe(true);
  });

  it('is false when TTS is unavailable', () => {
    runInAction(() => {
      ttsStore.deviceMeetsMemory = false;
    });
    expect(shouldShowPlayButton(makeAssistantMsg())).toBe(false);
  });

  it('is false for a message type that is not text or an assistant turn', () => {
    const image = {
      id: 'img-1',
      type: 'image',
      author: {id: assistant.id},
      createdAt: 0,
      uri: 'file://foo.png',
      name: 'foo.png',
      size: 1,
      width: 1,
      height: 1,
    } as MessageType.Any;
    expect(shouldShowPlayButton(image)).toBe(false);
  });

  it('is false for user messages', () => {
    expect(
      shouldShowPlayButton(makeAssistantMsg({author: {id: 'userId'}})),
    ).toBe(false);
  });

  it('is false for single-word messages', () => {
    expect(shouldShowPlayButton(makeAssistantMsg({text: 'Hi'}))).toBe(false);
  });

  it('is false for empty / whitespace messages', () => {
    expect(shouldShowPlayButton(makeAssistantMsg({text: '   '}))).toBe(false);
  });

  it('is false for a text reply while streaming without a final completionResult', () => {
    runInAction(() => {
      modelStore.isStreaming = true;
    });
    expect(shouldShowPlayButton(makeAssistantMsg({metadata: {}}))).toBe(false);
  });

  it('is false for an assistant turn with a partial step while streaming', () => {
    runInAction(() => {
      modelStore.isStreaming = true;
    });
    expect(
      shouldShowPlayButton(
        makeTurn([{content: 'Still going on', partial: true}]),
      ),
    ).toBe(false);
  });

  it('is true for an older finished reply while another run streams', () => {
    runInAction(() => {
      modelStore.isStreaming = true;
    });
    expect(shouldShowPlayButton(makeAssistantMsg())).toBe(true);
    expect(shouldShowPlayButton(makeTurn([{content: 'All done here'}]))).toBe(
      true,
    );
  });
});

describe('PlayButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStores();
  });

  it('opens setup sheet on first tap when no voice chosen', () => {
    const {getByTestId} = renderButton(makeAssistantMsg());
    fireEvent.press(getByTestId('playbutton-msg-1'));
    expect(ttsStore.openSetupSheet).toHaveBeenCalledTimes(1);
    expect(ttsStore.play).not.toHaveBeenCalled();
  });

  it('calls play when tapped with a voice chosen', () => {
    runInAction(() => {
      ttsStore.currentVoice = {
        id: 'v1',
        name: 'Alex',
        engine: 'system',
      } as any;
    });
    const {getByTestId} = renderButton(makeAssistantMsg());
    fireEvent.press(getByTestId('playbutton-msg-1'));
    expect(ttsStore.play).toHaveBeenCalledWith('msg-1', 'Hello there friend', {
      hadReasoning: false,
    });
    expect(ttsStore.stop).not.toHaveBeenCalled();
  });

  it('passes hadReasoning=true when message metadata has reasoning_content', () => {
    runInAction(() => {
      ttsStore.currentVoice = {
        id: 'v1',
        name: 'Alex',
        engine: 'system',
      } as any;
    });
    const {getByTestId} = renderButton(
      makeAssistantMsg({
        metadata: {
          completionResult: {
            content: 'Hello there friend',
            reasoning_content: 'deliberating...',
          },
        },
      }),
    );
    fireEvent.press(getByTestId('playbutton-msg-1'));
    expect(ttsStore.play).toHaveBeenCalledWith('msg-1', 'Hello there friend', {
      hadReasoning: true,
    });
  });

  it('passes hadReasoning=false when reasoning_content is whitespace-only', () => {
    runInAction(() => {
      ttsStore.currentVoice = {
        id: 'v1',
        name: 'Alex',
        engine: 'system',
      } as any;
    });
    const {getByTestId} = renderButton(
      makeAssistantMsg({
        metadata: {
          completionResult: {
            content: 'Hello there friend',
            reasoning_content: '   \n  ',
          },
        },
      }),
    );
    fireEvent.press(getByTestId('playbutton-msg-1'));
    expect(ttsStore.play).toHaveBeenCalledWith('msg-1', 'Hello there friend', {
      hadReasoning: false,
    });
  });

  it('handles assistant_turn messages using derivedText', () => {
    runInAction(() => {
      ttsStore.deviceMeetsMemory = true;
      ttsStore.currentVoice = {
        id: 'v1',
        name: 'Alex',
        engine: 'system',
      } as any;
    });
    const turnMessage = {
      id: 'turn-9',
      type: 'assistant_turn' as const,
      author: {id: assistant.id},
      createdAt: 0,
      steps: [
        {content: 'Sure, here it is.', reasoningContent: 'planning…'},
        {content: 'Hope this helps.'},
      ],
      metadata: {},
    } as unknown as MessageType.Any;
    const {getByTestId} = render(
      <L10nContext.Provider value={l10n.en}>
        <PlayButton message={turnMessage} />
      </L10nContext.Provider>,
    );
    fireEvent.press(getByTestId('playbutton-turn-9'));
    expect(ttsStore.play).toHaveBeenCalledWith(
      'turn-9',
      'Sure, here it is.\n\nHope this helps.',
      {hadReasoning: true},
    );
  });

  it('calls stop when tapped while this message is playing', () => {
    runInAction(() => {
      ttsStore.currentVoice = {
        id: 'v1',
        name: 'Alex',
        engine: 'system',
      } as any;
      ttsStore.playbackState = {mode: 'playing', messageId: 'msg-1'};
    });
    const {getByTestId} = renderButton(makeAssistantMsg());
    fireEvent.press(getByTestId('playbutton-msg-1'));
    expect(ttsStore.stop).toHaveBeenCalledTimes(1);
    expect(ttsStore.play).not.toHaveBeenCalled();
  });
});
