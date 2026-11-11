import React from 'react';
import {AppState, Platform} from 'react-native';
import {runInAction} from 'mobx';
import Speech from '@pocketpalai/react-native-speech';

import {act, fireEvent, render, within} from '../../../../jest/test-utils';

import {L10nContext} from '../../../utils';
import {l10n} from '../../../locales';
import {getPhoneLocale, languageLabel} from '../../../services/tts';
import {ttsStore} from '../../../store';

import {VoicePickerView} from '../VoicePickerView';

jest.mock('../engineMeta', () => {
  let androidMeta: unknown;
  jest.isolateModules(() => {
    const ReactNative = require('react-native');
    ReactNative.Platform.OS = 'android';
    androidMeta = jest.requireActual('../engineMeta');
  });
  return androidMeta;
});

jest.mock('../../../services/tts/engines/system/phoneLocale', () => ({
  getPhoneLocale: jest.fn(() => undefined),
}));

const appStateHandlers: Array<(state: string) => void> = [];
const appStateRemove = jest.fn();
jest
  .spyOn(AppState, 'addEventListener')
  .mockImplementation((event: string, handler: any) => {
    if (event === 'change') {
      appStateHandlers.push(handler);
    }
    return {remove: appStateRemove} as any;
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
        name: `${languageLabel('en-US')} · Voice 1 · sfg`,
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

  describe('System group', () => {
    const originalOS = Platform.OS;
    const mockVoices = (voices: object[]) =>
      (Speech.getAvailableVoices as jest.Mock).mockResolvedValue(voices);
    const googleVoice = (name: string, language: string) => ({
      quality: 'Enhanced',
      name,
      identifier: name,
      language,
      networkConnectionRequired: name.endsWith('-network'),
      notInstalled: false,
    });
    const MIXED_CATALOG = [
      googleVoice('en-us-x-sfg-local', 'en-US'),
      googleVoice('en-us-x-sfg-network', 'en-US'),
      googleVoice('en-gb-x-gba-local', 'en-GB'),
      googleVoice('de-de-x-deb-local', 'de-DE'),
      googleVoice('de-de-x-deb-network', 'de-DE'),
    ];
    const testIDs = (nodes: Array<{props: {testID?: string}}>) =>
      nodes.map(n => n.props.testID);

    const openSystemGroup = async () => {
      const view = renderView();
      fireEvent.press(
        await view.findByTestId('tts-engine-group-toggle-system'),
      );
      return view;
    };

    beforeEach(() => {
      appStateHandlers.length = 0;
      Platform.OS = 'android';
      (getPhoneLocale as jest.Mock).mockReturnValue(undefined);
      mockVoices(MIXED_CATALOG);
    });

    afterEach(() => {
      Platform.OS = originalOS;
      (Speech.getAvailableVoices as jest.Mock).mockReset();
      (Speech.getAvailableVoices as jest.Mock).mockResolvedValue([]);
    });

    it('opens with the voice-mode hint and the Languages field above the first band', async () => {
      const {getByText, getByTestId, getAllByTestId, queryByText} =
        await openSystemGroup();

      expect(
        getByText(l10n.en.voiceAndSpeech.systemVoiceModeHint),
      ).toBeTruthy();
      const field = getByTestId('tts-system-language-button');
      expect(field.props.accessibilityLabel).toBe(
        'Languages: \u2068English\u2069',
      );
      expect(
        testIDs(
          getAllByTestId(/^tts-system-(language-button|section-|get-voices$)/),
        ),
      ).toEqual([
        'tts-system-language-button',
        'tts-system-section-en-gb',
        'tts-system-section-en-us',
        'tts-system-get-voices',
      ]);
      expect(queryByText(/Show all languages/)).toBeNull();
    });

    it('labels rows short and heads a mixed locale with On this phone and Needs internet', async () => {
      const {getByTestId, getByText, queryByTestId} = await openSystemGroup();

      const row = getByTestId('tts-voice-row-system-en-us-x-sfg-local');
      expect(within(row).getByText('Voice 1 · sfg')).toBeTruthy();
      expect(getByTestId('tts-system-network-header-en-us')).toBeTruthy();
      expect(queryByTestId('tts-system-network-header-en-gb')).toBeNull();
      expect(
        getByText(l10n.en.voiceAndSpeech.systemOnDeviceSection),
      ).toBeTruthy();
    });

    it('lists the phone language first', async () => {
      (getPhoneLocale as jest.Mock).mockReturnValue('de_DE');
      const {getByTestId, getAllByTestId} = await openSystemGroup();

      expect(
        getByTestId('tts-system-language-button').props.accessibilityLabel,
      ).toBe('Languages: \u2068Deutsch\u2069, \u2068English\u2069');
      expect(testIDs(getAllByTestId(/^tts-system-section-/))).toEqual([
        'tts-system-section-de-de',
        'tts-system-section-en-gb',
        'tts-system-section-en-us',
      ]);
    });

    it('shows only the picked language, and keeps it when the group collapses', async () => {
      const {getByTestId, getAllByTestId} = await openSystemGroup();

      fireEvent.press(getByTestId('tts-system-language-button'));
      expect(getByTestId('tts-system-language-option-en')).toBeTruthy();
      fireEvent.press(getByTestId('tts-system-language-option-de'));

      expect(testIDs(getAllByTestId(/^tts-system-section-/))).toEqual([
        'tts-system-section-de-de',
      ]);
      fireEvent.press(getByTestId('tts-engine-group-toggle-system'));
      fireEvent.press(getByTestId('tts-engine-group-toggle-system'));
      expect(testIDs(getAllByTestId(/^tts-system-section-/))).toEqual([
        'tts-system-section-de-de',
      ]);
    });

    it("shows the current system voice's language and checks its row", async () => {
      runInAction(() => {
        ttsStore.currentVoice = {
          id: 'de-de-x-deb-local',
          name: 'Deutsch (DE) · Voice 1 · deb',
          engine: 'system',
          language: 'de-DE',
        };
      });
      const {findByTestId} = renderView();

      const row = await findByTestId('tts-voice-row-system-de-de-x-deb-local');
      expect(row.props.accessibilityState).toEqual(
        expect.objectContaining({checked: true}),
      );
    });

    it('offers Get more voices for a shown language with none installed, and opens the installer', async () => {
      (getPhoneLocale as jest.Mock).mockReturnValue('zh_CN_#Hans');
      const {getByTestId, getByText} = await openSystemGroup();

      expect(
        getByText('No \u2068中文\u2069 voices on this phone yet.'),
      ).toBeTruthy();
      fireEvent.press(getByTestId('tts-system-get-voices-zh'));
      fireEvent.press(getByTestId('tts-system-get-voices'));
      expect(Speech.openVoiceDataInstaller).toHaveBeenCalledTimes(2);
    });

    it('shows Cantonese with Get more voices on an Android Hong Kong phone', async () => {
      (getPhoneLocale as jest.Mock).mockReturnValue('zh_HK');
      mockVoices([
        googleVoice('cmn-cn-x-ccc-local', 'zh-CN'),
        ...MIXED_CATALOG,
      ]);
      const {getByTestId, getAllByTestId} = await openSystemGroup();

      expect(testIDs(getAllByTestId(/^tts-system-section-(zh|yue)/))).toEqual([
        'tts-system-section-zh-cn',
        'tts-system-section-yue',
      ]);
      expect(getByTestId('tts-system-get-voices-yue')).toBeTruthy();
    });

    it.each(['zh-Hant-HK'])(
      'lists Hong Kong Chinese first and no Cantonese band on an iPhone set to %s',
      async phoneLocale => {
        Platform.OS = 'ios';
        (getPhoneLocale as jest.Mock).mockReturnValue(phoneLocale);
        mockVoices([
          {identifier: 'tingting', name: 'Tingting', language: 'zh-CN'},
          {identifier: 'sinji', name: 'Sinji', language: 'zh-HK'},
          {identifier: 'samantha', name: 'Samantha', language: 'en-US'},
        ]);
        const {getAllByTestId, queryByTestId} = await openSystemGroup();

        expect(queryByTestId('tts-system-section-yue')).toBeNull();
        expect(testIDs(getAllByTestId(/^tts-system-section-/))).toEqual([
          'tts-system-section-zh-hk',
          'tts-system-section-zh-cn',
          'tts-system-section-en-us',
        ]);
      },
    );

    it('only logs when the installer is unavailable', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      (Speech.openVoiceDataInstaller as jest.Mock).mockRejectedValueOnce(
        new Error('UNSUPPORTED_OPERATION'),
      );
      const {getByTestId} = await openSystemGroup();

      await act(async () => {
        fireEvent.press(getByTestId('tts-system-get-voices'));
      });

      expect(warn).toHaveBeenCalledWith(
        '[SystemVoiceGroup] voice installer failed:',
        expect.any(Error),
      );
      warn.mockRestore();
    });

    it('keeps the empty state and Get more voices when the phone lists no voice', async () => {
      mockVoices([]);
      const {getByTestId, getByText, queryByTestId} = await openSystemGroup();

      expect(getByText(l10n.en.voiceAndSpeech.voicesEmptyState)).toBeTruthy();
      expect(getByTestId('tts-system-get-voices')).toBeTruthy();
      expect(queryByTestId('tts-system-language-button')).toBeNull();
    });

    it('logs a failed read and keeps the empty state with Get more voices', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      (Speech.getAvailableVoices as jest.Mock).mockRejectedValue(
        new Error('engine unbound'),
      );
      const {getByTestId, getByText} = renderView();

      await act(async () => {
        fireEvent.press(getByTestId('tts-engine-group-toggle-system'));
      });

      expect(warn).toHaveBeenCalledWith(
        '[VoicePickerView] system voices failed:',
        expect.any(Error),
      );
      expect(getByText(l10n.en.voiceAndSpeech.voicesEmptyState)).toBeTruthy();
      expect(getByTestId('tts-system-get-voices')).toBeTruthy();
      warn.mockRestore();
    });

    it('shows the Settings hint instead of Get more voices on iOS', async () => {
      Platform.OS = 'ios';
      mockVoices([
        {
          identifier: 'a',
          name: 'Samantha',
          language: 'en-US',
          quality: 'Default',
        },
      ]);
      const {getByText, queryByTestId, queryAllByTestId} =
        await openSystemGroup();

      expect(
        getByText(l10n.en.voiceAndSpeech.systemIosSettingsHint),
      ).toBeTruthy();
      expect(queryByTestId('tts-system-get-voices')).toBeNull();
      expect(queryAllByTestId(/^tts-system-network-header-/)).toHaveLength(0);
    });

    it('re-reads the voices when the app returns, without loading an engine', async () => {
      const {findByTestId, getByTestId} = await openSystemGroup();
      mockVoices([...MIXED_CATALOG, googleVoice('en-us-x-iob-local', 'en-US')]);

      await act(async () => {
        appStateHandlers.forEach(h => h('active'));
      });

      expect(
        await findByTestId('tts-voice-row-system-en-us-x-iob-local'),
      ).toBeTruthy();
      expect(
        getByTestId('tts-voice-row-system-en-us-x-sfg-local'),
      ).toBeTruthy();
      expect(Speech.getAvailableVoices).toHaveBeenCalledTimes(2);
      expect(Speech.initialize).not.toHaveBeenCalled();
    });

    it('applies only the latest read, and none after unmount', async () => {
      const pending: Array<(voices: object[]) => void> = [];
      (Speech.getAvailableVoices as jest.Mock).mockImplementation(
        () => new Promise(resolve => pending.push(resolve)),
      );
      const {getByTestId, queryByTestId, unmount} = renderView();
      fireEvent.press(getByTestId('tts-engine-group-toggle-system'));

      act(() => {
        appStateHandlers.forEach(h => h('active'));
      });
      await act(async () => {
        pending[1]!([googleVoice('en-us-x-iob-local', 'en-US')]);
      });
      await act(async () => {
        pending[0]!([googleVoice('en-us-x-sfg-local', 'en-US')]);
      });

      expect(
        getByTestId('tts-voice-row-system-en-us-x-iob-local'),
      ).toBeTruthy();
      expect(
        queryByTestId('tts-voice-row-system-en-us-x-sfg-local'),
      ).toBeNull();

      act(() => {
        appStateHandlers.forEach(h => h('active'));
      });
      unmount();
      await act(async () => {
        pending[2]!([]);
      });
      expect(appStateRemove).toHaveBeenCalled();
      expect(getPhoneLocale).toHaveBeenCalledTimes(1);
    });

    it('counts every visible voice in the header, not only the shown languages', async () => {
      const {getByText, getAllByTestId} = await openSystemGroup();

      expect(getAllByTestId(/^tts-voice-row-system-/)).toHaveLength(3);
      expect(
        getByText(
          l10n.en.voiceAndSpeech.engineSystemSpecsLine.replace(
            '{{voices}}',
            '5',
          ),
        ),
      ).toBeTruthy();
    });

    it('checks no row for a saved system voice this phone no longer has', async () => {
      runInAction(() => {
        ttsStore.currentVoice = {
          id: 'en-us-x-gone-local',
          name: `${languageLabel('en-US')} · Voice 3 · gone`,
          engine: 'system',
          language: 'en-US',
        };
      });
      const {findByTestId, getAllByTestId, getByTestId} = renderView();

      await findByTestId('tts-voice-row-system-en-us-x-sfg-local');
      const rows = getAllByTestId(/^tts-voice-row-system-/);
      expect(rows).toHaveLength(3);
      rows.forEach(row =>
        expect(row.props.accessibilityState).toEqual(
          expect.objectContaining({checked: false}),
        ),
      );
      expect(getByTestId('tts-hero-voice-name').props.children).toBe(
        'Voice 3 · gone',
      );
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
