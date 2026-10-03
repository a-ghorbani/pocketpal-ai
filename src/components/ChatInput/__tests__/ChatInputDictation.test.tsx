import React from 'react';
import {fireEvent} from '@testing-library/react-native';
import {Platform, StyleSheet} from 'react-native';
import {runInAction} from 'mobx';
import {IconButton} from 'react-native-paper';

import {user} from '../../../../jest/fixtures';
import {render} from '../../../../jest/test-utils';
import {
  chatSessionStore,
  deepLinkStore,
  modelStore,
  palStore,
  startupSelectionStore,
} from '../../../store';
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
      modelStore.engine = undefined;
      deepLinkStore.pendingVoiceConversationRequestId = null;
      startupSelectionStore.restoreAttempted = true;
      startupSelectionStore.isRestoring = false;
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

  it('starts a pending launcher voice request once the model is ready', () => {
    runInAction(() => {
      modelStore.engine = {} as any;
      deepLinkStore.pendingVoiceConversationRequestId = 42;
    });

    render(
      <UserContext.Provider value={user}>
        <ChatInput onSendPress={jest.fn()} />
      </UserContext.Provider>,
    );

    expect(conversationResult.start).toHaveBeenCalledTimes(1);
    expect(deepLinkStore.consumeVoiceConversationRequest).toHaveBeenCalledWith(
      42,
    );
  });

  it('abandons a launcher voice request when the model is unavailable', () => {
    runInAction(() => {
      deepLinkStore.pendingVoiceConversationRequestId = 43;
    });

    render(
      <UserContext.Provider value={user}>
        <ChatInput onSendPress={jest.fn()} />
      </UserContext.Provider>,
    );

    expect(conversationResult.start).not.toHaveBeenCalled();
    expect(deepLinkStore.consumeVoiceConversationRequest).toHaveBeenCalledWith(
      43,
    );
  });

  it('abandons a launcher voice request while startup selections settle', () => {
    runInAction(() => {
      modelStore.engine = {} as any;
      startupSelectionStore.isRestoring = true;
      deepLinkStore.pendingVoiceConversationRequestId = 44;
    });

    render(
      <UserContext.Provider value={user}>
        <ChatInput onSendPress={jest.fn()} />
      </UserContext.Provider>,
    );

    expect(conversationResult.start).not.toHaveBeenCalled();
    expect(deepLinkStore.consumeVoiceConversationRequest).toHaveBeenCalledWith(
      44,
    );
  });

  it('does not stop a manually active conversation for a pending request', () => {
    mockUseVoiceConversation.mockReturnValue({
      ...conversationResult,
      active: true,
    });
    runInAction(() => {
      modelStore.engine = {} as any;
      deepLinkStore.pendingVoiceConversationRequestId = 45;
    });

    render(
      <UserContext.Provider value={user}>
        <ChatInput onSendPress={jest.fn()} />
      </UserContext.Provider>,
    );

    expect(conversationResult.stop).not.toHaveBeenCalled();
    expect(deepLinkStore.consumeVoiceConversationRequest).toHaveBeenCalledWith(
      45,
    );
  });

  it('clears a pending request before a manual conversation interaction', () => {
    runInAction(() => {
      modelStore.engine = {} as any;
      deepLinkStore.pendingVoiceConversationRequestId = 46;
    });
    const onChangeText = jest.fn();
    const onDefaultImagesChange = jest.fn();
    const {getByTestId} = render(
      <UserContext.Provider value={user}>
        <ChatInput
          defaultImages={[]}
          onDefaultImagesChange={onDefaultImagesChange}
          onSendPress={jest.fn()}
          textInputProps={{value: 'draft', onChangeText}}
        />
      </UserContext.Provider>,
    );

    fireEvent.press(getByTestId('dictation-button'));

    expect(deepLinkStore.consumeVoiceConversationRequest).toHaveBeenCalledWith(
      46,
    );
    expect(conversationResult.start).not.toHaveBeenCalled();
  });

  it('clears a claimed request when the chat loses focus', () => {
    runInAction(() => {
      modelStore.engine = {} as any;
      deepLinkStore.pendingVoiceConversationRequestId = 47;
    });
    const onChangeText = jest.fn();
    const onDefaultImagesChange = jest.fn();
    const {rerender} = render(
      <UserContext.Provider value={user}>
        <ChatInput
          defaultImages={[]}
          isDictationEligible
          onDefaultImagesChange={onDefaultImagesChange}
          onSendPress={jest.fn()}
          textInputProps={{value: 'draft', onChangeText}}
        />
      </UserContext.Provider>,
    );

    rerender(
      <UserContext.Provider value={user}>
        <ChatInput
          defaultImages={[]}
          isDictationEligible={false}
          onDefaultImagesChange={onDefaultImagesChange}
          onSendPress={jest.fn()}
          textInputProps={{value: 'draft', onChangeText}}
        />
      </UserContext.Provider>,
    );

    expect(deepLinkStore.consumeVoiceConversationRequest).toHaveBeenCalledWith(
      47,
    );
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
