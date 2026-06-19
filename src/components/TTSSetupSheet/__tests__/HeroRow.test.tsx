import React from 'react';
import {runInAction} from 'mobx';

import {fireEvent, render} from '../../../../jest/test-utils';

import {L10nContext} from '../../../utils';
import {l10n} from '../../../locales';
import {ttsStore} from '../../../store';

import {HeroRow} from '../HeroRow';

// HeroRow routes preview through ttsStore.preview (the store-level
// coordinator). The store is globally mocked via __mocks__/stores/ttsStore
// — no engine mock needed here.

const renderHero = () =>
  render(
    <L10nContext.Provider value={l10n.en}>
      <HeroRow />
    </L10nContext.Provider>,
  );

describe('HeroRow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    runInAction(() => {
      ttsStore.currentVoice = null;
      ttsStore.supertonicDownloadState = 'not_installed';
      ttsStore.supertonicLanguage = 'na';
    });
  });

  it('renders nothing when currentVoice is null', () => {
    const {queryByTestId} = renderHero();
    expect(queryByTestId('tts-hero-row')).toBeNull();
    expect(queryByTestId('tts-hero-preview-button')).toBeNull();
  });

  it('renders voice name and preview button when a voice is current', () => {
    runInAction(() => {
      ttsStore.currentVoice = {
        id: 'af_heart',
        name: 'Heart',
        engine: 'kokoro',
      };
    });
    const {getByTestId} = renderHero();
    expect(getByTestId('tts-hero-voice-name').props.children).toBe('Heart');
    expect(getByTestId('tts-hero-preview-button')).toBeTruthy();
  });

  it('preview button routes through ttsStore.preview', () => {
    runInAction(() => {
      ttsStore.currentVoice = {
        id: 'af_heart',
        name: 'Heart',
        engine: 'kokoro',
      };
    });
    const {getByTestId} = renderHero();
    fireEvent.press(getByTestId('tts-hero-preview-button'));
    expect(ttsStore.preview).toHaveBeenCalledWith(
      expect.objectContaining({id: 'af_heart', engine: 'kokoro'}),
    );
  });

  it('button calls stop when a preview is already in flight', () => {
    runInAction(() => {
      ttsStore.currentVoice = {
        id: 'af_heart',
        name: 'Heart',
        engine: 'kokoro',
      };
    });
    (ttsStore.isPreviewingVoice as jest.Mock).mockReturnValue(true);

    const {getByTestId} = renderHero();
    fireEvent.press(getByTestId('tts-hero-preview-button'));

    expect(ttsStore.stop).toHaveBeenCalled();
    expect(ttsStore.preview).not.toHaveBeenCalled();
  });

  describe('language picker', () => {
    const setSupertonicReady = () => {
      runInAction(() => {
        ttsStore.currentVoice = {
          id: 'aria',
          name: 'Aria',
          engine: 'supertonic',
        };
        ttsStore.supertonicDownloadState = 'ready';
        ttsStore.supertonicLanguage = 'na';
      });
    };

    it('shows the picker when Supertonic is current and ready', () => {
      setSupertonicReady();
      const {getByTestId} = renderHero();
      expect(getByTestId('tts-hero-language-picker')).toBeTruthy();
    });

    it('hides the picker for a non-Supertonic voice', () => {
      runInAction(() => {
        ttsStore.currentVoice = {
          id: 'af_heart',
          name: 'Heart',
          engine: 'kokoro',
        };
        ttsStore.supertonicDownloadState = 'ready';
      });
      const {queryByTestId} = renderHero();
      expect(queryByTestId('tts-hero-language-picker')).toBeNull();
    });

    it('hides the picker while Supertonic is still downloading', () => {
      runInAction(() => {
        ttsStore.currentVoice = {
          id: 'aria',
          name: 'Aria',
          engine: 'supertonic',
        };
        ttsStore.supertonicDownloadState = 'downloading';
      });
      const {queryByTestId} = renderHero();
      expect(queryByTestId('tts-hero-language-picker')).toBeNull();
    });

    it('selecting a language calls setSupertonicLanguage', () => {
      setSupertonicReady();
      const {getByTestId, getByText} = renderHero();
      fireEvent.press(getByTestId('tts-hero-language-picker'));
      fireEvent.press(getByText('Japanese'));
      expect(ttsStore.setSupertonicLanguage).toHaveBeenCalledWith('ja');
    });

    it('shows the Auto label for an out-of-union persisted value without rewriting it', () => {
      setSupertonicReady();
      runInAction(() => {
        // A code not in 2.5.0's union (e.g. from a future build).
        (ttsStore as any).supertonicLanguage = 'xx';
      });
      const {getByText} = renderHero();
      // Trigger label falls back to the "Auto" placeholder for an unlisted code.
      expect(getByText('Auto')).toBeTruthy();
      // The label-only fallback must NOT coerce the stored value back to na.
      expect(ttsStore.setSupertonicLanguage).not.toHaveBeenCalled();
    });
  });
});
