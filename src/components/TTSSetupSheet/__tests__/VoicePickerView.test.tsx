import React from 'react';
import {runInAction} from 'mobx';

import {act, fireEvent, render, waitFor} from '../../../../jest/test-utils';

import {L10nContext} from '../../../utils';
import {l10n} from '../../../locales';
import {ttsStore} from '../../../store';

import {VoicePickerView} from '../VoicePickerView';

const renderView = () =>
  render(
    <L10nContext.Provider value={l10n.en}>
      <VoicePickerView onBack={jest.fn()} />
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

  it('renders character group headers in order Warm / Clear / Deep / Bright', async () => {
    const {getByTestId} = renderView();
    await waitFor(() => expect(getByTestId('tts-voice-group-warm')).toBeTruthy());
    expect(getByTestId('tts-voice-group-warm')).toBeTruthy();
    expect(getByTestId('tts-voice-group-clear')).toBeTruthy();
    expect(getByTestId('tts-voice-group-deep')).toBeTruthy();
    expect(getByTestId('tts-voice-group-bright')).toBeTruthy();
  });

  it('never renders section-level install CTAs in Browse', () => {
    const {queryByTestId} = renderView();
    expect(queryByTestId('tts-kitten-section')).toBeNull();
    expect(queryByTestId('tts-kokoro-section')).toBeNull();
    expect(queryByTestId('tts-supertonic-section')).toBeNull();
  });

  it('rows from a non-ready engine have no preview button', () => {
    const {getByTestId, queryByTestId} = renderView();
    // Kitten not_installed → no preview button
    expect(getByTestId('tts-voice-row-kitten-expr-voice-2-f')).toBeTruthy();
    expect(
      queryByTestId('tts-voice-preview-kitten-expr-voice-2-f'),
    ).toBeNull();
  });

  it('ready engine rows expose a preview button', () => {
    runInAction(() => {
      ttsStore.kittenDownloadState = 'ready';
    });
    const {getByTestId} = renderView();
    expect(
      getByTestId('tts-voice-preview-kitten-expr-voice-2-f'),
    ).toBeTruthy();
  });

  it('tapping a ready voice calls setCurrentVoice and closeSetupSheet', () => {
    runInAction(() => {
      ttsStore.kittenDownloadState = 'ready';
    });
    const {getByTestId} = renderView();
    fireEvent.press(getByTestId('tts-voice-row-kitten-expr-voice-2-f'));
    expect(ttsStore.setCurrentVoice).toHaveBeenCalledWith(
      expect.objectContaining({id: 'expr-voice-2-f', engine: 'kitten'}),
    );
    expect(ttsStore.closeSetupSheet).toHaveBeenCalled();
  });

  it('tapping a dimmed voice expands inline install CTA; Install calls downloadEngine', () => {
    const {getByTestId, queryByTestId} = renderView();
    expect(queryByTestId('tts-install-cta-kokoro')).toBeNull();
    fireEvent.press(getByTestId('tts-voice-row-kokoro-af_heart'));
    expect(getByTestId('tts-install-cta-kokoro')).toBeTruthy();
    fireEvent.press(getByTestId('tts-install-now-kokoro'));
    expect(ttsStore.downloadKokoro).toHaveBeenCalled();
  });

  it('transitioning download state to ready auto-selects the pending voice and closes sheet', () => {
    const {getByTestId} = renderView();
    fireEvent.press(getByTestId('tts-voice-row-kokoro-af_heart'));
    fireEvent.press(getByTestId('tts-install-now-kokoro'));

    // Simulate download completing.
    act(() => {
      runInAction(() => {
        ttsStore.kokoroDownloadState = 'ready';
      });
    });

    expect(ttsStore.setCurrentVoice).toHaveBeenCalledWith(
      expect.objectContaining({id: 'af_heart', engine: 'kokoro'}),
    );
    expect(ttsStore.closeSetupSheet).toHaveBeenCalled();
  });
});
