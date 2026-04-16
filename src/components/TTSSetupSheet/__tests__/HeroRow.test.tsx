import React from 'react';
import {runInAction} from 'mobx';

import {fireEvent, render} from '../../../../jest/test-utils';

import {L10nContext} from '../../../utils';
import {l10n} from '../../../locales';
import {ttsStore} from '../../../store';

import {HeroRow} from '../HeroRow';

// HeroRow now routes preview through ttsStore.preview (which is the
// store-level coordinator). The store is globally mocked via the
// __mocks__/stores/ttsStore module — no engine mock needed here.

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
});
