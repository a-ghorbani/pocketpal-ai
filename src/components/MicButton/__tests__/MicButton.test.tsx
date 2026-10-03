import React from 'react';
import {runInAction} from 'mobx';

import {fireEvent, render} from '../../../../jest/test-utils';

import {L10nContext} from '../../../utils';
import {l10n} from '../../../locales';
import {asrStore} from '../../../store';

// Capture the hook's transcript callback so the test can simulate a result.
let capturedOnTranscript: ((text: string) => void) | null = null;
const mockOnPressIn = jest.fn();
const mockOnPressOut = jest.fn();
jest.mock('../../../hooks/usePushToTalk', () => ({
  usePushToTalk: ({onTranscript}: {onTranscript: (t: string) => void}) => {
    capturedOnTranscript = onTranscript;
    return {onPressIn: mockOnPressIn, onPressOut: mockOnPressOut};
  },
}));

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({navigate: mockNavigate}),
}));

import {MicButton} from '../MicButton';

const renderMic = (appendTranscript = jest.fn()) =>
  render(
    <L10nContext.Provider value={l10n.en}>
      <MicButton appendTranscript={appendTranscript} />
    </L10nContext.Provider>,
    {withNavigation: true},
  );

describe('MicButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedOnTranscript = null;
    runInAction(() => {
      asrStore.deviceMeetsMemory = true;
      asrStore.userASROverride = null;
      asrStore.selectedTier = 'small';
      asrStore.downloadStates.small = 'ready';
      asrStore.captureState = 'idle';
    });
  });

  it('renders nothing when voice input is unavailable', () => {
    runInAction(() => {
      asrStore.deviceMeetsMemory = false;
      asrStore.userASROverride = false;
    });
    const {queryByTestId} = renderMic();
    expect(queryByTestId('mic-button')).toBeNull();
    expect(queryByTestId('mic-button-setup')).toBeNull();
  });

  it('shows a setup affordance (not a recording mic) when not installed', () => {
    runInAction(() => {
      asrStore.downloadStates.small = 'not_installed';
    });
    const {getByTestId, queryByTestId} = renderMic();
    expect(getByTestId('mic-button-setup')).toBeTruthy();
    expect(queryByTestId('mic-button')).toBeNull();
    fireEvent.press(getByTestId('mic-button-setup'));
    expect(mockNavigate).toHaveBeenCalledWith('Settings');
  });

  it('renders the push-to-talk mic when gate open and tier ready', () => {
    const {getByTestId, queryByTestId} = renderMic();
    expect(getByTestId('mic-button')).toBeTruthy();
    expect(queryByTestId('mic-button-setup')).toBeNull();
  });

  it('appends the transcript (never sends)', () => {
    const appendTranscript = jest.fn();
    renderMic(appendTranscript);
    expect(capturedOnTranscript).not.toBeNull();
    capturedOnTranscript?.('buy milk');
    expect(appendTranscript).toHaveBeenCalledWith('buy milk');
  });
});
