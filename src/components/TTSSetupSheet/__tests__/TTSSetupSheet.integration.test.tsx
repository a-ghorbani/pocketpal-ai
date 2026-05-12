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
 * End-to-end flow: PlayButton → TTSStore → unified voices sheet.
 * No voice selected → tap PlayButton opens the sheet on the voices view;
 * picking a ready voice selects it and closes.
 */
describe('TTS setup end-to-end (single-view)', () => {
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
      ttsStore.deviceMeetsMemory = true;
      ttsStore.userTTSOverride = null;
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

  it('picking a ready voice from an expanded engine group selects it and closes the sheet', () => {
    runInAction(() => {
      ttsStore.isSetupSheetOpen = true;
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
      fireEvent.press(getByTestId('tts-engine-group-toggle-kitten'));
    });
    act(() => {
      fireEvent.press(getByTestId('tts-voice-row-kitten-expr-voice-2-f'));
    });

    expect(ttsStore.setCurrentVoice).toHaveBeenCalledWith(
      expect.objectContaining({id: 'expr-voice-2-f', engine: 'kitten'}),
    );
    expect(ttsStore.closeSetupSheet).toHaveBeenCalled();
  });
});
