import React from 'react';
import {fireEvent} from '@testing-library/react-native';
import {Platform} from 'react-native';
import {runInAction} from 'mobx';

import {user} from '../../../../jest/fixtures';
import {render} from '../../../../jest/test-utils';
import {modelStore} from '../../../store';
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
});
