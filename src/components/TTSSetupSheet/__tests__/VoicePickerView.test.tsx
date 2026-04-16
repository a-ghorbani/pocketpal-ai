import React from 'react';
import {runInAction} from 'mobx';

import {fireEvent, render} from '../../../../jest/test-utils';

import {L10nContext} from '../../../utils';
import {l10n} from '../../../locales';
import {ttsStore} from '../../../store';

import {VoicePickerView} from '../VoicePickerView';

const renderView = () =>
  render(
    <L10nContext.Provider value={l10n.en}>
      <VoicePickerView />
    </L10nContext.Provider>,
    {withBottomSheetProvider: true, withSafeArea: true},
  );

describe('VoicePickerView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    runInAction(() => {
      ttsStore.currentVoice = null;
      ttsStore.kittenDownloadState = 'not_installed';
      ttsStore.kokoroDownloadState = 'not_installed';
      ttsStore.supertonicDownloadState = 'not_installed';
    });
  });

  it('renders one engine group per engine in fixed order', () => {
    const {getByTestId} = renderView();
    expect(getByTestId('tts-engine-group-kitten')).toBeTruthy();
    expect(getByTestId('tts-engine-group-kokoro')).toBeTruthy();
    expect(getByTestId('tts-engine-group-supertonic')).toBeTruthy();
    expect(getByTestId('tts-engine-group-system')).toBeTruthy();
  });

  it('groups start collapsed when no current voice; tap expands', () => {
    const {getByTestId, queryByTestId} = renderView();
    // Collapsed → install button not rendered yet.
    expect(queryByTestId('tts-kitten-install-button')).toBeNull();
    fireEvent.press(getByTestId('tts-engine-group-toggle-kitten'));
    expect(getByTestId('tts-kitten-install-button')).toBeTruthy();
  });

  it('expanded ready group exposes voice rows with preview', () => {
    runInAction(() => {
      ttsStore.kittenDownloadState = 'ready';
    });
    const {getByTestId} = renderView();
    fireEvent.press(getByTestId('tts-engine-group-toggle-kitten'));
    expect(getByTestId('tts-voice-row-kitten-expr-voice-2-f')).toBeTruthy();
    expect(getByTestId('tts-voice-preview-kitten-expr-voice-2-f')).toBeTruthy();
  });

  it('expanded not-installed group shows engine install button', () => {
    const {getByTestId} = renderView();
    fireEvent.press(getByTestId('tts-engine-group-toggle-kokoro'));
    expect(getByTestId('tts-kokoro-install-button')).toBeTruthy();
    fireEvent.press(getByTestId('tts-kokoro-install-button'));
    expect(ttsStore.downloadKokoro).toHaveBeenCalled();
  });

  it('tapping a ready voice calls setCurrentVoice and closes the sheet', () => {
    runInAction(() => {
      ttsStore.kittenDownloadState = 'ready';
    });
    const {getByTestId} = renderView();
    fireEvent.press(getByTestId('tts-engine-group-toggle-kitten'));
    fireEvent.press(getByTestId('tts-voice-row-kitten-expr-voice-2-f'));
    expect(ttsStore.setCurrentVoice).toHaveBeenCalledWith(
      expect.objectContaining({id: 'expr-voice-2-f', engine: 'kitten'}),
    );
    expect(ttsStore.closeSetupSheet).toHaveBeenCalled();
  });

  it('default-expands the active engine group on first render', () => {
    runInAction(() => {
      ttsStore.kokoroDownloadState = 'ready';
      ttsStore.currentVoice = {
        id: 'af_heart',
        name: 'Heart',
        engine: 'kokoro',
      };
    });
    const {getByTestId} = renderView();
    // Active group is expanded → voice rows visible without a manual toggle.
    expect(getByTestId('tts-voice-row-kokoro-af_heart')).toBeTruthy();
  });
});
