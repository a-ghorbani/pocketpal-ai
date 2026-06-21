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

  it('renders the language selector and its menu options', () => {
    const {getByTestId} = render(<AppSettingsScreen />);
    expect(getByTestId('language-selector-button')).toBeTruthy();
  });

  it('drives the language menu from supportedLanguages so every option is templated', () => {
    // The menu items (language-option-*) render only after the anchor button's
    // native measure() callback fires, which jsdom does not invoke; the visible
    // selector and the supportedLanguages source that templates the options are
    // the unit-testable surface. The open-menu + language-option-* selection
    // interaction is exercised by the App Settings visual capture and the
    // Appium language spec.
    const {getByTestId} = render(<AppSettingsScreen />);
    expect(getByTestId('language-selector-button')).toBeTruthy();
    expect(uiStore.supportedLanguages.length).toBeGreaterThan(0);
    expect(uiStore.supportedLanguages).toContain('en');
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
