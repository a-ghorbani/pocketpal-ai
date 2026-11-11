import React from 'react';
import {runInAction} from 'mobx';
import Speech from '@pocketpalai/react-native-speech';

import {fireEvent, render} from '../../../../jest/test-utils';

import {L10nContext} from '../../../utils';
import {l10n} from '../../../locales';
import {ttsStore} from '../../../store';

import {VoicePickerView} from '../VoicePickerView';

jest.mock('../engineMeta', () => {
  let androidMeta: unknown;
  jest.isolateModules(() => {
    const {Platform} = require('react-native');
    Platform.OS = 'android';
    androidMeta = jest.requireActual('../engineMeta');
  });
  return androidMeta;
});

// Google TTS voices from a Redmi 12C (Android 14), in the shape the speech
// library's Android getAvailableVoices returns them.
const ANDROID_SYSTEM_VOICES = [
  {
    quality: 'Enhanced',
    name: 'en-us-x-sfg-local',
    identifier: 'en-us-x-sfg-local',
    language: 'en-US',
  },
  {
    quality: 'Enhanced',
    name: 'en-us-x-sfg-network',
    identifier: 'en-us-x-sfg-network',
    language: 'en-US',
  },
];

const renderView = () =>
  render(
    <L10nContext.Provider value={l10n.en}>
      <VoicePickerView />
    </L10nContext.Provider>,
    {withBottomSheetProvider: true, withSafeArea: true},
  );

const getEngineGroupCount = (query: (id: string) => unknown): number =>
  ['kitten', 'kokoro', 'supertonic', 'phonon'].filter(
    id => query(`tts-engine-group-${id}`) != null,
  ).length;

