import React from 'react';
import {fireEvent} from '@testing-library/react-native';
import {Platform, StyleSheet} from 'react-native';
import {runInAction} from 'mobx';
import {IconButton} from 'react-native-paper';

import {user} from '../../../../jest/fixtures';
import {render} from '../../../../jest/test-utils';
import {chatSessionStore, modelStore, palStore} from '../../../store';
import {UserContext} from '../../../utils';
import {useSpeechRecognition} from '../../../hooks/useSpeechRecognition';
import {ChatInput} from '../ChatInput';

jest.mock('../../../hooks/useSpeechRecognition', () => ({
  useSpeechRecognition: jest.fn(),
}));

const mockUseSpeechRecognition = useSpeechRecognition as jest.Mock;

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

describe('ChatInput dictation', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', {value: 'android'});
    mockUseSpeechRecognition.mockReturnValue(dictationResult);
    runInAction(() => {
      modelStore.activeModelId = 'test-model-id';
    });
    jest.clearAllMocks();
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', {value: originalOS});
  });

  it('starts dictation without sending a message', () => {
    const onSendPress = jest.fn();
    const {getByTestId} = render(
      <UserContext.Provider value={user}>
        <ChatInput onSendPress={onSendPress} />
      </UserContext.Provider>,
    );

    fireEvent.press(getByTestId('dictation-button'));

    expect(dictationResult.start).toHaveBeenCalledTimes(1);
    expect(onSendPress).not.toHaveBeenCalled();
  });

  it('shows partial text and exposes finish and cancel while listening', () => {
    mockUseSpeechRecognition.mockReturnValue({
      ...dictationResult,
      phase: 'listening',
      partialText: 'temporary words',
    });
    const {getByTestId, getByText} = render(
      <UserContext.Provider value={user}>
        <ChatInput onSendPress={jest.fn()} />
      </UserContext.Provider>,
    );

    expect(getByText('temporary words')).toBeTruthy();
    fireEvent.press(getByTestId('dictation-button'));
    fireEvent.press(getByTestId('dictation-cancel'));
    expect(dictationResult.finish).toHaveBeenCalledTimes(1);
    expect(dictationResult.cancel).toHaveBeenCalledTimes(1);
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
    mockUseSpeechRecognition.mockReturnValue({
      ...dictationResult,
      phase: 'listening',
      partialText: 'temporary words',
    });

    const {UNSAFE_getAllByType, getByTestId, unmount} = render(
      <UserContext.Provider value={user}>
        <ChatInput onSendPress={jest.fn()} inputBackgroundColor="#30291F" />
      </UserContext.Provider>,
    );

    const dictationButtons = UNSAFE_getAllByType(IconButton).filter(
      button =>
        button.props.testID === 'dictation-button' ||
        button.props.testID === 'dictation-cancel',
    );
    expect(dictationButtons).toHaveLength(2);
    expect(dictationButtons.map(button => button.props.iconColor)).toEqual([
      '#B89A62',
      '#B89A62',
    ]);
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
