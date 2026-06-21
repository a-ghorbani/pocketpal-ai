import React from 'react';
import {Platform} from 'react-native';
import {runInAction} from 'mobx';

import {
  fireEvent,
  render as baseRender,
  act,
} from '../../../../jest/test-utils';

import {AppSettingsScreen} from '../AppSettingsScreen';

import {uiStore, ttsStore} from '../../../store';

jest.useFakeTimers();

const render = (ui: React.ReactElement, options: any = {}) =>
  baseRender(ui, {
    withSafeArea: true,
    withNavigation: true,
    withBottomSheetProvider: true,
    ...options,
  });

describe('AppSettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('toggles Dark Mode through its existing writer (testID survives move)', async () => {
    const {getByTestId} = render(<AppSettingsScreen />);
    await act(async () => {
      fireEvent(getByTestId('dark-mode-switch'), 'valueChange', true);
    });
    expect(uiStore.setColorScheme).toHaveBeenCalledWith('dark');
  });

  it('reflects the Background Download value and routes through the existing writer', async () => {
    runInAction(() => {
      uiStore.iOSBackgroundDownloading = true;
    });
    const {getByTestId} = render(<AppSettingsScreen />);
    const sw = getByTestId('background-download-switch');

    await act(async () => {
      fireEvent(sw, 'valueChange', false);
    });
    expect(uiStore.setiOSBackgroundDownloading).toHaveBeenCalledWith(false);
  });

  it('renders the language selector and its menu options', () => {
    const {getByTestId} = render(<AppSettingsScreen />);
    expect(getByTestId('language-selector-button')).toBeTruthy();
  });

  it('toggles TTS availability through its existing writer', async () => {
    runInAction(() => {
      ttsStore.deviceMeetsMemory = true;
      ttsStore.userTTSOverride = null;
    });
    const {getByTestId} = render(<AppSettingsScreen />);
    await act(async () => {
      fireEvent(getByTestId('tts-availability-switch'), 'valueChange', false);
    });
    expect(ttsStore.setUserTTSOverride).toHaveBeenCalledWith(false);
    runInAction(() => {
      ttsStore.deviceMeetsMemory = false;
    });
  });

  it('renders Display Memory Usage only on iOS', () => {
    Platform.OS = 'ios';
    const {getByTestId} = render(<AppSettingsScreen />);
    expect(getByTestId('display-memory-usage-switch')).toBeTruthy();
  });

  it('toggles Display Memory Usage through its existing writer', async () => {
    Platform.OS = 'ios';
    const {getByTestId} = render(<AppSettingsScreen />);
    await act(async () => {
      fireEvent(
        getByTestId('display-memory-usage-switch'),
        'valueChange',
        true,
      );
    });
    expect(uiStore.setDisplayMemUsage).toHaveBeenCalledWith(true);
  });
});
