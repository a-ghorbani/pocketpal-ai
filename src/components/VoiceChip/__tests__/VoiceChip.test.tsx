import React from 'react';
import {runInAction} from 'mobx';

import {fireEvent, render} from '../../../../jest/test-utils';

import {L10nContext} from '../../../utils';
import {l10n} from '../../../locales';
import {ttsStore} from '../../../store';
import {VolumeMinIcon} from '../../../assets/icons';

import {VoiceChip} from '../VoiceChip';

const renderChip = (collapsedForegroundColor?: string) =>
  render(
    <L10nContext.Provider value={l10n.en}>
      <VoiceChip collapsedForegroundColor={collapsedForegroundColor} />
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
      ttsStore.deviceMeetsMemory = true;
      ttsStore.userTTSOverride = null;
      ttsStore.currentVoice = null;
      ttsStore.autoSpeakEnabled = false;
      ttsStore.playbackState = {mode: 'idle'};
    });
  });

  it('renders nothing when TTS is unavailable', () => {
    runInAction(() => {
      ttsStore.deviceMeetsMemory = false;
      ttsStore.userTTSOverride = null;
    });
    const {queryByTestId} = renderChip();
    expect(queryByTestId('voicechip')).toBeNull();
  });

  it('renders both halves (speaker + secondary) regardless of setup state', () => {
    const {getByTestId} = renderChip();
    expect(getByTestId('voicechip-speaker')).toBeTruthy();
    expect(getByTestId('voicechip-secondary')).toBeTruthy();
  });

  it('pre-setup: speaker tap opens setup sheet (no voice to toggle)', () => {
    const {getByTestId} = renderChip();
    fireEvent.press(getByTestId('voicechip-speaker'));
    expect(ttsStore.openSetupSheet).toHaveBeenCalledTimes(1);
    expect(ttsStore.setAutoSpeak).not.toHaveBeenCalled();
  });

  it('pre-setup: secondary tap opens setup sheet', () => {
    const {getByTestId} = renderChip();
    fireEvent.press(getByTestId('voicechip-secondary'));
    expect(ttsStore.openSetupSheet).toHaveBeenCalledTimes(1);
  });

  it('voice-chosen: speaker tap toggles autoSpeakEnabled', () => {
    runInAction(() => {
      ttsStore.currentVoice = systemVoice;
      ttsStore.autoSpeakEnabled = false;
    });
    const {getByTestId} = renderChip();
    fireEvent.press(getByTestId('voicechip-speaker'));
    expect(ttsStore.setAutoSpeak).toHaveBeenCalledWith(true);
    expect(ttsStore.openSetupSheet).not.toHaveBeenCalled();
  });

  it('voice-chosen: speaker tap while ON toggles autoSpeakEnabled off', () => {
    runInAction(() => {
      ttsStore.currentVoice = systemVoice;
      ttsStore.autoSpeakEnabled = true;
    });
    const {getByTestId} = renderChip();
    fireEvent.press(getByTestId('voicechip-speaker'));
    expect(ttsStore.setAutoSpeak).toHaveBeenCalledWith(false);
  });

  it('voice-chosen: secondary tap opens setup sheet, does not toggle', () => {
    runInAction(() => {
      ttsStore.currentVoice = systemVoice;
      ttsStore.autoSpeakEnabled = false;
    });
    const {getByTestId} = renderChip();
    fireEvent.press(getByTestId('voicechip-secondary'));
    expect(ttsStore.openSetupSheet).toHaveBeenCalledTimes(1);
    expect(ttsStore.setAutoSpeak).not.toHaveBeenCalled();
  });

  it('speaker accessibilityState reflects autoSpeakEnabled post-setup', () => {
    runInAction(() => {
      ttsStore.currentVoice = systemVoice;
      ttsStore.autoSpeakEnabled = true;
    });
    const {getByTestId} = renderChip();
    const speaker = getByTestId('voicechip-speaker');
    expect(speaker.props.accessibilityState).toEqual({selected: true});
  });

  it('pre-setup speaker accessibilityState has no selected flag', () => {
    const {getByTestId} = renderChip();
    const speaker = getByTestId('voicechip-speaker');
    // Pressable synthesizes an accessibilityState object; the selected key
    // should be undefined pre-setup since the component doesn't pass it.
    expect(speaker.props.accessibilityState?.selected).toBeUndefined();
  });

  it('uses a composer foreground override only in the collapsed state', () => {
    runInAction(() => {
      ttsStore.currentVoice = systemVoice;
      ttsStore.autoSpeakEnabled = false;
    });
    const {UNSAFE_getAllByType, rerender} = renderChip(
      'rgba(184, 154, 98, 0.9)',
    );

    expect(
      UNSAFE_getAllByType(VolumeMinIcon).some(
        icon => icon.props.stroke === 'rgba(184, 154, 98, 0.9)',
      ),
    ).toBe(true);

    runInAction(() => {
      ttsStore.autoSpeakEnabled = true;
    });
    rerender(
      <L10nContext.Provider value={l10n.en}>
        <VoiceChip collapsedForegroundColor="rgba(184, 154, 98, 0.9)" />
      </L10nContext.Provider>,
    );

    expect(
      UNSAFE_getAllByType(VolumeMinIcon).some(
        icon => icon.props.stroke === 'rgba(184, 154, 98, 0.9)',
      ),
    ).toBe(false);
  });
});
