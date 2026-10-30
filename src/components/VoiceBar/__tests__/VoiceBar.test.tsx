import React from 'react';

import {runInAction} from 'mobx';
import {State} from 'react-native-gesture-handler';
import {
  fireGestureHandler,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';

import {act, fireEvent, render} from '../../../../jest/test-utils';
import {l10n} from '../../../locales';
import {voiceModeStore} from '../../../store';

import {VoiceModeControlsContext} from '../../VoiceModeView';
import {VoiceBar} from '../VoiceBar';

const strings = l10n.en.voiceMode;
const controls = {tapCloud: jest.fn(), toggleMute: jest.fn(), end: jest.fn()};

const renderBar = () =>
  render(
    <VoiceModeControlsContext.Provider value={controls}>
      <VoiceBar />
    </VoiceModeControlsContext.Provider>,
  );

describe('VoiceBar', () => {
  beforeEach(() => {
    (voiceModeStore as any).reset();
    runInAction(() => {
      voiceModeStore.phase = 'speaking';
      voiceModeStore.presentation = 'bar';
    });
  });

  it('shows the status, the swipe hint and a mini cloud', () => {
    const {getByText, getByTestId} = renderBar();
    expect(getByText(strings.speakingTitle)).toBeTruthy();
    expect(getByText(strings.swipeUpHint)).toBeTruthy();
    expect(getByTestId('voice-cloud-speaking')).toBeTruthy();
  });

  it('a tap opens the voice view without changing the phase', () => {
    const {getByTestId} = renderBar();
    fireEvent.press(getByTestId('voice-bar-expand'));
    expect(voiceModeStore.setPresentation).toHaveBeenCalledWith('full');
    expect(voiceModeStore.phase).toBe('speaking');
  });

  it('a quick upward flick opens the voice view, however short', async () => {
    renderBar();
    fireGestureHandler(getByGestureTestId('voice-bar-swipe'), [
      {state: State.BEGAN, translationY: 0, velocityY: 0},
      {state: State.ACTIVE, translationY: -10, velocityY: -1200},
      {state: State.END, translationY: -20, velocityY: -1200},
    ]);
    await act(async () => {});
    expect(voiceModeStore.setPresentation).toHaveBeenCalledWith('full');
  });

  it('a short, slow drag up settles back without opening', () => {
    renderBar();
    fireGestureHandler(getByGestureTestId('voice-bar-swipe'), [
      {state: State.BEGAN, translationY: 0, velocityY: 0},
      {state: State.ACTIVE, translationY: -10, velocityY: -100},
      {state: State.END, translationY: -20, velocityY: -100},
    ]);
    expect(voiceModeStore.setPresentation).not.toHaveBeenCalled();
  });

  it('a swipe up opens the voice view', async () => {
    renderBar();
    fireGestureHandler(getByGestureTestId('voice-bar-swipe'), [
      {state: State.BEGAN, translationY: 0},
      {state: State.ACTIVE, translationY: -30},
      {state: State.END, translationY: -60},
    ]);
    await act(async () => {});
    expect(voiceModeStore.setPresentation).toHaveBeenCalledWith('full');
  });

  it('routes mute and End to the session', () => {
    const {getByTestId} = renderBar();
    fireEvent.press(getByTestId('voice-bar-mute'));
    fireEvent.press(getByTestId('voice-bar-end'));
    expect(controls.toggleMute).toHaveBeenCalledTimes(1);
    expect(controls.end).toHaveBeenCalledTimes(1);
  });

  it('shows an error in place of the hint', () => {
    runInAction(() => {
      voiceModeStore.lastError = 'reply_failed';
    });
    const {getByText} = renderBar();
    expect(getByText(strings.errorReply)).toBeTruthy();
  });

  it('runs no cloud of its own while the voice view is open', () => {
    runInAction(() => {
      voiceModeStore.presentation = 'full';
    });
    const {queryByTestId} = renderBar();
    expect(queryByTestId('voice-cloud-speaking')).toBeNull();
  });
});
