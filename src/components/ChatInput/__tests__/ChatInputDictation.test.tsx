import React from 'react';
import {fireEvent} from '@testing-library/react-native';
import {Platform, StyleSheet} from 'react-native';
import {runInAction} from 'mobx';
import {IconButton} from 'react-native-paper';

import {user} from '../../../../jest/fixtures';
import {render} from '../../../../jest/test-utils';
import {chatSessionStore, modelStore, palStore} from '../../../store';
import {UserContext} from '../../../utils';
import {useVoiceConversation} from '../../../hooks/useVoiceConversation';
import {ChatInput} from '../ChatInput';

jest.mock('../../../hooks/useVoiceConversation', () => ({
  useVoiceConversation: jest.fn(),
}));

const mockUseVoiceConversation = useVoiceConversation as jest.Mock;

const dictationResult = {
  phase: 'idle',
  partialText: '',
  errorCode: null,
  clearError: jest.fn(),
  capability: {
    available: true,
    sdkSupported: true,
    support: 'installed',
    locale: 'en-US',
  },
  locale: 'en-US',
  start: jest.fn(),
  finish: jest.fn(),
  cancel: jest.fn(),
  requestModelDownload: jest.fn(),
  refreshCapability: jest.fn(),
};

const conversationResult = {
  active: false,
  phase: 'off',
  recognition: dictationResult,
  start: jest.fn(),
  stop: jest.fn(),
};

describe('ChatInput dictation', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', {value: 'android'});
    mockUseVoiceConversation.mockReturnValue(conversationResult);
    runInAction(() => {
      modelStore.activeModelId = 'test-model-id';
    });
    jest.clearAllMocks();
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', {value: originalOS});
  });

  it('starts conversation mode without sending a message', () => {
    const onSendPress = jest.fn();
    const {getByTestId} = render(
      <UserContext.Provider value={user}>
        <ChatInput onSendPress={onSendPress} />
      </UserContext.Provider>,
    );

    fireEvent.press(getByTestId('dictation-button'));

    expect(conversationResult.start).toHaveBeenCalledTimes(1);
    expect(onSendPress).not.toHaveBeenCalled();
  });

  it('shows partial text and uses the same button to stop conversation', () => {
    mockUseVoiceConversation.mockReturnValue({
      ...conversationResult,
      active: true,
      phase: 'listening',
      recognition: {
        ...dictationResult,
        phase: 'listening',
        partialText: 'temporary words',
      },
    });
    const {getByTestId, getByText} = render(
      <UserContext.Provider value={user}>
        <ChatInput onSendPress={jest.fn()} />
      </UserContext.Provider>,
    );

    expect(getByText('temporary words')).toBeTruthy();
    fireEvent.press(getByTestId('dictation-button'));
    expect(conversationResult.stop).toHaveBeenCalledTimes(1);
  });

  it('uses the Pal foreground for dictation controls on a dark composer', () => {
    const originalPals = palStore.pals;
    const originalActivePalId = Object.getOwnPropertyDescriptor(
      chatSessionStore,
      'activePalId',
    );
    runInAction(() => {
      palStore.pals = [
        {
          type: 'local',
          id: 'scout-colors',
          name: 'Scout',
          systemPrompt: 'Scout',
          isSystemPromptChanged: false,
          useAIPrompt: false,
          parameters: {},
          parameterSchema: [],
          source: 'local',
          color: ['#B89A62', '#30291F'],
          created_at: '2026-09-19T00:00:00Z',
          updated_at: '2026-09-19T00:00:00Z',
        },
      ];
    });
    Object.defineProperty(chatSessionStore, 'activePalId', {
      get: jest.fn(() => 'scout-colors'),
      configurable: true,
    });
    mockUseVoiceConversation.mockReturnValue({
      ...conversationResult,
      active: true,
      phase: 'listening',
      recognition: {
        ...dictationResult,
        phase: 'listening',
        partialText: 'temporary words',
      },
    });

    const {UNSAFE_getAllByType, getByTestId, unmount} = render(
      <UserContext.Provider value={user}>
        <ChatInput onSendPress={jest.fn()} inputBackgroundColor="#30291F" />
      </UserContext.Provider>,
    );

    const dictationButtons = UNSAFE_getAllByType(IconButton).filter(
      button => button.props.testID === 'dictation-button',
    );
    expect(dictationButtons).toHaveLength(1);
    expect(dictationButtons[0].props.iconColor).toBe('#B89A62');
    expect(
      StyleSheet.flatten(getByTestId('dictation-status').props.style).color,
    ).toBe('rgba(184, 154, 98, 0.9)');

    unmount();
    runInAction(() => {
      palStore.pals = originalPals;
    });
    if (originalActivePalId) {
      Object.defineProperty(
        chatSessionStore,
        'activePalId',
        originalActivePalId,
      );
    }
  });
});
