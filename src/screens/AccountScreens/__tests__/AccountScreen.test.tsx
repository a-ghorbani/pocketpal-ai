import React from 'react';

import {runInAction} from 'mobx';

import {
  act,
  fireEvent,
  render as baseRender,
  waitFor,
} from '../../../../jest/test-utils';

import {AccountScreen} from '../AccountScreen';

import {authService} from '../../../services';
import {l10n, t} from '../../../locales';

const mockPopToTop = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({popToTop: mockPopToTop}),
}));

const copy = l10n.en.settings.account;

const render = () => baseRender(<AccountScreen />, {withSafeArea: true});

const signIn = (user: Record<string, unknown> = {}, username = 'sam_123') =>
  runInAction(() => {
    authService.isAuthenticated = true;
    authService.error = null;
    authService.user = {
      id: 'user-1',
      email: 'sam@example.com',
      created_at: '2025-04-02T00:00:00.000Z',
      ...user,
    } as any;
    authService.profile = {id: 'user-1', username} as any;
  });

describe('AccountScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    signIn();
  });

  it('reads the address from the user, never from the profile', () => {
    runInAction(() => {
      authService.profile = {
        id: 'user-1',
        username: 'sam_123',
        email: 'stale@wrong.example',
      } as any;
    });
    const {getByTestId} = render();

    expect(getByTestId('account-details-identity').props.children).toBe(
      t(copy.details.registeredWithEmail, {email: 'sam@example.com'}),
    );
  });

  it('names the provider when the account came from Google', () => {
    signIn({app_metadata: {provider: 'google'}});
    const {getByTestId} = render();

    expect(getByTestId('account-details-identity').props.children).toBe(
      t(copy.details.registeredWithProvider, {
        provider: 'Google',
        email: 'sam@example.com',
      }),
    );
  });

  it('saves the username and confirms it once the profile reads back', async () => {
    (authService.updateProfile as jest.Mock).mockImplementationOnce(
      async (updates: {username: string}) => {
        runInAction(() => {
          authService.error = null;
          authService.profile = {
            id: 'user-1',
            username: updates.username,
          } as any;
        });
      },
    );
    const {getByTestId, getByText} = render();

    fireEvent.changeText(getByTestId('account-details-username'), ' sam_456 ');
    fireEvent.press(getByTestId('account-details-save'));

    await waitFor(() => expect(getByText(copy.details.saved)).toBeTruthy());
    expect(authService.updateProfile).toHaveBeenCalledWith({
      username: 'sam_456',
    });
  });

  it('reports saved-unconfirmed when the write lands but the read-back is stale', async () => {
    (authService.updateProfile as jest.Mock).mockImplementationOnce(
      async () => {
        runInAction(() => {
          authService.error = null;
        });
      },
    );
    const {getByTestId, getByText, queryByTestId} = render();

    fireEvent.changeText(getByTestId('account-details-username'), 'sam_456');
    fireEvent.press(getByTestId('account-details-save'));

    await waitFor(() =>
      expect(getByText(copy.details.savedUnconfirmed)).toBeTruthy(),
    );
    expect(queryByTestId('account-details-error')).toBeNull();
  });

  it('shows the rejection and keeps the typed username', async () => {
    (authService.updateProfile as jest.Mock).mockImplementationOnce(
      async () => {
        runInAction(() => {
          authService.error =
            'duplicate key value violates unique constraint "profiles_username_key"';
        });
      },
    );
    const {getByTestId, queryByText} = render();

    fireEvent.changeText(getByTestId('account-details-username'), 'taken_name');
    fireEvent.press(getByTestId('account-details-save'));

    await waitFor(() =>
      expect(getByTestId('account-details-error').props.children).toBe(
        'duplicate key value violates unique constraint "profiles_username_key"',
      ),
    );
    expect(getByTestId('account-details-username').props.value).toBe(
      'taken_name',
    );
    expect(queryByText(copy.details.saved)).toBeNull();
  });

  it('pops when the session goes away while the screen is mounted', async () => {
    render();
    expect(mockPopToTop).not.toHaveBeenCalled();

    await act(async () => {
      runInAction(() => {
        authService.isAuthenticated = false;
      });
    });

    expect(mockPopToTop).toHaveBeenCalled();
  });

  it('renders no password, delete-account, or log-out control', () => {
    const {queryByTestId, queryByText} = render();

    expect(queryByTestId('settings-log-out')).toBeNull();
    expect(queryByText(l10n.en.settings.launcher.logOut)).toBeNull();
    expect(queryByText(copy.login.passwordLabel)).toBeNull();
  });
});
