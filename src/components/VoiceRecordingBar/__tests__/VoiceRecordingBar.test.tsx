import React from 'react';
import {StyleSheet} from 'react-native';
import {runInAction} from 'mobx';
import type {ReactTestInstance} from 'react-test-renderer';

import {act, fireEvent, render} from '../../../../jest/test-utils';

import {L10nContext} from '../../../utils';
import {l10n} from '../../../locales';
import {asrStore} from '../../../store';
import {ASR_LEVEL_HISTORY, ASR_MAX_RECORD_MS} from '../../../services/asr';

import {VoiceRecordingBar} from '../VoiceRecordingBar';

const renderBar = (onCancel = jest.fn(), onStop = jest.fn()) =>
  render(
    <L10nContext.Provider value={l10n.en}>
      <VoiceRecordingBar onCancel={onCancel} onStop={onStop} />
    </L10nContext.Provider>,
  );

const barHeights = (bars: ReactTestInstance): number[] =>
  bars.props.children.map(
    (bar: ReactTestInstance) => StyleSheet.flatten(bar.props.style).height,
  );

describe('VoiceRecordingBar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    runInAction(() => {
      asrStore.captureState = 'recording';
      asrStore.inputLevels = [];
      asrStore.recordingStartedAt = Date.now();
    });
  });

  it('cancels and stops through its buttons while recording', () => {
    const onCancel = jest.fn();
    const onStop = jest.fn();
    const {getByTestId, queryByTestId} = renderBar(onCancel, onStop);

    expect(queryByTestId('voice-transcribing')).toBeNull();
    fireEvent.press(getByTestId('voice-stop-button'));
    expect(onStop).toHaveBeenCalledTimes(1);
    fireEvent.press(getByTestId('voice-cancel-button'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('draws the newest levels on the right and grows bars with loudness', () => {
    const {getByTestId} = renderBar();
    const flat = barHeights(getByTestId('voice-level-bars'));
    expect(flat).toHaveLength(ASR_LEVEL_HISTORY);
    expect(new Set(flat).size).toBe(1);

    act(() => {
      runInAction(() => {
        asrStore.inputLevels = [0.2, 1];
      });
    });

    const heights = barHeights(getByTestId('voice-level-bars'));
    expect(heights).toHaveLength(ASR_LEVEL_HISTORY);
    const last = heights[ASR_LEVEL_HISTORY - 1];
    const secondLast = heights[ASR_LEVEL_HISTORY - 2];
    expect(last).toBeGreaterThan(secondLast);
    expect(secondLast).toBeGreaterThan(heights[0]);
  });

  it('shows the elapsed time, highlighted near the cap', () => {
    const now = 1_000_000_000;
    const dateNow = jest.spyOn(Date, 'now').mockReturnValue(now);
    runInAction(() => {
      asrStore.recordingStartedAt = now - 65_000;
    });
    const {getByTestId} = renderBar();
    const timer = getByTestId('voice-elapsed');
    expect(timer.props.children).toBe('1:05');
    const normalColor = StyleSheet.flatten(timer.props.style).color;

    act(() => {
      runInAction(() => {
        asrStore.recordingStartedAt = now - (ASR_MAX_RECORD_MS - 5_000);
      });
    });

    const nearCap = getByTestId('voice-elapsed');
    expect(nearCap.props.children).toBe('2:55');
    expect(StyleSheet.flatten(nearCap.props.style).color).not.toBe(normalColor);
    dateNow.mockRestore();
  });

  it('shows a transcribing state with cancel but no stop', () => {
    runInAction(() => {
      asrStore.captureState = 'transcribing';
    });
    const onCancel = jest.fn();
    const {getByTestId, getByText, queryByTestId} = renderBar(onCancel);

    expect(getByText(l10n.en.voiceInput.transcribingLabel)).toBeTruthy();
    expect(queryByTestId('voice-stop-button')).toBeNull();
    expect(queryByTestId('voice-level-bars')).toBeNull();
    fireEvent.press(getByTestId('voice-cancel-button'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
