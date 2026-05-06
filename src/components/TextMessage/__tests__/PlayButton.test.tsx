import React from 'react';
import {runInAction} from 'mobx';

import {fireEvent, render} from '../../../../jest/test-utils';
import {derivedTextMessage} from '../../../../jest/fixtures';

import {L10nContext} from '../../../utils';
import {assistant} from '../../../utils/chat';
import {l10n} from '../../../locales';
import {modelStore, ttsStore} from '../../../store';
import type {MessageType} from '../../../utils/types';

import {PlayButton} from '../PlayButton';

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

describe('PlayButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    runInAction(() => {
      ttsStore.deviceMeetsMemory = true;
      ttsStore.userTTSOverride = null;
      ttsStore.currentVoice = null;
      ttsStore.playbackState = {mode: 'idle'};
      modelStore.isStreaming = false;
    });
  });

  it('renders nothing when TTS is unavailable', () => {
    runInAction(() => {
      ttsStore.deviceMeetsMemory = false;
      ttsStore.userTTSOverride = null;
    });
    const {queryByTestId} = renderButton(makeAssistantMsg());
    expect(queryByTestId('playbutton-msg-1')).toBeNull();
  });

  it('renders nothing for user messages', () => {
    const {queryByTestId} = renderButton(
      makeAssistantMsg({author: {id: 'userId'}}),
    );
    expect(queryByTestId('playbutton-msg-1')).toBeNull();
  });

  it('renders nothing for single-word messages', () => {
    const {queryByTestId} = renderButton(makeAssistantMsg({text: 'Hi'}));
    expect(queryByTestId('playbutton-msg-1')).toBeNull();
  });

  it('renders nothing for empty / whitespace messages', () => {
    const {queryByTestId} = renderButton(makeAssistantMsg({text: '   '}));
    expect(queryByTestId('playbutton-msg-1')).toBeNull();
  });

  it('renders nothing while streaming (no final completionResult)', () => {
    runInAction(() => {
      modelStore.isStreaming = true;
    });
    const {queryByTestId} = renderButton(makeAssistantMsg({metadata: {}}));
    expect(queryByTestId('playbutton-msg-1')).toBeNull();
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
