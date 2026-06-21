import React from 'react';

import {fireEvent, render as baseRender} from '../../../../jest/test-utils';

import {SettingsScreen} from '../SettingsScreen';

import {ROUTES} from '../../../utils/navigationConstants';
import {l10n} from '../../../locales';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({navigate: mockNavigate}),
}));

jest.useFakeTimers();

const render = (ui: React.ReactElement, options: any = {}) =>
  baseRender(ui, {withSafeArea: true, withNavigation: true, ...options});

describe('SettingsScreen (launcher)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the not-registered Create Account CTA and no Welcome/My-pals', () => {
    const {getByTestId, queryByTestId, queryByText} = render(
      <SettingsScreen />,
    );

    expect(getByTestId('settings-create-account')).toBeTruthy();
    expect(queryByTestId('settings-nav-my-pals')).toBeNull();
    expect(
      queryByText(l10n.en.settings.launcher.welcome.replace('{{name}}', '')),
    ).toBeNull();
  });

  it('Create Account CTA is inert (no navigation on press)', () => {
    const {getByTestId} = render(<SettingsScreen />);
    fireEvent.press(getByTestId('settings-create-account'));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('Account Settings row is inert (no navigation on press)', () => {
    const {getByTestId} = render(<SettingsScreen />);
    fireEvent.press(getByTestId('settings-nav-account-settings'));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('navigates to Preferences', () => {
    const {getByTestId} = render(<SettingsScreen />);
    fireEvent.press(getByTestId('settings-nav-preferences'));
    expect(mockNavigate).toHaveBeenCalledWith(ROUTES.PREFERENCES);
  });

  it('navigates to App Settings', () => {
    const {getByTestId} = render(<SettingsScreen />);
    fireEvent.press(getByTestId('settings-nav-app-settings'));
    expect(mockNavigate).toHaveBeenCalledWith(ROUTES.APP_SETTINGS);
  });

  it('navigates to Benchmark (settings-nav-benchmark kept reachable)', () => {
    const {getByTestId} = render(<SettingsScreen />);
    fireEvent.press(getByTestId('settings-nav-benchmark'));
    expect(mockNavigate).toHaveBeenCalledWith(ROUTES.BENCHMARK);
  });

  it('navigates to Models', () => {
    const {getByTestId} = render(<SettingsScreen />);
    fireEvent.press(getByTestId('settings-nav-models'));
    expect(mockNavigate).toHaveBeenCalledWith(ROUTES.MODELS);
  });

  it('navigates to App Info (About App row)', () => {
    const {getByTestId} = render(<SettingsScreen />);
    fireEvent.press(getByTestId('settings-nav-app-info'));
    expect(mockNavigate).toHaveBeenCalledWith(ROUTES.APP_INFO);
  });

  it('navigates to Dev Tools when __DEV__ exposes the row', () => {
    // __DEV__ defaults to true in the Jest env, so the row is present here.
    const {getByTestId} = render(<SettingsScreen />);
    fireEvent.press(getByTestId('settings-nav-dev-tools'));
    expect(mockNavigate).toHaveBeenCalledWith(ROUTES.DEV_TOOLS);
  });

  it('hides the Dev Tools row when __DEV__ is false but keeps Benchmark and About App reachable', () => {
    const original = (global as any).__DEV__;
    (global as any).__DEV__ = false;
    try {
      const {queryByTestId, getByTestId} = render(<SettingsScreen />);
      expect(queryByTestId('settings-nav-dev-tools')).toBeNull();
      expect(getByTestId('settings-nav-benchmark')).toBeTruthy();
      expect(getByTestId('settings-nav-app-info')).toBeTruthy();
    } finally {
      (global as any).__DEV__ = original;
    }
  });

  it('does not render the Log out footer in the not-registered state (inert auth)', () => {
    const {queryByTestId} = render(<SettingsScreen />);
    expect(queryByTestId('settings-log-out')).toBeNull();
  });
});
