import React from 'react';

import {runInAction} from 'mobx';

import {fireEvent, render, waitFor} from '../../../../jest/test-utils';
import {l10n} from '../../../locales';
import {ASR_INSUFFICIENT_STORAGE} from '../../../services/asr';
import {asrStore, ttsStore} from '../../../store';
import {
  ensureMicPermission,
  openMicSettings,
} from '../../../utils/asrMicPermission';

import {VoiceSetupSheet} from '../VoiceSetupSheet';

jest.mock('../../Sheet', () => {
  const {View} = require('react-native');
  const Sheet: any = ({children, isVisible}: any) =>
    isVisible ? <View>{children}</View> : null;
  Sheet.ScrollView = ({children, testID}: any) => (
    <View testID={testID}>{children}</View>
  );
  return {Sheet};
});

jest.mock('../../../utils/asrMicPermission', () => ({
  ensureMicPermission: jest.fn(),
  openMicSettings: jest.fn(),
}));

const strings = l10n.en.voiceMode;
const onDone = jest.fn();
const onClose = jest.fn();
const asr = asrStore as any;
const tts = ttsStore as any;

const renderSheet = () =>
  render(<VoiceSetupSheet isVisible onClose={onClose} onDone={onDone} />);

describe('VoiceSetupSheet', () => {
  beforeEach(() => {
    (ensureMicPermission as jest.Mock).mockResolvedValue('granted');
    runInAction(() => {
      asr.downloadStates.base = 'not_installed';
      asr.downloadProgress.base = 0;
      asr.downloadError.base = null;
      asr.freeDiskBytes = null;
      tts.currentVoice = {id: 'F1', name: 'Sarah', engine: 'supertonic'};
    });
  });

  it('shows the whisper base row, the voice row and the mic step', () => {
    const {getByText} = renderSheet();
    expect(getByText(strings.sttRowTitle)).toBeTruthy();
    expect(getByText('Sarah · ready')).toBeTruthy();
    expect(getByText(strings.micNote)).toBeTruthy();
  });

  it('downloads base without selecting it, asks for the mic, then finishes', async () => {
    asr.downloadModel.mockImplementationOnce(async () => {
      runInAction(() => {
        asr.downloadStates.base = 'ready';
      });
    });
    const {getByTestId} = renderSheet();

    fireEvent.press(getByTestId('voice-setup-continue'));

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(asrStore.downloadModel).toHaveBeenCalledWith('base', {
      select: false,
    });
    expect(ensureMicPermission).toHaveBeenCalledTimes(1);
  });

  it('shows download progress and blocks Continue while downloading', () => {
    runInAction(() => {
      asr.downloadStates.base = 'downloading';
      asr.downloadProgress.base = 0.5;
    });
    const {getByTestId, getByText} = renderSheet();
    expect(getByText(/ of /)).toBeTruthy();
    expect(getByTestId('voice-setup-continue')).toBeDisabled();
  });

  it('marks an installed base', () => {
    runInAction(() => {
      asr.downloadStates.base = 'ready';
    });
    const {getByText} = renderSheet();
    expect(getByText(strings.installedLabel)).toBeTruthy();
  });

  it('shows the disk shortfall and does not finish', async () => {
    runInAction(() => {
      asr.downloadStates.base = 'error';
      asr.downloadError.base = ASR_INSUFFICIENT_STORAGE;
      asr.freeDiskBytes = 10 * 1024 * 1024;
    });
    const {getByTestId} = renderSheet();
    expect(getByTestId('voice-setup-low-disk')).toBeTruthy();

    fireEvent.press(getByTestId('voice-setup-continue'));
    await waitFor(() => expect(asrStore.downloadModel).toHaveBeenCalled());
    expect(onDone).not.toHaveBeenCalled();
  });

  it.each([
    ['the system voice', {id: 's', name: 'Samantha', engine: 'system'}],
    ['no voice', null],
  ])('with %s, offers to choose a neural voice', (_case, voice) => {
    runInAction(() => {
      tts.currentVoice = voice;
    });
    const {getByTestId, getByText, queryByTestId} = renderSheet();

    expect(getByText(strings.voiceRowMissing)).toBeTruthy();
    expect(queryByTestId('voice-setup-continue')).toBeNull();
    fireEvent.press(getByTestId('voice-setup-choose-voice'));
    expect(ttsStore.openSetupSheet).toHaveBeenCalledTimes(1);
  });

  it('a blocked mic offers Settings and does not finish', async () => {
    runInAction(() => {
      asr.downloadStates.base = 'ready';
    });
    (ensureMicPermission as jest.Mock).mockResolvedValue('blocked');
    const {getByTestId, findByTestId} = renderSheet();

    fireEvent.press(getByTestId('voice-setup-continue'));
    fireEvent.press(await findByTestId('voice-setup-open-settings'));

    expect(openMicSettings).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('a denied mic says why and does not finish', async () => {
    runInAction(() => {
      asr.downloadStates.base = 'ready';
    });
    (ensureMicPermission as jest.Mock).mockResolvedValue('denied');
    const {getByTestId, findByText} = renderSheet();

    fireEvent.press(getByTestId('voice-setup-continue'));

    expect(await findByText(strings.micDenied)).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });
});
