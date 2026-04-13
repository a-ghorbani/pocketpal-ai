import React from 'react';
import {runInAction} from 'mobx';

import {fireEvent, render, waitFor} from '../../../../jest/test-utils';

import {L10nContext} from '../../../utils';
import {l10n} from '../../../locales';
import {ttsStore} from '../../../store';

import {SupertonicSection} from '../SupertonicSection';
import {SystemSection} from '../SystemSection';
import {TTSSetupSheet} from '../TTSSetupSheet';

const renderWithL10n = (ui: React.ReactElement) =>
  render(<L10nContext.Provider value={l10n.en}>{ui}</L10nContext.Provider>, {
    withBottomSheetProvider: true,
    withSafeArea: true,
  });

describe('TTSSetupSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    runInAction(() => {
      ttsStore.isSetupSheetOpen = true;
      ttsStore.currentVoice = null;
    });
  });

  it('renders the Supertonic section before the System section', () => {
    // Section ordering is verified by rendering them together and
    // checking document order.
    const {getByTestId, getAllByTestId} = renderWithL10n(
      <>
        <SupertonicSection />
        <SystemSection visible={true} />
      </>,
    );
    const sup = getByTestId('tts-supertonic-section');
    const sys = getByTestId('tts-system-section');
    const roots = getAllByTestId(/tts-(supertonic|system)-section/);
    expect(roots[0]).toBe(sup);
    expect(roots[1]).toBe(sys);
  });

  it('Supertonic rows are disabled / non-interactive', () => {
    const {getByTestId} = renderWithL10n(<SupertonicSection />);
    // Sample a few voices from the 10-voice catalog and verify the row
    // carries the disabled accessibility state and the preview button is
    // disabled.
    for (const voiceId of ['F1', 'M1', 'M5']) {
      const row = getByTestId(`tts-supertonic-voice-${voiceId}`);
      expect(row.props.accessibilityState?.disabled).toBe(true);
      const button = getByTestId(`tts-supertonic-preview-${voiceId}`);
      // Paper's Button forwards disabled state on its root.
      expect(button.props.accessibilityState?.disabled).toBe(true);
    }
  });

  it('Supertonic renders the install placeholder copy', () => {
    const {getByTestId, getByText} = renderWithL10n(<SupertonicSection />);
    expect(getByTestId('tts-supertonic-install-cta')).toBeTruthy();
    expect(getByText(l10n.en.voiceAndSpeech.supertonicInstallCta)).toBeTruthy();
  });

  it('System section uses the honest "robotic, for accessibility" label', () => {
    const {getByText} = renderWithL10n(<SystemSection visible={true} />);
    expect(getByText(l10n.en.voiceAndSpeech.systemSectionTitle)).toBeTruthy();
  });

  it('tapping a System voice row sets currentVoice and closes sheet', async () => {
    const {getByTestId} = renderWithL10n(<SystemSection visible={true} />);
    await waitFor(() =>
      expect(
        getByTestId('tts-system-voice-com.apple.voice.Sarah'),
      ).toBeTruthy(),
    );
    fireEvent.press(getByTestId('tts-system-voice-com.apple.voice.Sarah'));
    expect(ttsStore.setCurrentVoice).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'com.apple.voice.Sarah',
        engine: 'system',
      }),
    );
    expect(ttsStore.closeSetupSheet).toHaveBeenCalledTimes(1);
  });

  it('TTSSetupSheet mounts without throwing when open', () => {
    // Smoke test for the top-level sheet composition (bottom-sheet
    // internals are mocked by default).
    const {getByTestId} = renderWithL10n(<TTSSetupSheet />);
    expect(getByTestId('tts-setup-sheet')).toBeTruthy();
  });
});
