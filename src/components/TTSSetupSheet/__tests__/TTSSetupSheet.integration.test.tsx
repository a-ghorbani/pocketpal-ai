import React from 'react';
import {runInAction} from 'mobx';

import {act, fireEvent, render} from '../../../../jest/test-utils';

import {L10nContext} from '../../../utils';
import {assistant} from '../../../utils/chat';
import {l10n} from '../../../locales';
import {modelStore, ttsStore} from '../../../store';
import type {MessageType} from '../../../utils/types';

import {PlayButton} from '../../TextMessage/PlayButton';
import {TTSSetupSheet} from '../TTSSetupSheet';

/**
 * End-to-end flow: PlayButton → TTSStore → voice-led setup sheet. With
 * no voice selected, tapping the PlayButton opens the sheet on the
 * primary view; picking a voice from Browse selects it and closes.
 */
describe('TTS setup end-to-end', () => {
  const makeAssistantMsg = (): MessageType.DerivedText =>
    ({
      id: 'msg-e2e',
      type: 'text',
      author: {id: assistant.id},
      text: 'Hello there friend',
      metadata: {completionResult: {content: 'Hello there friend'}},
    }) as unknown as MessageType.DerivedText;

  beforeEach(() => {
    jest.clearAllMocks();
    runInAction(() => {
      ttsStore.isTTSAvailable = true;
      ttsStore.currentVoice = null;
      ttsStore.playbackState = {mode: 'idle'};
      ttsStore.isSetupSheetOpen = false;
      ttsStore.kittenDownloadState = 'not_installed';
      ttsStore.kokoroDownloadState = 'not_installed';
      ttsStore.supertonicDownloadState = 'not_installed';
      modelStore.isStreaming = false;
    });
  });

  it('first tap on PlayButton with no voice opens the setup sheet and never calls play', () => {
    (ttsStore.openSetupSheet as jest.Mock).mockImplementation(() => {
      runInAction(() => {
        ttsStore.isSetupSheetOpen = true;
      });
    });

    const {getByTestId} = render(
      <L10nContext.Provider value={l10n.en}>
        <PlayButton message={makeAssistantMsg()} />
      </L10nContext.Provider>,
    );

    fireEvent.press(getByTestId('playbutton-msg-e2e'));

    expect(ttsStore.openSetupSheet).toHaveBeenCalledTimes(1);
    expect(ttsStore.play).not.toHaveBeenCalled();
    expect(ttsStore.isSetupSheetOpen).toBe(true);
  });

  it('navigating primary → Browse → Manage → back returns to primary', () => {
    runInAction(() => {
      ttsStore.isSetupSheetOpen = true;
    });
    const {getByTestId} = render(
      <L10nContext.Provider value={l10n.en}>
        <TTSSetupSheet />
      </L10nContext.Provider>,
      {withBottomSheetProvider: true, withSafeArea: true},
    );

    expect(getByTestId('tts-hero-row')).toBeTruthy();
    fireEvent.press(getByTestId('tts-browse-row'));
    expect(getByTestId('tts-voice-picker')).toBeTruthy();
    fireEvent.press(getByTestId('tts-voice-picker-header-back'));
    expect(getByTestId('tts-hero-row')).toBeTruthy();
    fireEvent.press(getByTestId('tts-manage-row'));
    expect(getByTestId('tts-manage-engines')).toBeTruthy();
    fireEvent.press(getByTestId('tts-manage-engines-header-back'));
    expect(getByTestId('tts-hero-row')).toBeTruthy();
  });

  it('picking a ready voice in Browse sets currentVoice and closes the sheet', async () => {
    runInAction(() => {
      ttsStore.isSetupSheetOpen = true;
      // Make Kitten ready so at least some neural voices are selectable.
      ttsStore.kittenDownloadState = 'ready';
    });

    (ttsStore.setCurrentVoice as jest.Mock).mockImplementation(voice => {
      runInAction(() => {
        ttsStore.currentVoice = voice as any;
      });
    });
    (ttsStore.closeSetupSheet as jest.Mock).mockImplementation(() => {
      runInAction(() => {
        ttsStore.isSetupSheetOpen = false;
      });
    });

    const {getByTestId} = render(
      <L10nContext.Provider value={l10n.en}>
        <TTSSetupSheet />
      </L10nContext.Provider>,
      {withBottomSheetProvider: true, withSafeArea: true},
    );

    act(() => {
      fireEvent.press(getByTestId('tts-browse-row'));
    });

    // Bella (kitten, warm) is a ready voice we can safely target.
    act(() => {
      fireEvent.press(getByTestId('tts-voice-row-kitten-expr-voice-2-f'));
    });

    expect(ttsStore.setCurrentVoice).toHaveBeenCalledWith(
      expect.objectContaining({id: 'expr-voice-2-f', engine: 'kitten'}),
    );
    expect(ttsStore.closeSetupSheet).toHaveBeenCalled();
  });
});
