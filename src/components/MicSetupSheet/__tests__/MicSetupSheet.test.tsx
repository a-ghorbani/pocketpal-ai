import React from 'react';
import {runInAction} from 'mobx';

import {act, fireEvent, render} from '../../../../jest/test-utils';
import {l10n} from '../../../locales';
import {ASR_INSUFFICIENT_STORAGE} from '../../../services/asr';
import {asrStore} from '../../../store';

import {MicSetupSheet} from '../MicSetupSheet';

jest.mock('../../Sheet', () => {
  const ReactActual = require('react');
  const {View} = require('react-native');
  const {Text} = require('react-native');
  const Sheet: any = ({children, isVisible, onClose, title}: any) => {
    const wasVisible = ReactActual.useRef(false);
    ReactActual.useEffect(() => {
      if (isVisible) {
        wasVisible.current = true;
      } else if (wasVisible.current) {
        onClose?.();
      }
    }, [isVisible, onClose]);
    return isVisible ? (
      <View>
        <Text>{title}</Text>
        {children}
      </View>
    ) : null;
  };
  Sheet.ScrollView = ({children, testID}: any) => (
    <View testID={testID}>{children}</View>
  );
  return {Sheet};
});

const strings = l10n.en.voiceInput;
const asr = asrStore as any;
const onClosed = jest.fn();

const renderSheet = () => render(<MicSetupSheet onClosed={onClosed} />);

describe('MicSetupSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    runInAction(() => {
      asr.selectedTier = 'base';
      for (const tier of ['base', 'small', 'large-turbo']) {
        asr.downloadStates[tier] = 'not_installed';
        asr.downloadProgress[tier] = 0;
        asr.downloadError[tier] = null;
      }
      asr.freeDiskBytes = null;
    });
  });

  it('offers the base download', () => {
    const {getByTestId, getByText} = renderSheet();

    expect(getByText(strings.setupSheetTitle)).toBeTruthy();
    expect(getByText(/^Whisper Base · /)).toBeTruthy();
    fireEvent.press(getByTestId('mic-setup-download'));

    expect(asrStore.downloadModel).toHaveBeenCalledWith('base');
  });

  it('offers base while another tier downloads and none is installed', () => {
    runInAction(() => {
      asr.downloadStates.small = 'downloading';
    });
    const {getByTestId, getByText} = renderSheet();

    expect(getByText(/^Whisper Base · /)).toBeTruthy();
    expect(getByTestId('mic-setup-download')).not.toBeDisabled();
    fireEvent.press(getByTestId('mic-setup-download'));

    expect(asrStore.downloadModel).toHaveBeenCalledWith('base');
  });

  it('offers base, not a stale uninstalled tier, before init reconciles', () => {
    runInAction(() => {
      asr.selectedTier = 'small';
    });
    const {getByTestId, getByText} = renderSheet();

    expect(getByText(/^Whisper Base · /)).toBeTruthy();
    fireEvent.press(getByTestId('mic-setup-download'));

    expect(asrStore.downloadModel).toHaveBeenCalledWith('base');
    expect(asrStore.selectTier).not.toHaveBeenCalled();
  });

  it('shows progress and holds the button while downloading', () => {
    runInAction(() => {
      asr.downloadStates.base = 'downloading';
      asr.downloadProgress.base = 0.5;
    });
    const {getByTestId, getByText} = renderSheet();

    expect(getByTestId('mic-setup-download')).toBeDisabled();
    expect(getByText(strings.downloadingLabel)).toBeTruthy();
    expect(getByTestId('mic-setup-stt')).toHaveTextContent(/ of /);
  });

  it('offers Retry after a failed download', () => {
    runInAction(() => {
      asr.downloadStates.base = 'error';
      asr.downloadError.base = 'network';
    });
    const {getByTestId, getByText} = renderSheet();

    expect(getByText(l10n.en.voiceMode.sttDownloadFailed)).toBeTruthy();
    fireEvent.press(getByTestId('mic-setup-download'));

    expect(asrStore.retryDownload).toHaveBeenCalledWith('base');
  });

  it('shows the disk shortfall', () => {
    runInAction(() => {
      asr.downloadStates.base = 'error';
      asr.downloadError.base = ASR_INSUFFICIENT_STORAGE;
      asr.freeDiskBytes = 50 * 1024 * 1024;
    });
    const {getByTestId, getByText} = renderSheet();

    expect(getByTestId('mic-setup-low-disk')).toBeTruthy();
    expect(getByText(strings.retryCta)).toBeTruthy();
  });

  it('closes itself once a tier is ready', () => {
    const {queryByTestId} = renderSheet();

    act(() =>
      runInAction(() => {
        asr.downloadStates.base = 'ready';
      }),
    );

    expect(queryByTestId('mic-setup-sheet')).toBeNull();
    expect(onClosed).toHaveBeenCalled();
  });

  it('Cancel closes the sheet and leaves the download running', () => {
    runInAction(() => {
      asr.downloadStates.base = 'downloading';
    });
    const {getByTestId, queryByTestId} = renderSheet();

    fireEvent.press(getByTestId('mic-setup-cancel'));

    expect(queryByTestId('mic-setup-sheet')).toBeNull();
    expect(onClosed).toHaveBeenCalled();
    expect(asrStore.downloadStates.base).toBe('downloading');
  });
});
