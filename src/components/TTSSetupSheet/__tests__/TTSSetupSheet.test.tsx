import React from 'react';
import {runInAction} from 'mobx';

import {render} from '../../../../jest/test-utils';

import {L10nContext} from '../../../utils';
import {l10n} from '../../../locales';
import {ttsStore} from '../../../store';

import {TTSSetupSheet} from '../TTSSetupSheet';

const renderSheet = () =>
  render(
    <L10nContext.Provider value={l10n.en}>
      <TTSSetupSheet />
    </L10nContext.Provider>,
    {withBottomSheetProvider: true, withSafeArea: true},
  );

describe('TTSSetupSheet (voice-led, single view)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    runInAction(() => {
      ttsStore.isSetupSheetOpen = true;
      ttsStore.currentVoice = null;
      ttsStore.supertonicDownloadState = 'not_installed';
      ttsStore.kokoroDownloadState = 'not_installed';
      ttsStore.kittenDownloadState = 'not_installed';
    });
  });

  it('renders the unified voices view with neural engine groups (system hidden)', () => {
    const {getByTestId, queryByTestId} = renderSheet();
    expect(getByTestId('tts-voice-picker')).toBeTruthy();
    expect(getByTestId('tts-engine-group-kitten')).toBeTruthy();
    expect(getByTestId('tts-engine-group-kokoro')).toBeTruthy();
    expect(getByTestId('tts-engine-group-supertonic')).toBeTruthy();
    expect(queryByTestId('tts-engine-group-system')).toBeNull();
  });

  it('shows hero strip + auto-speak when a voice is current', () => {
    runInAction(() => {
      ttsStore.kokoroDownloadState = 'ready';
      ttsStore.currentVoice = {
        id: 'af_heart',
        name: 'Heart',
        engine: 'kokoro',
      };
    });
    const {getByTestId} = renderSheet();
    expect(getByTestId('tts-hero-row')).toBeTruthy();
    expect(getByTestId('tts-auto-speak-row')).toBeTruthy();
  });

  it('hides hero strip + auto-speak when no voice is current', () => {
    const {queryByTestId} = renderSheet();
    expect(queryByTestId('tts-hero-row')).toBeNull();
    expect(queryByTestId('tts-auto-speak-row')).toBeNull();
  });
});
