import React from 'react';
import {runInAction} from 'mobx';

import {fireEvent, render} from '../../../../jest/test-utils';

import {L10nContext} from '../../../utils';
import {l10n} from '../../../locales';
import {ttsStore} from '../../../store';
import {getEngine, TTS_PREVIEW_SAMPLE} from '../../../services/tts';

import {HeroRow} from '../HeroRow';

jest.mock('../../../services/tts', () => {
  const actual = jest.requireActual('../../../services/tts');
  const play = jest.fn().mockResolvedValue(undefined);
  return {
    ...actual,
    getEngine: (id: string) => ({
      id,
      play,
      isInstalled: jest.fn().mockResolvedValue(true),
      getVoices: jest.fn().mockResolvedValue([]),
      playStreaming: jest.fn(),
      stop: jest.fn().mockResolvedValue(undefined),
    }),
  };
});

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

  it('preview button calls engine.play with TTS_PREVIEW_SAMPLE', () => {
    runInAction(() => {
      ttsStore.currentVoice = {
        id: 'af_heart',
        name: 'Heart',
        engine: 'kokoro',
      };
    });
    const {getByTestId} = renderHero();
    fireEvent.press(getByTestId('tts-hero-preview-button'));
    expect(getEngine('kokoro').play).toHaveBeenCalledWith(
      TTS_PREVIEW_SAMPLE,
      expect.objectContaining({id: 'af_heart', engine: 'kokoro'}),
    );
  });
});
