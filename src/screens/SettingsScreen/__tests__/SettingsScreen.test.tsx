import React from 'react';

import {runInAction} from 'mobx';

import {
  act,
  fireEvent,
  render as baseRender,
} from '../../../../jest/test-utils';

import {SettingsScreen} from '../SettingsScreen';

import {authService} from '../../../services';
import {ROUTES} from '../../../utils/navigationConstants';
import {l10n, t} from '../../../locales';

const mockNavigate = jest.fn();
const mockReplace = jest.fn();
const mockPopToTop = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({
    navigate: mockNavigate,
    replace: mockReplace,
    popToTop: mockPopToTop,
  }),
}));

jest.useFakeTimers();

const render = (ui: React.ReactElement, options: any = {}) =>
  baseRender(ui, {withSafeArea: true, withNavigation: true, ...options});

const signIn = (
  user: Record<string, unknown> = {},
  profile: Record<string, unknown> | null = null,
) =>
  runInAction(() => {
    authService.isAuthenticated = true;
    authService.user = {
      id: 'user-1',
      email: 'sam@example.com',
      created_at: '2025-04-02T00:00:00.000Z',
      ...user,
    } as any;
    authService.profile = profile as any;
  });

describe('SettingsScreen (launcher)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    runInAction(() => {
      authService.isAuthenticated = false;
      authService.user = null;
      authService.profile = null;
      authService.error = null;
    });
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

  it('Create Account CTA navigates to the sign-up route', () => {
    const {getByTestId} = render(<SettingsScreen />);
    const cta = getByTestId('settings-create-account');
    expect(cta.props.accessibilityState?.disabled).toBeFalsy();
    fireEvent.press(cta);
    expect(mockNavigate).toHaveBeenCalledWith(ROUTES.ACCOUNT_SIGN_UP);
  });

  it('offers a Log in link beside the Create Account CTA', () => {
    const {getByTestId} = render(<SettingsScreen />);
    fireEvent.press(getByTestId('settings-log-in'));
    expect(mockNavigate).toHaveBeenCalledWith(ROUTES.ACCOUNT_LOGIN);
  });

  it('Account Settings row targets Log in while signed out', () => {
    const {getByTestId} = render(<SettingsScreen />);
    fireEvent.press(getByTestId('settings-nav-account-settings'));
    expect(mockNavigate).toHaveBeenCalledWith(ROUTES.ACCOUNT_LOGIN);
  });

  it('Account Settings row targets Account Settings once signed in', () => {
    signIn();
    const {getByTestId} = render(<SettingsScreen />);
    fireEvent.press(getByTestId('settings-nav-account-settings'));
    expect(mockNavigate).toHaveBeenCalledWith(ROUTES.ACCOUNT);
  });

  it('renders Account Settings last (after About App) in the not-registered state', () => {
    const original = (global as any).__DEV__;
    (global as any).__DEV__ = false;
    try {
      const {getByTestId, getAllByTestId} = render(<SettingsScreen />);
      const account = getByTestId('settings-nav-account-settings');
      const aboutApp = getByTestId('settings-nav-app-info');

      const rows = getAllByTestId(/^settings-nav-/);
      expect(rows[rows.length - 1]).toBe(account);
      expect(rows.indexOf(aboutApp)).toBeLessThan(rows.indexOf(account));
    } finally {
      (global as any).__DEV__ = original;
    }
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

  it('does not render the Log out footer in the not-registered state', () => {
    const {queryByTestId} = render(<SettingsScreen />);
    expect(queryByTestId('settings-log-out')).toBeNull();
  });

  it('re-renders registered when the session resolves after mount', () => {
    const {getByTestId, queryByTestId, getByText} = render(<SettingsScreen />);
    expect(queryByTestId('settings-nav-my-pals')).toBeNull();

    act(() => {
      signIn({}, {id: 'user-1', full_name: 'Sam Smith'});
    });

    expect(
      getByText(t(l10n.en.settings.launcher.welcome, {name: 'Sam Smith'})),
    ).toBeTruthy();
    expect(
      getByText(t(l10n.en.settings.launcher.memberSince, {year: 2025})),
    ).toBeTruthy();
    expect(getByTestId('settings-nav-my-pals')).toBeTruthy();
    expect(getByTestId('settings-log-out')).toBeTruthy();
    expect(queryByTestId('settings-create-account')).toBeNull();
  });

  it('signs out directly, with no confirmation dialog', () => {
    signIn();
    const {getByTestId} = render(<SettingsScreen />);

    fireEvent.press(getByTestId('settings-log-out'));

    expect(authService.signOut).toHaveBeenCalled();
  });

  it('reverts to the signed-out launcher once the session is gone', () => {
    signIn();
    const {getByTestId, queryByTestId} = render(<SettingsScreen />);
    expect(getByTestId('settings-log-out')).toBeTruthy();

    act(() => {
      runInAction(() => {
        authService.isAuthenticated = false;
        authService.user = null;
        authService.profile = null;
      });
    });

    expect(queryByTestId('settings-log-out')).toBeNull();
    expect(getByTestId('settings-create-account')).toBeTruthy();
    expect(queryByTestId('settings-nav-my-pals')).toBeNull();
  });

  it('greets without a name when no name source exists', () => {
    signIn({email: undefined, user_metadata: {}});
    const {getByText} = render(<SettingsScreen />);

    expect(getByText(l10n.en.settings.launcher.welcomeNoName)).toBeTruthy();
  });

  it('falls back through the name sources and never reads profile.email', () => {
    signIn(
      {email: 'sam@example.com'},
      {id: 'user-1', username: 'sam_123', email: 'stale@wrong.example'},
    );
    const {getByText, queryByText} = render(<SettingsScreen />);

    expect(
      getByText(t(l10n.en.settings.launcher.welcome, {name: 'sam_123'})),
    ).toBeTruthy();
    expect(
      queryByText(
        t(l10n.en.settings.launcher.welcome, {name: 'stale@wrong.example'}),
      ),
    ).toBeNull();
  });

  it('omits the member-since row when the account carries no created_at', () => {
    signIn({created_at: undefined});
    const {queryByText} = render(<SettingsScreen />);

    expect(
      queryByText(t(l10n.en.settings.launcher.memberSince, {year: 2025})),
    ).toBeNull();
  });

  it('never mounts the checkout auth sheet', () => {
    signIn();
    const {queryByTestId} = render(<SettingsScreen />);

    expect(queryByTestId('email-input')).toBeNull();
    expect(queryByTestId('auth-submit-button')).toBeNull();
  });
});
