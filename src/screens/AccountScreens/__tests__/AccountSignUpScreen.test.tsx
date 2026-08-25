import React from 'react';

import {runInAction} from 'mobx';

import {
  fireEvent,
  isNestedInText,
  render as baseRender,
  waitFor,
} from '../../../../jest/test-utils';

import {AccountSignUpScreen} from '../AccountSignUpScreen';

import {authService} from '../../../services';
import {ROUTES} from '../../../utils/navigationConstants';
import {l10n, t} from '../../../locales';

const mockReplace = jest.fn();
const mockPopToTop = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({replace: mockReplace, popToTop: mockPopToTop}),
}));

const copy = l10n.en.settings.account;

const render = () => baseRender(<AccountSignUpScreen />, {withSafeArea: true});

const fillForm = (
  getByTestId: (id: string) => any,
  email = 'sam@example.com',
) => {
  fireEvent.changeText(getByTestId('account-signup-name'), ' Sam ');
  fireEvent.changeText(getByTestId('account-signup-email'), ` ${email} `);
  fireEvent.changeText(getByTestId('account-signup-password'), 'hunter2');
};

const resetAuth = () =>
  runInAction(() => {
    authService.isAuthenticated = false;
    authService.isLoading = false;
    authService.error = null;
    authService.user = null;
    authService.profile = null;
    authService.session = null;
  });

describe('AccountSignUpScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetAuth();
  });

  it('signs up with the trimmed values and lands in verification pending', async () => {
    (authService.signUpWithEmail as jest.Mock).mockResolvedValueOnce(true);
    const {getByTestId, getByText} = render();

    fillForm(getByTestId);
    fireEvent.press(getByTestId('account-signup-submit'));

    await waitFor(() =>
      expect(getByTestId('account-signup-verify')).toBeTruthy(),
    );
    expect(authService.signUpWithEmail).toHaveBeenCalledWith(
      'sam@example.com',
      'hunter2',
      'Sam',
    );
    expect(
      getByText(t(copy.verify.body, {email: 'sam@example.com'})),
    ).toBeTruthy();

    fireEvent.press(getByTestId('account-signup-verify-done'));
    expect(mockPopToTop).toHaveBeenCalled();
  });

  it('skips the verification body when the sign-up yields a session', async () => {
    (authService.signUpWithEmail as jest.Mock).mockImplementationOnce(
      async () => {
        runInAction(() => {
          authService.isAuthenticated = true;
        });
        return true;
      },
    );
    const {getByTestId, queryByTestId} = render();

    fillForm(getByTestId);
    fireEvent.press(getByTestId('account-signup-submit'));

    await waitFor(() => expect(mockPopToTop).toHaveBeenCalled());
    expect(queryByTestId('account-signup-verify')).toBeNull();
  });

  it('offers a way back to Log in from the verification body', async () => {
    (authService.signUpWithEmail as jest.Mock).mockResolvedValueOnce(true);
    const {getByTestId} = render();

    fillForm(getByTestId, 'already@example.com');
    fireEvent.press(getByTestId('account-signup-submit'));

    await waitFor(() =>
      expect(getByTestId('account-signup-verify')).toBeTruthy(),
    );

    fireEvent.press(getByTestId('account-signup-verify-login-link'));
    expect(mockReplace).toHaveBeenCalledWith(ROUTES.ACCOUNT_LOGIN);
  });

  it('shows the service error when the sign-up is rejected', async () => {
    (authService.signUpWithEmail as jest.Mock).mockImplementationOnce(
      async () => {
        runInAction(() => {
          authService.error = 'Password should be at least 6 characters';
        });
        return false;
      },
    );
    const {getByTestId, queryByTestId} = render();

    fillForm(getByTestId);
    fireEvent.press(getByTestId('account-signup-submit'));

    await waitFor(() =>
      expect(getByTestId('account-signup-error').props.children).toBe(
        'Password should be at least 6 characters',
      ),
    );
    expect(queryByTestId('account-signup-verify')).toBeNull();
  });

  it('does not call the service when the name is blank', () => {
    const {getByTestId} = render();

    fireEvent.changeText(getByTestId('account-signup-name'), '   ');
    fireEvent.changeText(
      getByTestId('account-signup-email'),
      'sam@example.com',
    );
    fireEvent.changeText(getByTestId('account-signup-password'), 'hunter2');
    fireEvent.press(getByTestId('account-signup-submit'));

    expect(authService.signUpWithEmail).not.toHaveBeenCalled();
    expect(getByTestId('account-signup-error').props.children).toBe(
      copy.validation.nameRequired,
    );
  });

  it('submits with empty fields so the required-field message is reachable', () => {
    const {getByTestId} = render();
    const submit = getByTestId('account-signup-submit');

    expect(submit.props.accessibilityState?.disabled).toBeFalsy();
    fireEvent.press(submit);

    expect(authService.signUpWithEmail).not.toHaveBeenCalled();
    expect(getByTestId('account-signup-error').props.children).toBe(
      copy.validation.nameRequired,
    );
  });

  it('keeps the log-in prompt and its link in a single text run', () => {
    const {getByText} = render();

    expect(
      getByText(`${copy.signUp.haveAccountPrompt} ${copy.signUp.loginLink}`),
    ).toBeTruthy();
  });

  it('carries both log-in link testIDs on a Text that is not nested in another', async () => {
    (authService.signUpWithEmail as jest.Mock).mockResolvedValueOnce(true);
    const {getByTestId} = render();

    expect(isNestedInText(getByTestId('account-signup-login-link'))).toBe(
      false,
    );

    fillForm(getByTestId);
    fireEvent.press(getByTestId('account-signup-submit'));
    await waitFor(() =>
      expect(getByTestId('account-signup-verify')).toBeTruthy(),
    );

    expect(
      isNestedInText(getByTestId('account-signup-verify-login-link')),
    ).toBe(false);
  });

  it('replaces itself with Log in rather than stacking a second route', () => {
    const {getByTestId} = render();

    fireEvent.press(getByTestId('account-signup-login-link'));

    expect(mockReplace).toHaveBeenCalledWith(ROUTES.ACCOUNT_LOGIN);
  });
});
