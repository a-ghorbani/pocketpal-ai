import React from 'react';
import {runInAction} from 'mobx';

import {act, fireEvent, render, waitFor} from '../../../../jest/test-utils';

import {L10nContext} from '../../../utils';
import {assistant} from '../../../utils/chat';
import {l10n} from '../../../locales';
import {modelStore, ttsStore} from '../../../store';
import type {MessageType} from '../../../utils/types';

import {PlayButton} from '../../TextMessage/PlayButton';
import {SystemSection} from '../SystemSection';
import {SupertonicSection} from '../SupertonicSection';
import {TTSSetupSheet} from '../TTSSetupSheet';

/**
 * End-to-end "first tap play" integration flow that crosses PlayButton →
 * TTSStore → TTSSetupSheet/SystemSection. Validates the narrative the
 * unit tests only touch in pieces.
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
      modelStore.isStreaming = false;
    });
  });

  it('first tap on PlayButton with no voice opens the setup sheet and never calls play', () => {
    // Drive the store "open" side-effect for this test.
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

  it('picking a System voice sets currentVoice, closes the sheet, and unblocks playback', async () => {
    runInAction(() => {
      ttsStore.isSetupSheetOpen = true;
    });

    // Simulate the real store behavior: selecting updates currentVoice
    // and closing toggles isSetupSheetOpen off.
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
        <SystemSection visible={true} />
      </L10nContext.Provider>,
      {withBottomSheetProvider: true, withSafeArea: true},
    );

    // Wait for mocked Speech.getVoices() to resolve
    await waitFor(() =>
      expect(
        getByTestId('tts-system-voice-com.apple.voice.Sarah'),
      ).toBeTruthy(),
    );

    fireEvent.press(getByTestId('tts-system-voice-com.apple.voice.Sarah'));

    expect(ttsStore.setCurrentVoice).toHaveBeenCalledWith(
      expect.objectContaining({engine: 'system'}),
    );
    expect(ttsStore.closeSetupSheet).toHaveBeenCalledTimes(1);
    expect(ttsStore.isSetupSheetOpen).toBe(false);
    expect(ttsStore.currentVoice).not.toBeNull();

    // A subsequent PlayButton tap should now call play (no longer
    // routes to openSetupSheet).
    const {getByTestId: getByTestId2} = render(
      <L10nContext.Provider value={l10n.en}>
        <PlayButton message={makeAssistantMsg()} />
      </L10nContext.Provider>,
    );
    act(() => {
      fireEvent.press(getByTestId2('playbutton-msg-e2e'));
    });
    expect(ttsStore.play).toHaveBeenCalledWith('msg-e2e', 'Hello there friend');
  });

  it('Supertonic section is ordered first in the full TTSSetupSheet composition', () => {
    runInAction(() => {
      ttsStore.isSetupSheetOpen = true;
    });

    const {getAllByTestId} = render(
      <L10nContext.Provider value={l10n.en}>
        <TTSSetupSheet />
      </L10nContext.Provider>,
      {withBottomSheetProvider: true, withSafeArea: true},
    );

    // Both section roots are present, and Supertonic is first in document
    // order — checks the full sheet, not isolated section fragments.
    const sections = getAllByTestId(/tts-(supertonic|system)-section/);
    expect(sections.length).toBeGreaterThanOrEqual(2);
    expect(sections[0].props.testID).toBe('tts-supertonic-section');
    expect(sections[1].props.testID).toBe('tts-system-section');
  });

  it('Supertonic preview buttons are non-functional (tap has no engine side-effect)', () => {
    const {getByTestId} = render(
      <L10nContext.Provider value={l10n.en}>
        <SupertonicSection />
      </L10nContext.Provider>,
    );

    const preview = getByTestId('tts-supertonic-preview-F1');
    // Paper's Button sets accessibilityState.disabled on root.
    expect(preview.props.accessibilityState?.disabled).toBe(true);

    // Press attempt — should not reach any TTS store/engine side-effect.
    fireEvent.press(preview);
    expect(ttsStore.setCurrentVoice).not.toHaveBeenCalled();
    expect(ttsStore.play).not.toHaveBeenCalled();
  });
});
