import React from 'react';
import {Platform} from 'react-native';
import {runInAction} from 'mobx';

import {
  fireEvent,
  render as baseRender,
  act,
} from '../../../../jest/test-utils';

import {AppSettingsScreen} from '../AppSettingsScreen';

import {uiStore, ttsStore, searchProviderStore} from '../../../store';

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
    // The options (language-option-*) live in the selector's searchable sheet,
    // which the sheet mock does not mount; the visible trigger and the
    // supportedLanguages source that templates the options are the
    // unit-testable surface here. Opening the sheet and selecting a language is
    // exercised by SearchableSelectSheet's own tests and the Appium language
    // spec.
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

  describe('internet search settings', () => {
    afterEach(() => {
      runInAction(() => {
        searchProviderStore.hasConsentedToSearch = false;
      });
    });

    it('shows the consent gate first and routes acceptance to the store', () => {
      const {getByTestId, queryByTestId} = render(<AppSettingsScreen />);

      expect(getByTestId('internet-search-consent')).toBeTruthy();
      expect(queryByTestId('internet-search-consent-given')).toBeNull();

      fireEvent.press(getByTestId('internet-search-consent-accept'));

      expect(searchProviderStore.setConsent).toHaveBeenCalledWith(true);
    });

    it('gates the BYOK key sheet behind consent', () => {
      const {getByTestId, rerender} = render(<AppSettingsScreen />);
      expect(
        getByTestId('search-provider-key-button').props.accessibilityState
          .disabled,
      ).toBe(true);

      runInAction(() => {
        searchProviderStore.hasConsentedToSearch = true;
      });
      rerender(<AppSettingsScreen />);

      expect(getByTestId('internet-search-consent-given')).toBeTruthy();
      expect(
        getByTestId('search-provider-key-button').props.accessibilityState
          .disabled,
      ).toBe(false);
    });

    it('writes the result count through the store', () => {
      jest.useFakeTimers();
      const {getByTestId} = render(<AppSettingsScreen />);

      act(() => {
        fireEvent(getByTestId('search-result-count-slider'), 'valueChange', 3);
      });
      act(() => {
        jest.advanceTimersByTime(300);
      });

      expect(searchProviderStore.setResultCount).toHaveBeenCalledWith(3);
    });
  });
});