describe('VoicePickerView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    runInAction(() => {
      ttsStore.currentVoice = null;
      ttsStore.kittenDownloadState = 'not_installed';
      ttsStore.kokoroDownloadState = 'not_installed';
      ttsStore.supertonicDownloadState = 'not_installed';
      ttsStore.phononDownloadState = 'not_installed';
      ttsStore.phononSupported = false;
    });
  });

  it('renders one engine group per neural engine', () => {
    const {getByTestId} = renderView();
    expect(getByTestId('tts-engine-group-kitten')).toBeTruthy();
    expect(getByTestId('tts-engine-group-kokoro')).toBeTruthy();
    expect(getByTestId('tts-engine-group-supertonic')).toBeTruthy();
  });

  describe('System voices', () => {
    beforeEach(() => {
      (Speech.getAvailableVoices as jest.Mock).mockResolvedValueOnce(
        ANDROID_SYSTEM_VOICES,
      );
    });

    it("lists the phone's voices in a System group", async () => {
      const {findByTestId, getByTestId} = renderView();

      fireEvent.press(await findByTestId('tts-engine-group-toggle-system'));

      expect(
        getByTestId('tts-voice-row-system-en-us-x-sfg-local'),
      ).toBeTruthy();
      expect(
        getByTestId('tts-voice-row-system-en-us-x-sfg-network'),
      ).toBeTruthy();
    });

    it('tapping a system voice sets it and closes the sheet', async () => {
      const {findByTestId, getByTestId} = renderView();

      fireEvent.press(await findByTestId('tts-engine-group-toggle-system'));
      fireEvent.press(getByTestId('tts-voice-row-system-en-us-x-sfg-local'));

      expect(ttsStore.setCurrentVoice).toHaveBeenCalledWith({
        id: 'en-us-x-sfg-local',
        name: 'en-us-x-sfg-local',
        engine: 'system',
        language: 'en-US',
      });
      expect(ttsStore.closeSetupSheet).toHaveBeenCalled();
    });
  });

  describe('System voices with availability fields', () => {
    const withFields = (
      voices: typeof ANDROID_SYSTEM_VOICES,
      fields: (name: string) => Record<string, boolean>,
    ) => voices.map(v => ({...v, ...fields(v.name)}));

    it('puts network voices under one Needs internet header and says so per row', async () => {
      (Speech.getAvailableVoices as jest.Mock).mockResolvedValueOnce(
        withFields(ANDROID_SYSTEM_VOICES, name => ({
          networkConnectionRequired: name.endsWith('-network'),
          notInstalled: false,
        })),
      );
      const {findByTestId, getByTestId, getAllByTestId} = renderView();

      fireEvent.press(await findByTestId('tts-engine-group-toggle-system'));

      expect(getAllByTestId(/^tts-system-network-header-/)).toHaveLength(1);
      expect(getByTestId('tts-system-network-header-en-us')).toBeTruthy();
      const rows = getAllByTestId(/^tts-voice-row-system-/);
      expect(rows.map(r => r.props.testID)).toEqual([
        'tts-voice-row-system-en-us-x-sfg-local',
        'tts-voice-row-system-en-us-x-sfg-network',
      ]);
      expect(rows[0]!.props.accessibilityLabel).not.toMatch(/Needs internet/);
      expect(rows[1]!.props.accessibilityLabel).toMatch(/, Needs internet$/);
    });

    it('carries requiresNetwork into the current voice only for a network voice', async () => {
      (Speech.getAvailableVoices as jest.Mock).mockResolvedValueOnce(
        withFields(ANDROID_SYSTEM_VOICES, name => ({
          networkConnectionRequired: name.endsWith('-network'),
          notInstalled: false,
        })),
      );
      const {findByTestId, getByTestId} = renderView();

      fireEvent.press(await findByTestId('tts-engine-group-toggle-system'));
      fireEvent.press(getByTestId('tts-voice-row-system-en-us-x-sfg-network'));

      expect(ttsStore.setCurrentVoice).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'en-us-x-sfg-network',
          requiresNetwork: true,
        }),
      );
    });

    it('leaves out voices that are not installed', async () => {
      (Speech.getAvailableVoices as jest.Mock).mockResolvedValueOnce(
        withFields(ANDROID_SYSTEM_VOICES, name => ({
          networkConnectionRequired: false,
          notInstalled: name.endsWith('-network'),
        })),
      );
      const {findByTestId, getAllByTestId} = renderView();

      fireEvent.press(await findByTestId('tts-engine-group-toggle-system'));

      expect(
        getAllByTestId(/^tts-voice-row-system-/).map(r => r.props.testID),
      ).toEqual(['tts-voice-row-system-en-us-x-sfg-local']);
    });

    it('shows no Needs internet header when the engine does not report it', async () => {
      (Speech.getAvailableVoices as jest.Mock).mockResolvedValueOnce(
        ANDROID_SYSTEM_VOICES,
      );
      const {findByTestId, queryAllByTestId, getAllByTestId} = renderView();

      fireEvent.press(await findByTestId('tts-engine-group-toggle-system'));

      expect(getAllByTestId(/^tts-voice-row-system-/)).toHaveLength(2);
      expect(queryAllByTestId(/^tts-system-network-header-/)).toHaveLength(0);
    });
  });

  it('groups start collapsed when no current voice; tap expands', () => {
    const {getByTestId, queryByTestId} = renderView();
    // Collapsed → install button not rendered yet.
    expect(queryByTestId('tts-kitten-install-button')).toBeNull();
    fireEvent.press(getByTestId('tts-engine-group-toggle-kitten'));
    expect(getByTestId('tts-kitten-install-button')).toBeTruthy();
  });

  it('expanded ready group exposes voice rows with preview', () => {
    runInAction(() => {
      ttsStore.kittenDownloadState = 'ready';
    });
    const {getByTestId} = renderView();
    fireEvent.press(getByTestId('tts-engine-group-toggle-kitten'));
    expect(getByTestId('tts-voice-row-kitten-expr-voice-2-f')).toBeTruthy();
    expect(getByTestId('tts-voice-preview-kitten-expr-voice-2-f')).toBeTruthy();
  });

  it('expanded not-installed group shows engine install button', () => {
    const {getByTestId} = renderView();
    fireEvent.press(getByTestId('tts-engine-group-toggle-kokoro'));
    expect(getByTestId('tts-kokoro-install-button')).toBeTruthy();
    fireEvent.press(getByTestId('tts-kokoro-install-button'));
    expect(ttsStore.downloadKokoro).toHaveBeenCalled();
  });

  it('tapping a ready voice calls setCurrentVoice and closes the sheet', () => {
    runInAction(() => {
      ttsStore.kittenDownloadState = 'ready';
    });
    const {getByTestId} = renderView();
    fireEvent.press(getByTestId('tts-engine-group-toggle-kitten'));
    fireEvent.press(getByTestId('tts-voice-row-kitten-expr-voice-2-f'));
    expect(ttsStore.setCurrentVoice).toHaveBeenCalledWith(
      expect.objectContaining({id: 'expr-voice-2-f', engine: 'kitten'}),
    );
    expect(ttsStore.closeSetupSheet).toHaveBeenCalled();
  });

  describe('Phonon', () => {
    it('is listed first with its credit and install size when the device supports it', () => {
      runInAction(() => {
        ttsStore.phononSupported = true;
      });
      const {getByTestId, getAllByTestId, getByText} = renderView();

      const groups = getAllByTestId(/^tts-engine-group-(?!toggle)/).map(
        g => g.props.testID,
      );
      expect(groups).toEqual([
        'tts-engine-group-phonon',
        'tts-engine-group-kitten',
        'tts-engine-group-kokoro',
        'tts-engine-group-supertonic',
        'tts-engine-group-system',
      ]);
      fireEvent.press(getByTestId('tts-engine-group-toggle-phonon'));
      expect(getByTestId('tts-phonon-credit')).toBeTruthy();
      expect(getByText('Install · 64 MB')).toBeTruthy();
      fireEvent.press(getByTestId('tts-phonon-install-button'));
      expect(ttsStore.downloadPhonon).toHaveBeenCalled();
    });

    it('is not rendered, with no error text, when the device does not support it', () => {
      const {queryByTestId, queryByText, getAllByTestId} = renderView();

      expect(
        getAllByTestId(/^tts-engine-group-(?!toggle)/).map(g => g.props.testID),
      ).toEqual([
        'tts-engine-group-kitten',
        'tts-engine-group-kokoro',
        'tts-engine-group-supertonic',
        'tts-engine-group-system',
      ]);

      expect(queryByTestId('tts-engine-group-phonon')).toBeNull();
      expect(queryByTestId('tts-phonon-credit')).toBeNull();
      expect(queryByText(/phonon/i)).toBeNull();
      expect(getEngineGroupCount(queryByTestId)).toBe(3);
    });

    it('shows download progress against its 64 MB size', () => {
      runInAction(() => {
        ttsStore.phononSupported = true;
        ttsStore.phononDownloadState = 'downloading';
        ttsStore.phononDownloadProgress = 0.5;
      });
      const {getByTestId, getByText} = renderView();

      fireEvent.press(getByTestId('tts-engine-group-toggle-phonon'));

      expect(getByText('Downloading…  50%  ·  32 / 64 MB')).toBeTruthy();
    });

    it('shows its download error with a retry that retries Phonon', () => {
      runInAction(() => {
        ttsStore.phononSupported = true;
        ttsStore.phononDownloadState = 'error';
        ttsStore.phononDownloadError = 'sha256 mismatch';
      });
      const {getByTestId, getByText} = renderView();

      fireEvent.press(getByTestId('tts-engine-group-toggle-phonon'));
      expect(getByText('sha256 mismatch')).toBeTruthy();
      fireEvent.press(getByTestId('tts-phonon-retry-button'));

      expect(ttsStore.retryPhononDownload).toHaveBeenCalledTimes(1);
      expect(ttsStore.retryKittenDownload).not.toHaveBeenCalled();
      runInAction(() => {
        ttsStore.phononDownloadError = null;
      });
    });

    it('shows the eight voices and the credit once installed', () => {
      runInAction(() => {
        ttsStore.phononSupported = true;
        ttsStore.phononDownloadState = 'ready';
      });
      const {getByTestId, getAllByTestId} = renderView();

      fireEvent.press(getByTestId('tts-engine-group-toggle-phonon'));

      expect(getAllByTestId(/^tts-voice-row-phonon-/)).toHaveLength(8);
      expect(getByTestId('tts-voice-row-phonon-Zoey')).toBeTruthy();
      expect(getByTestId('tts-phonon-credit')).toBeTruthy();
    });
  });

  it('default-expands the active engine group on first render', () => {
    runInAction(() => {
      ttsStore.kokoroDownloadState = 'ready';
      ttsStore.currentVoice = {
        id: 'af_heart',
        name: 'Heart',
        engine: 'kokoro',
      };
    });
    const {getByTestId} = renderView();
    // Active group is expanded → voice rows visible without a manual toggle.
    expect(getByTestId('tts-voice-row-kokoro-af_heart')).toBeTruthy();
  });
});
