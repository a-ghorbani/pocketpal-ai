import React from 'react';
import {BackHandler} from 'react-native';
import {runInAction} from 'mobx';

import {act, fireEvent, render} from '../../../../jest/test-utils';

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

describe('TTSSetupSheet (voice-led)', () => {
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

  it('primary view renders hero + Browse + AutoSpeak + Manage (no install CTAs)', () => {
    const {getByTestId, queryByTestId} = renderSheet();
    expect(getByTestId('tts-setup-sheet')).toBeTruthy();
    expect(getByTestId('tts-hero-row')).toBeTruthy();
    expect(getByTestId('tts-browse-row')).toBeTruthy();
    expect(getByTestId('tts-auto-speak-row')).toBeTruthy();
    expect(getByTestId('tts-manage-row')).toBeTruthy();
    // No section install CTAs on primary
    expect(queryByTestId('tts-kitten-install-cta')).toBeNull();
    expect(queryByTestId('tts-kokoro-install-cta')).toBeNull();
    expect(queryByTestId('tts-supertonic-install-cta')).toBeNull();
  });

  it('Supertonic quality row hidden when current voice is not Supertonic', () => {
    runInAction(() => {
      ttsStore.currentVoice = {
        id: 'af_heart',
        name: 'Heart',
        engine: 'kokoro',
      };
      ttsStore.kokoroDownloadState = 'ready';
    });
    const {queryByTestId} = renderSheet();
    expect(queryByTestId('tts-supertonic-steps-row')).toBeNull();
  });

  it('Supertonic quality row visible iff current voice is Supertonic and engine is ready', () => {
    runInAction(() => {
      ttsStore.currentVoice = {
        id: 'F1',
        name: 'Sarah',
        engine: 'supertonic',
      };
      ttsStore.supertonicDownloadState = 'ready';
    });
    const {getByTestId} = renderSheet();
    expect(getByTestId('tts-supertonic-steps-row')).toBeTruthy();
  });

  it('tapping Browse row switches to VoicePickerView', () => {
    const {getByTestId, queryByTestId} = renderSheet();
    fireEvent.press(getByTestId('tts-browse-row'));
    expect(getByTestId('tts-voice-picker')).toBeTruthy();
    expect(queryByTestId('tts-hero-row')).toBeNull();
  });

  it('tapping Manage row switches to ManageEnginesView', () => {
    const {getByTestId, queryByTestId} = renderSheet();
    fireEvent.press(getByTestId('tts-manage-row'));
    expect(getByTestId('tts-manage-engines')).toBeTruthy();
    expect(queryByTestId('tts-hero-row')).toBeNull();
  });

  it('view resets to primary after closeSetupSheet + re-open', () => {
    const {getByTestId, queryByTestId, rerender} = renderSheet();
    fireEvent.press(getByTestId('tts-browse-row'));
    expect(getByTestId('tts-voice-picker')).toBeTruthy();

    act(() => {
      runInAction(() => {
        ttsStore.isSetupSheetOpen = false;
      });
    });
    rerender(
      <L10nContext.Provider value={l10n.en}>
        <TTSSetupSheet />
      </L10nContext.Provider>,
    );
    act(() => {
      runInAction(() => {
        ttsStore.isSetupSheetOpen = true;
      });
    });
    rerender(
      <L10nContext.Provider value={l10n.en}>
        <TTSSetupSheet />
      </L10nContext.Provider>,
    );

    expect(getByTestId('tts-hero-row')).toBeTruthy();
    expect(queryByTestId('tts-voice-picker')).toBeNull();
  });

  describe('Android BackHandler', () => {
    let addSpy: jest.SpyInstance;
    const handlers: Array<() => boolean> = [];

    beforeEach(() => {
      handlers.length = 0;
      addSpy = jest
        .spyOn(BackHandler, 'addEventListener')
        .mockImplementation((_ev, cb) => {
          handlers.push(cb as () => boolean);
          return {remove: jest.fn()};
        });
    });

    afterEach(() => {
      addSpy.mockRestore();
    });

    it('view === secondary + hardware back → pops to primary, sheet stays open', () => {
      const {getByTestId} = renderSheet();
      fireEvent.press(getByTestId('tts-browse-row'));
      expect(handlers.length).toBeGreaterThan(0);
      let consumed = false;
      act(() => {
        consumed = handlers[handlers.length - 1]();
      });
      expect(consumed).toBe(true);
      // Sheet stays open; we did not call closeSetupSheet.
      expect(ttsStore.closeSetupSheet).not.toHaveBeenCalled();
      // Next render: we're back on primary.
      expect(getByTestId('tts-hero-row')).toBeTruthy();
    });

    it('view === primary + back → no handler registered (default close runs)', () => {
      renderSheet();
      // On primary, we should not have subscribed at all — addEventListener
      // is only called when view is secondary.
      expect(addSpy).not.toHaveBeenCalled();
    });
  });
});
