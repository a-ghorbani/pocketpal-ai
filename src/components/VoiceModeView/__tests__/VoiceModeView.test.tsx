import React from 'react';
import {AccessibilityInfo, BackHandler} from 'react-native';

import {runInAction} from 'mobx';
import {State} from 'react-native-gesture-handler';
import {
  fireGestureHandler,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';

import {act, fireEvent, render} from '../../../../jest/test-utils';
import {themeFixtures} from '../../../../jest/fixtures/theme';
import {l10n} from '../../../locales';
import {voiceModeStore} from '../../../store';

import {VoiceModeControlsContext} from '../controls';
import {VoiceModeView} from '../VoiceModeView';

const strings = l10n.en.voiceMode;
const controls = {tapCloud: jest.fn(), toggleMute: jest.fn(), end: jest.fn()};

const renderView = () =>
  render(
    <VoiceModeControlsContext.Provider value={controls}>
      <VoiceModeView />
    </VoiceModeControlsContext.Provider>,
  );

const setSession = (
  phase: typeof voiceModeStore.phase,
  micMuted = false,
  lastError: typeof voiceModeStore.lastError = null,
) =>
  runInAction(() => {
    Object.assign(voiceModeStore, {phase, micMuted, lastError});
  });

describe('VoiceModeView', () => {
  beforeEach(() => {
    (voiceModeStore as any).reset();
  });

  it.each([
    [
      'starting',
      false,
      strings.startingTitle,
      strings.startingHint,
      'thinking',
    ],
    [
      'listening',
      false,
      strings.listeningTitle,
      strings.listeningHint,
      'listening',
    ],
    ['listening', true, strings.mutedTitle, strings.mutedHint, 'muted'],
    [
      'transcribing',
      false,
      strings.thinkingTitle,
      strings.thinkingHint,
      'thinking',
    ],
    [
      'thinking',
      false,
      strings.thinkingTitle,
      strings.thinkingHint,
      'thinking',
    ],
    [
      'speaking',
      false,
      strings.speakingTitle,
      strings.speakingHint,
      'speaking',
    ],
  ] as const)(
    '%s (muted %s) shows its status and cloud',
    (phase, muted, title, hint, visual) => {
      setSession(phase, muted);
      const {getByText, getByTestId} = renderView();
      expect(getByText(title)).toBeTruthy();
      expect(getByText(hint)).toBeTruthy();
      expect(getByTestId(`voice-cloud-${visual}`)).toBeTruthy();
    },
  );

  it.each([
    ['transcribe_failed', strings.errorTranscribe],
    ['reply_failed', strings.errorReply],
    ['speech_failed', strings.errorSpeech],
  ] as const)('shows the %s error as the subtitle', (error, text) => {
    setSession('listening', false, error);
    const {getByTestId} = renderView();
    expect(getByTestId('voice-status-hint')).toHaveTextContent(text);
  });

  it('announces each new status, and an error with it', () => {
    const announce = jest.spyOn(
      AccessibilityInfo,
      'announceForAccessibilityWithOptions',
    );
    setSession('listening');
    renderView();
    expect(announce).toHaveBeenLastCalledWith(strings.listeningTitle, {
      queue: true,
    });

    act(() => setSession('listening', false, 'reply_failed'));
    expect(announce).toHaveBeenLastCalledWith(
      `${strings.listeningTitle}. ${strings.errorReply}`,
      {queue: true},
    );
    announce.mockRestore();
  });

  it('colours an error hint as an error', () => {
    setSession('listening', false, 'speech_failed');
    const {getByTestId} = renderView();
    expect(getByTestId('voice-status-hint')).toHaveStyle({
      color: themeFixtures.lightTheme.colors.error,
    });
  });

  it('routes the cloud, mute and End to the session', () => {
    setSession('speaking');
    const {getByTestId} = renderView();

    fireEvent.press(getByTestId('voice-cloud'));
    fireEvent.press(getByTestId('voice-mute'));
    fireEvent.press(getByTestId('voice-end'));

    expect(controls.tapCloud).toHaveBeenCalledTimes(1);
    expect(controls.toggleMute).toHaveBeenCalledTimes(1);
    expect(controls.end).toHaveBeenCalledTimes(1);
  });

  it('labels the mic button by what it will do', () => {
    setSession('listening', true);
    const {getByLabelText} = renderView();
    expect(getByLabelText(strings.unmuteLabel)).toBeTruthy();
  });

  it('pulling down collapses to the bar without changing the phase', () => {
    setSession('speaking');
    renderView();

    fireGestureHandler(getByGestureTestId('voice-view-pull'), [
      {state: State.BEGAN, translationY: 0},
      {state: State.ACTIVE, translationY: 60},
      {state: State.END, translationY: 120},
    ]);

    expect(voiceModeStore.setPresentation).toHaveBeenCalledWith('bar');
    expect(voiceModeStore.phase).toBe('speaking');
  });

  it('a screen reader can show the chat: a button, the escape gesture, a modal view', () => {
    setSession('listening');
    const {getByLabelText, getByTestId} = renderView();

    expect(getByTestId('voice-view').props.accessibilityViewIsModal).toBe(true);
    fireEvent.press(getByLabelText(strings.showChatLabel));
    expect(voiceModeStore.setPresentation).toHaveBeenCalledWith('bar');

    fireEvent(getByTestId('voice-view'), 'accessibilityEscape');
    expect(voiceModeStore.setPresentation).toHaveBeenCalledTimes(2);
  });

  it('a short pull does not collapse', () => {
    setSession('listening');
    renderView();

    fireGestureHandler(getByGestureTestId('voice-view-pull'), [
      {state: State.BEGAN, translationY: 0},
      {state: State.END, translationY: 30},
    ]);

    expect(voiceModeStore.setPresentation).not.toHaveBeenCalled();
  });

  it('Android back collapses to the bar', () => {
    const addListener = jest.spyOn(BackHandler, 'addEventListener');
    setSession('listening');
    renderView();

    const handler = addListener.mock.calls[0][1];
    expect(handler({} as any)).toBe(true);
    expect(voiceModeStore.setPresentation).toHaveBeenCalledWith('bar');
    addListener.mockRestore();
  });

  it('shows no transcript: the chat is the transcript', () => {
    setSession('speaking');
    const {queryByTestId} = renderView();
    expect(queryByTestId('voice-transcript')).toBeNull();
  });
});
