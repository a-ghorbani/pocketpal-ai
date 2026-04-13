import React from 'react';
import {runInAction} from 'mobx';

import {fireEvent, render} from '../../../../jest/test-utils';

import {L10nContext} from '../../../utils';
import {l10n} from '../../../locales';
import {ttsStore} from '../../../store';

import {VoiceChip} from '../VoiceChip';

const renderChip = () =>
  render(
    <L10nContext.Provider value={l10n.en}>
      <VoiceChip />
    </L10nContext.Provider>,
  );

const systemVoice = {
  id: 'v1',
  name: 'Alexandra',
  engine: 'system' as const,
};

describe('VoiceChip', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    runInAction(() => {
      ttsStore.isTTSAvailable = true;
      ttsStore.currentVoice = null;
      ttsStore.autoSpeakEnabled = false;
      ttsStore.playbackState = {mode: 'idle'};
    });
  });

  it('renders nothing when TTS is unavailable', () => {
    runInAction(() => {
      ttsStore.isTTSAvailable = false;
    });
    const {queryByTestId} = renderChip();
    expect(queryByTestId('voicechip-gear-only')).toBeNull();
    expect(queryByTestId('voicechip-split')).toBeNull();
  });

  it('pre-setup: renders gear-only (no toggle half, no divider)', () => {
    const {getByTestId, queryByTestId} = renderChip();
    expect(getByTestId('voicechip-gear-only')).toBeTruthy();
    expect(queryByTestId('voicechip-split')).toBeNull();
    expect(queryByTestId('voicechip-divider')).toBeNull();
  });

  it('pre-setup: tapping gear opens setup sheet', () => {
    const {getByTestId} = renderChip();
    fireEvent.press(getByTestId('voicechip-gear-only'));
    expect(ttsStore.openSetupSheet).toHaveBeenCalledTimes(1);
  });

  it('voice-chosen: renders both halves with divider', () => {
    runInAction(() => {
      ttsStore.currentVoice = systemVoice as any;
    });
    const {getByTestId} = renderChip();
    expect(getByTestId('voicechip-toggle')).toBeTruthy();
    expect(getByTestId('voicechip-divider')).toBeTruthy();
    expect(getByTestId('voicechip-gear')).toBeTruthy();
  });

  it('voice-chosen: left half tap toggles autoSpeakEnabled', () => {
    runInAction(() => {
      ttsStore.currentVoice = systemVoice as any;
    });
    const {getByTestId} = renderChip();
    fireEvent.press(getByTestId('voicechip-toggle'));
    expect(ttsStore.setAutoSpeak).toHaveBeenCalledWith(true);
    expect(ttsStore.openSetupSheet).not.toHaveBeenCalled();
  });

  it('voice-chosen: right half tap opens setup sheet, does not toggle', () => {
    runInAction(() => {
      ttsStore.currentVoice = systemVoice as any;
    });
    const {getByTestId} = renderChip();
    fireEvent.press(getByTestId('voicechip-gear'));
    expect(ttsStore.openSetupSheet).toHaveBeenCalledTimes(1);
    expect(ttsStore.setAutoSpeak).not.toHaveBeenCalled();
  });

  it('responsive truncation: full name at wide width', () => {
    runInAction(() => {
      ttsStore.currentVoice = systemVoice as any;
    });
    const {getByTestId} = renderChip();
    const toggle = getByTestId('voicechip-toggle');
    // Simulate a wide layout.
    fireEvent(toggle, 'layout', {
      nativeEvent: {layout: {width: 200, height: 44, x: 0, y: 0}},
    });
    expect(getByTestId('voicechip-label').props.children).toBe('Alexandra');
  });

  it('responsive truncation: 3-char prefix at medium width', () => {
    runInAction(() => {
      ttsStore.currentVoice = systemVoice as any;
    });
    const {getByTestId} = renderChip();
    const toggle = getByTestId('voicechip-toggle');
    fireEvent(toggle, 'layout', {
      nativeEvent: {layout: {width: 80, height: 44, x: 0, y: 0}},
    });
    expect(getByTestId('voicechip-label').props.children).toBe('Ale');
  });

  it('responsive truncation: icon-only at narrow width', () => {
    runInAction(() => {
      ttsStore.currentVoice = systemVoice as any;
    });
    const {getByTestId, queryByTestId} = renderChip();
    const toggle = getByTestId('voicechip-toggle');
    fireEvent(toggle, 'layout', {
      nativeEvent: {layout: {width: 50, height: 44, x: 0, y: 0}},
    });
    expect(queryByTestId('voicechip-label')).toBeNull();
  });
});
