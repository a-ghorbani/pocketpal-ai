import React from 'react';
import {runInAction} from 'mobx';

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

  it('renders one engine group per neural engine (system hidden)', () => {
    const {getByTestId, queryByTestId} = renderView();
    expect(getByTestId('tts-engine-group-kitten')).toBeTruthy();
    expect(getByTestId('tts-engine-group-kokoro')).toBeTruthy();
    expect(getByTestId('tts-engine-group-supertonic')).toBeTruthy();
    expect(queryByTestId('tts-engine-group-system')).toBeNull();
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
