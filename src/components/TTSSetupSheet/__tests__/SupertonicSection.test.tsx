import React from 'react';
import {runInAction} from 'mobx';

import {fireEvent, render} from '../../../../jest/test-utils';

import {L10nContext} from '../../../utils';
import {l10n} from '../../../locales';
import {ttsStore} from '../../../store';
import {getEngine, TTS_PREVIEW_SAMPLE} from '../../../services/tts';

import {SupertonicSection} from '../SupertonicSection';

// Spy on the supertonic engine's play method without replacing the whole
// engine registry — the SupertonicSection only needs a functional play().
jest.mock('../../../services/tts', () => {
  const actual = jest.requireActual('../../../services/tts');
  const supertonicPlay = jest.fn().mockResolvedValue(undefined);
  return {
    ...actual,
    __supertonicPlay: supertonicPlay,
    getEngine: (id: 'system' | 'supertonic') => {
      if (id === 'supertonic') {
        return {
          id: 'supertonic',
          isInstalled: jest.fn().mockResolvedValue(true),
          getVoices: jest.fn().mockResolvedValue([]),
          play: supertonicPlay,
          playStreaming: jest.fn(),
          stop: jest.fn().mockResolvedValue(undefined),
          downloadModel: jest.fn().mockResolvedValue(undefined),
          deleteModel: jest.fn().mockResolvedValue(undefined),
        };
      }
      return actual.getEngine(id);
    },
  };
});

const renderSection = () =>
  render(
    <L10nContext.Provider value={l10n.en}>
      <SupertonicSection />
    </L10nContext.Provider>,
    {withBottomSheetProvider: true, withSafeArea: true},
  );

describe('SupertonicSection (v1.2 live)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    runInAction(() => {
      ttsStore.supertonicDownloadState = 'not_installed';
      ttsStore.supertonicDownloadProgress = 0;
      ttsStore.supertonicDownloadError = null;
      ttsStore.currentVoice = null;
    });
  });

  it('renders Install CTA when not_installed', () => {
    const {getByTestId, getByText} = renderSection();
    expect(getByTestId('tts-supertonic-install-cta')).toBeTruthy();
    expect(getByText(l10n.en.voiceAndSpeech.supertonicInstallCta)).toBeTruthy();
    expect(getByTestId('tts-supertonic-install-button')).toBeTruthy();
  });

  it('rows are disabled/non-selectable when not_installed', () => {
    const {getByTestId} = renderSection();
    for (const voiceId of ['F1', 'M1', 'M5']) {
      const row = getByTestId(`tts-supertonic-voice-${voiceId}`);
      expect(row.props.accessibilityState?.disabled).toBe(true);
      const preview = getByTestId(`tts-supertonic-preview-${voiceId}`);
      expect(preview.props.accessibilityState?.disabled).toBe(true);
    }
  });

  it('tapping Install triggers downloadSupertonic on the store', () => {
    const {getByTestId} = renderSection();
    fireEvent.press(getByTestId('tts-supertonic-install-button'));
    expect(ttsStore.downloadSupertonic).toHaveBeenCalledTimes(1);
  });

  it('renders downloading card with color-fill at current progress', () => {
    runInAction(() => {
      ttsStore.supertonicDownloadState = 'downloading';
      ttsStore.supertonicDownloadProgress = 0.42;
    });
    const {getByTestId, getByText} = renderSection();
    expect(getByTestId('tts-supertonic-downloading-card')).toBeTruthy();
    const fill = getByTestId('tts-supertonic-downloading-fill');
    // StyleSheet.flatten returns an object; width comes in as a percent string.
    const styleArr = Array.isArray(fill.props.style)
      ? fill.props.style
      : [fill.props.style];
    const flat = Object.assign({}, ...styleArr);
    expect(flat.width).toBe('42%');
    expect(getByText('42%')).toBeTruthy();
  });

  it('renders error card with Retry button when error', () => {
    runInAction(() => {
      ttsStore.supertonicDownloadState = 'error';
      ttsStore.supertonicDownloadError = 'network down';
    });
    const {getByTestId, getByText} = renderSection();
    expect(getByTestId('tts-supertonic-error-card')).toBeTruthy();
    expect(getByText('network down')).toBeTruthy();
    fireEvent.press(getByTestId('tts-supertonic-retry-button'));
    expect(ttsStore.retryDownload).toHaveBeenCalledTimes(1);
  });

  it('voice rows become selectable when ready; tap sets currentVoice and closes sheet', () => {
    runInAction(() => {
      ttsStore.supertonicDownloadState = 'ready';
    });
    const {getByTestId} = renderSection();
    // No install/progress card when ready.
    expect(() => getByTestId('tts-supertonic-install-cta')).toThrow();
    expect(() => getByTestId('tts-supertonic-downloading-card')).toThrow();

    fireEvent.press(getByTestId('tts-supertonic-voice-F1'));
    expect(ttsStore.setCurrentVoice).toHaveBeenCalledWith(
      expect.objectContaining({id: 'F1', engine: 'supertonic'}),
    );
    expect(ttsStore.closeSetupSheet).toHaveBeenCalledTimes(1);
  });

  it('preview button when ready synthesizes TTS_PREVIEW_SAMPLE via the engine', () => {
    runInAction(() => {
      ttsStore.supertonicDownloadState = 'ready';
    });
    const {getByTestId} = renderSection();
    fireEvent.press(getByTestId('tts-supertonic-preview-F2'));

    const engine = getEngine('supertonic');
    expect(engine.play).toHaveBeenCalledWith(
      TTS_PREVIEW_SAMPLE,
      expect.objectContaining({id: 'F2', engine: 'supertonic'}),
    );
  });
});
