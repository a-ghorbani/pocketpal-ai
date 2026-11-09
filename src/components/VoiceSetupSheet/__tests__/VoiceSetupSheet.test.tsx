import React from 'react';
import {AppState} from 'react-native';

import {runInAction} from 'mobx';

import {act, fireEvent, render, waitFor} from '../../../../jest/test-utils';
import {themeFixtures} from '../../../../jest/fixtures/theme';
import {l10n} from '../../../locales';
import {ASR_INSUFFICIENT_STORAGE} from '../../../services/asr';
import {ensureVoiceFile, hasVoiceFile} from '../../../services/tts/voiceFiles';
import {asrStore, ttsStore} from '../../../store';
import {
  ensureMicPermission,
  isMicGranted,
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

jest.mock('../../../services/tts/voiceFiles', () => ({
  ensureVoiceFile: jest.fn(),
  hasVoiceFile: jest.fn(),
}));

jest.mock('../../../utils/asrMicPermission', () => ({
  ensureMicPermission: jest.fn(),
  isMicGranted: jest.fn(),
  openMicSettings: jest.fn(),
}));

const appStateHandlers: Array<(state: string) => void> = [];
jest
  .spyOn(AppState, 'addEventListener')
  .mockImplementation((event: string, handler: any) => {
    if (event === 'change') {
      appStateHandlers.push(handler);
    }
    return {remove: jest.fn()} as any;
  });

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
    (isMicGranted as jest.Mock).mockResolvedValue(false);
    (hasVoiceFile as jest.Mock).mockResolvedValue(true);
    (ensureVoiceFile as jest.Mock).mockResolvedValue(true);
    appStateHandlers.length = 0;
    runInAction(() => {
      asr.selectedTier = 'base';
      asr.downloadStates.small = 'not_installed';
      asr.downloadStates.base = 'not_installed';
      asr.downloadProgress.base = 0;
      asr.downloadError.base = null;
      asr.freeDiskBytes = null;
      tts.currentVoice = {id: 'F1', name: 'Sarah', engine: 'supertonic'};
      tts.phononSupported = false;
    });
  });

  it('shows the whisper base row, the voice row and the mic step', async () => {
    const {getByText, findByText} = renderSheet();
    expect(getByText(strings.sttRowTitle)).toBeTruthy();
    expect(getByText(/^Whisper Base · /)).toBeTruthy();
    expect(await findByText('Sarah · ready')).toBeTruthy();
    expect(getByText(strings.micNote)).toBeTruthy();
  });

  it('shows the in-use tier when it is installed', async () => {
    runInAction(() => {
      asr.selectedTier = 'small';
      asr.downloadStates.small = 'ready';
    });
    const {getByText, findByText} = renderSheet();
    expect(getByText(/^Whisper Small · /)).toBeTruthy();
    expect(getByText(strings.installedLabel)).toBeTruthy();
    expect(await findByText('Sarah · ready')).toBeTruthy();
  });

  it('offers base while another tier downloads and none is installed', async () => {
    runInAction(() => {
      asr.downloadStates.small = 'downloading';
    });
    const {getByText, getByTestId} = renderSheet();
    expect(getByText(/^Whisper Base · /)).toBeTruthy();

    fireEvent.press(getByTestId('voice-setup-continue'));

    await waitFor(() =>
      expect(asrStore.downloadModel).toHaveBeenCalledWith('base'),
    );
  });

  it('downloads base, not a stale uninstalled tier, before init reconciles', async () => {
    runInAction(() => {
      asr.selectedTier = 'small';
    });
    const {getByText, getByTestId} = renderSheet();
    expect(getByText(/^Whisper Base · /)).toBeTruthy();

    fireEvent.press(getByTestId('voice-setup-continue'));

    await waitFor(() =>
      expect(asrStore.downloadModel).toHaveBeenCalledWith('base'),
    );
    expect(asrStore.downloadModel).not.toHaveBeenCalledWith('small');
    expect(asrStore.selectTier).not.toHaveBeenCalled();
  });

  it('downloads base, asks for the mic, then finishes', async () => {
    asr.downloadModel.mockImplementationOnce(async () => {
      runInAction(() => {
        asr.downloadStates.base = 'ready';
      });
    });
    const {getByTestId} = renderSheet();

    fireEvent.press(getByTestId('voice-setup-continue'));

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(asrStore.downloadModel).toHaveBeenCalledWith('base');
    expect(ensureMicPermission).toHaveBeenCalledTimes(1);
  });

  it('stops setup when the sheet is closed during the download', async () => {
    let finish!: () => void;
    asr.downloadModel.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          finish = () => {
            runInAction(() => {
              asr.downloadStates.base = 'ready';
            });
            resolve();
          };
        }),
    );
    const {getByTestId, rerender} = renderSheet();
    fireEvent.press(getByTestId('voice-setup-continue'));

    rerender(
      <VoiceSetupSheet isVisible={false} onClose={onClose} onDone={onDone} />,
    );
    await act(async () => {
      finish();
    });

    expect(ensureMicPermission).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('does not finish when the download completes in the background', async () => {
    const appState = AppState.currentState;
    asr.downloadModel.mockImplementationOnce(async () => {
      Object.defineProperty(AppState, 'currentState', {
        value: 'background',
        configurable: true,
        writable: true,
      });
      runInAction(() => {
        asr.downloadStates.base = 'ready';
      });
    });
    try {
      const {getByTestId} = renderSheet();
      fireEvent.press(getByTestId('voice-setup-continue'));
      await waitFor(() => expect(asrStore.downloadModel).toHaveBeenCalled());
      await act(async () => {});
      expect(ensureMicPermission).not.toHaveBeenCalled();
      expect(onDone).not.toHaveBeenCalled();

      Object.defineProperty(AppState, 'currentState', {value: 'active'});
      fireEvent.press(getByTestId('voice-setup-continue'));
      await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    } finally {
      Object.defineProperty(AppState, 'currentState', {value: appState});
    }
  });

  it('shows download progress and blocks Continue while downloading', async () => {
    runInAction(() => {
      asr.downloadStates.base = 'downloading';
      asr.downloadProgress.base = 0.5;
    });
    const {getByTestId, getByText, findByText} = renderSheet();
    expect(getByText(/ of /)).toBeTruthy();
    expect(getByTestId('voice-setup-continue')).toBeDisabled();
    expect(await findByText('Sarah · ready')).toBeTruthy();
  });

  it('marks an installed base', async () => {
    runInAction(() => {
      asr.downloadStates.base = 'ready';
    });
    const {getByText, findByText} = renderSheet();
    expect(getByText(strings.installedLabel)).toBeTruthy();
    expect(await findByText('Sarah · ready')).toBeTruthy();
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
    [
      'an unsupported Phonon voice',
      {id: 'Zoey', name: 'Zoey', engine: 'phonon'},
    ],
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

  it('accepts a Phonon voice on a device that supports it', async () => {
    runInAction(() => {
      tts.currentVoice = {id: 'Zoey', name: 'Zoey', engine: 'phonon'};
      tts.phononSupported = true;
    });
    const {getByTestId, queryByTestId, findByText} = renderSheet();

    expect(getByTestId('voice-setup-continue')).toBeTruthy();
    expect(queryByTestId('voice-setup-choose-voice')).toBeNull();
    expect(await findByText('Zoey · ready')).toBeTruthy();
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

  describe('a mic granted in Settings', () => {
    const blockMic = async () => {
      runInAction(() => {
        asr.downloadStates.base = 'ready';
      });
      (ensureMicPermission as jest.Mock).mockResolvedValue('blocked');
      const view = render(
        <VoiceSetupSheet isVisible onClose={onClose} onDone={onDone} />,
      );
      fireEvent.press(view.getByTestId('voice-setup-continue'));
      await view.findByTestId('voice-setup-open-settings');
      return view;
    };

    it('brings Continue back when the app returns to the foreground', async () => {
      const {findByTestId, queryByTestId} = await blockMic();

      (isMicGranted as jest.Mock).mockResolvedValue(true);
      await act(async () => {
        appStateHandlers.forEach(handler => handler('active'));
      });

      expect(await findByTestId('voice-setup-continue')).toBeTruthy();
      expect(queryByTestId('voice-setup-open-settings')).toBeNull();
    });

    it('brings Continue back when the sheet opens again', async () => {
      const {rerender, findByTestId} = await blockMic();
      rerender(
        <VoiceSetupSheet isVisible={false} onClose={onClose} onDone={onDone} />,
      );

      (isMicGranted as jest.Mock).mockResolvedValue(true);
      rerender(<VoiceSetupSheet isVisible onClose={onClose} onDone={onDone} />);

      expect(await findByTestId('voice-setup-continue')).toBeTruthy();
    });

    it('keeps offering Settings while the mic stays blocked', async () => {
      const {getByTestId} = await blockMic();

      await act(async () => {
        appStateHandlers.forEach(handler => handler('active'));
      });

      expect(getByTestId('voice-setup-open-settings')).toBeTruthy();
    });
  });

  describe("the voice's file", () => {
    const voiceStatus = (view: ReturnType<typeof renderSheet>) =>
      view.getByTestId('voice-setup-voice-status');
    const deferred = () => {
      let resolve: (ok: boolean) => void = () => {};
      const promise = new Promise<boolean>(r => (resolve = r));
      return {promise, resolve};
    };
    const readyWhisper = () =>
      runInAction(() => {
        asr.downloadStates.base = 'ready';
      });

    it('shows the voice name alone while the check is pending', () => {
      (hasVoiceFile as jest.Mock).mockReturnValue(new Promise(() => {}));
      const view = renderSheet();
      expect(voiceStatus(view)).toHaveTextContent('Sarah', {exact: true});
    });

    it('says a missing file is fetched by Continue', async () => {
      (hasVoiceFile as jest.Mock).mockResolvedValue(false);
      const view = renderSheet();

      expect(
        await view.findByText("Sarah isn't downloaded yet. Continue gets it."),
      ).toBeTruthy();
      expect(view.getByTestId('voice-setup-continue')).toBeEnabled();
    });

    it('a failed download says so and neither asks for the mic nor finishes', async () => {
      readyWhisper();
      (hasVoiceFile as jest.Mock).mockResolvedValue(false);
      (ensureVoiceFile as jest.Mock).mockResolvedValue(false);
      const view = renderSheet();
      await view.findByText(/isn't downloaded yet/);

      fireEvent.press(view.getByTestId('voice-setup-continue'));

      expect(
        await view.findByText(
          "Couldn't download Sarah. Connect to the internet and try again.",
        ),
      ).toBeTruthy();
      expect(ensureMicPermission).not.toHaveBeenCalled();
      expect(onDone).not.toHaveBeenCalled();
    });

    it('shows the failed line in the error colour, the missing line not', async () => {
      readyWhisper();
      const {colors} = themeFixtures.lightTheme;
      (hasVoiceFile as jest.Mock).mockResolvedValue(false);
      (ensureVoiceFile as jest.Mock).mockResolvedValue(false);
      const view = renderSheet();
      await view.findByText(/isn't downloaded yet/);
      expect(voiceStatus(view)).toHaveStyle({color: colors.onSurfaceVariant});

      fireEvent.press(view.getByTestId('voice-setup-continue'));

      await view.findByText(/Couldn't download Sarah/);
      expect(voiceStatus(view)).toHaveStyle({color: colors.error});
    });

    it('never fetches the voice file when the whisper download fails', async () => {
      (hasVoiceFile as jest.Mock).mockResolvedValue(false);
      const view = renderSheet();
      await view.findByText(/isn't downloaded yet/);

      fireEvent.press(view.getByTestId('voice-setup-continue'));

      await waitFor(() => expect(asrStore.downloadModel).toHaveBeenCalled());
      await waitFor(() =>
        expect(view.getByTestId('voice-setup-continue')).toBeEnabled(),
      );
      expect(ensureVoiceFile).not.toHaveBeenCalled();
      expect(onDone).not.toHaveBeenCalled();
    });

    it('does not check the disk without a neural voice', async () => {
      runInAction(() => {
        tts.currentVoice = {id: 's', name: 'Samantha', engine: 'system'};
      });
      const view = renderSheet();
      await act(async () => {});

      expect(voiceStatus(view)).toHaveTextContent(strings.voiceRowMissing);
      expect(hasVoiceFile).not.toHaveBeenCalled();
    });

    it('Continue retries, then asks for the mic and finishes', async () => {
      readyWhisper();
      (hasVoiceFile as jest.Mock).mockResolvedValue(false);
      (ensureVoiceFile as jest.Mock)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);
      const view = renderSheet();
      fireEvent.press(view.getByTestId('voice-setup-continue'));
      await view.findByText(/Couldn't download Sarah/);

      fireEvent.press(view.getByTestId('voice-setup-continue'));

      await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
      expect(ensureMicPermission).toHaveBeenCalledTimes(1);
      expect(view.getByText('Sarah · ready')).toBeTruthy();
    });

    it('ensures after the whisper download, even when the file read present', async () => {
      asr.downloadModel.mockImplementationOnce(async () => {
        readyWhisper();
      });
      const view = renderSheet();
      await view.findByText('Sarah · ready');

      fireEvent.press(view.getByTestId('voice-setup-continue'));

      await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
      expect(ensureVoiceFile).toHaveBeenCalledWith(
        expect.objectContaining({engine: 'supertonic', id: 'F1'}),
      );
      expect(asr.downloadModel.mock.invocationCallOrder[0]).toBeLessThan(
        (ensureVoiceFile as jest.Mock).mock.invocationCallOrder[0]!,
      );
    });

    it('shows the downloading label and blocks Continue while the file downloads', async () => {
      readyWhisper();
      (hasVoiceFile as jest.Mock).mockResolvedValue(false);
      const ensure = deferred();
      (ensureVoiceFile as jest.Mock).mockReturnValue(ensure.promise);
      const view = renderSheet();
      await view.findByText(/isn't downloaded yet/);

      fireEvent.press(view.getByTestId('voice-setup-continue'));

      const button = await view.findByText(l10n.en.voiceInput.downloadingLabel);
      expect(button).toBeTruthy();
      expect(view.getByTestId('voice-setup-continue')).toBeDisabled();
      await act(async () => ensure.resolve(true));
    });

    it('stops setup when the sheet is closed during the file download', async () => {
      readyWhisper();
      const ensure = deferred();
      (ensureVoiceFile as jest.Mock).mockReturnValue(ensure.promise);
      const view = renderSheet();
      fireEvent.press(view.getByTestId('voice-setup-continue'));
      await waitFor(() => expect(ensureVoiceFile).toHaveBeenCalled());

      view.rerender(
        <VoiceSetupSheet isVisible={false} onClose={onClose} onDone={onDone} />,
      );
      await act(async () => ensure.resolve(true));

      expect(ensureMicPermission).not.toHaveBeenCalled();
      expect(onDone).not.toHaveBeenCalled();
    });

    it('stops setup when the app is backgrounded during the file download', async () => {
      readyWhisper();
      const appState = AppState.currentState;
      const ensure = deferred();
      (ensureVoiceFile as jest.Mock).mockReturnValue(ensure.promise);
      try {
        const view = renderSheet();
        fireEvent.press(view.getByTestId('voice-setup-continue'));
        await waitFor(() => expect(ensureVoiceFile).toHaveBeenCalled());

        Object.defineProperty(AppState, 'currentState', {
          value: 'background',
          configurable: true,
          writable: true,
        });
        await act(async () => ensure.resolve(true));

        expect(ensureMicPermission).not.toHaveBeenCalled();
        expect(onDone).not.toHaveBeenCalled();
      } finally {
        Object.defineProperty(AppState, 'currentState', {value: appState});
      }
    });

    it('re-checks a newly chosen voice and clears the failed line', async () => {
      readyWhisper();
      (hasVoiceFile as jest.Mock).mockResolvedValue(false);
      (ensureVoiceFile as jest.Mock).mockResolvedValue(false);
      const view = renderSheet();
      fireEvent.press(view.getByTestId('voice-setup-continue'));
      await view.findByText(/Couldn't download Sarah/);

      (hasVoiceFile as jest.Mock).mockResolvedValue(true);
      act(() => {
        runInAction(() => {
          tts.currentVoice = {id: 'F2', name: 'Lily', engine: 'supertonic'};
        });
      });

      expect(await view.findByText('Lily · ready')).toBeTruthy();
      expect(view.queryByText(/Couldn't download/)).toBeNull();
      expect(hasVoiceFile).toHaveBeenLastCalledWith(
        expect.objectContaining({id: 'F2'}),
      );
    });

    it('ignores a failed download for a voice that was changed meanwhile', async () => {
      readyWhisper();
      (hasVoiceFile as jest.Mock).mockResolvedValue(false);
      const ensure = deferred();
      (ensureVoiceFile as jest.Mock).mockReturnValue(ensure.promise);
      const view = renderSheet();
      fireEvent.press(view.getByTestId('voice-setup-continue'));
      await waitFor(() => expect(ensureVoiceFile).toHaveBeenCalled());

      act(() => {
        runInAction(() => {
          tts.currentVoice = {id: 'F2', name: 'Lily', engine: 'supertonic'};
        });
      });
      await view.findByText("Lily isn't downloaded yet. Continue gets it.");
      await act(async () => ensure.resolve(false));

      expect(view.queryByText(/Couldn't download/)).toBeNull();
      expect(view.getByText(/Lily isn't downloaded yet/)).toBeTruthy();
      expect(onDone).not.toHaveBeenCalled();
    });
  });
});
