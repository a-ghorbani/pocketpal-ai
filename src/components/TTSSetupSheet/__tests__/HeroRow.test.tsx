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
    __kokoroPlay: play,
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

const renderHero = (onOpenBrowse = jest.fn()) =>
  render(
    <L10nContext.Provider value={l10n.en}>
      <HeroRow onOpenBrowse={onOpenBrowse} />
    </L10nContext.Provider>,
  );

describe('HeroRow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    runInAction(() => {
      ttsStore.currentVoice = null;
    });
  });

  it('shows notSet when currentVoice is null', () => {
    const {getByTestId, queryByTestId} = renderHero();
    expect(getByTestId('tts-hero-voice-not-set')).toBeTruthy();
    expect(queryByTestId('tts-hero-preview-button')).toBeNull();
  });

  it('renders voice name, engine chip, and preview button when current', () => {
    runInAction(() => {
      ttsStore.currentVoice = {
        id: 'af_heart',
        name: 'Heart',
        engine: 'kokoro',
      };
    });
    const {getByTestId, getByText} = renderHero();
    expect(getByTestId('tts-hero-voice-name').props.children).toBe('Heart');
    expect(getByText(l10n.en.voiceAndSpeech.engineChipKokoro)).toBeTruthy();
    expect(getByTestId('tts-hero-preview-button')).toBeTruthy();
  });

  it('renders catalog-derived character chip (Heart → Warm)', () => {
    runInAction(() => {
      ttsStore.currentVoice = {
        id: 'af_heart',
        name: 'Heart',
        engine: 'kokoro',
      };
    });
    const {getByText} = renderHero();
    expect(getByText(l10n.en.voiceAndSpeech.characterWarm)).toBeTruthy();
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

  it('tapping the hero row body invokes onOpenBrowse', () => {
    const onOpen = jest.fn();
    const {getByTestId} = renderHero(onOpen);
    fireEvent.press(getByTestId('tts-hero-row'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
