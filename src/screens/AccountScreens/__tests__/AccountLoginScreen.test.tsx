import React from 'react';

import {runInAction} from 'mobx';

import {
  act,
  fireEvent,
  isNestedInText,
  render as baseRender,
  waitFor,
} from '../../../../jest/test-utils';

import {AccountLoginScreen} from '../AccountLoginScreen';

import {authService} from '../../../services';
import {ROUTES} from '../../../utils/navigationConstants';
import {l10n} from '../../../locales';

const mockReplace = jest.fn();
const mockPopToTop = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({replace: mockReplace, popToTop: mockPopToTop}),
}));

jest.mock('../../../components/Sheet/Sheet', () => {
  const {TextInput, View} = require('react-native');
  const MockSheet = ({children, isVisible}: any) =>
    isVisible ? <View testID="sheet">{children}</View> : null;
  MockSheet.ScrollView = ({children}: any) => <View>{children}</View>;
  MockSheet.TextInput = TextInput;
  return {Sheet: MockSheet};
});

const copy = l10n.en.settings.account;

const render = () => baseRender(<AccountLoginScreen />, {withSafeArea: true});

const resetAuth = () =>
  runInAction(() => {
    authService.isAuthenticated = false;
    authService.isLoading = false;
    authService.error = null;
    authService.user = null;
    authService.profile = null;
    authService.session = null;
  });

describe('AccountLoginScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetAuth();
  });

  it('submits the trimmed email and pops once the session arrives', async () => {
    (authService.signInWithEmail as jest.Mock).mockResolvedValueOnce(true);
    const {getByTestId} = render();

    fireEvent.changeText(
      getByTestId('account-login-email'),
      ' sam@example.com ',
    );
    fireEvent.changeText(getByTestId('account-login-password'), 'hunter2');
    fireEvent.press(getByTestId('account-login-submit'));

    await waitFor(() =>
      expect(authService.signInWithEmail).toHaveBeenCalledWith(
        'sam@example.com',
        'hunter2',
      ),
    );
    expect(mockPopToTop).not.toHaveBeenCalled();

    await act(async () => {
      runInAction(() => {
        authService.isAuthenticated = true;
      });
    });

    expect(mockPopToTop).toHaveBeenCalled();
  });

  it('shows the service error when the sign-in is rejected', async () => {
    (authService.signInWithEmail as jest.Mock).mockImplementationOnce(
      async () => {
        runInAction(() => {
          authService.error = 'Invalid login credentials';
        });
        return false;
      },
    );
    const {getByTestId} = render();

    fireEvent.changeText(getByTestId('account-login-email'), 'sam@example.com');
    fireEvent.changeText(getByTestId('account-login-password'), 'wrong');
    fireEvent.press(getByTestId('account-login-submit'));

    await waitFor(() =>
      expect(getByTestId('account-login-error').props.children).toBe(
        'Invalid login credentials',
      ),
    );
    expect(mockPopToTop).not.toHaveBeenCalled();
  });

  it('keeps the rendered error after the service nulls its own error field', async () => {
    (authService.signInWithEmail as jest.Mock).mockImplementationOnce(
      async () => {
        runInAction(() => {
          authService.error = 'Invalid login credentials';
        });
        return false;
      },
    );
    const {getByTestId} = render();

    fireEvent.changeText(getByTestId('account-login-email'), 'sam@example.com');
    fireEvent.changeText(getByTestId('account-login-password'), 'wrong');
    fireEvent.press(getByTestId('account-login-submit'));
    await waitFor(() =>
      expect(getByTestId('account-login-error')).toBeTruthy(),
    );

    await act(async () => {
      runInAction(() => {
        authService.error = null;
      });
    });

    expect(getByTestId('account-login-error').props.children).toBe(
      'Invalid login credentials',
    );
  });

  it('does not call the service when the email is malformed', () => {
    const {getByTestId} = render();

    fireEvent.changeText(getByTestId('account-login-email'), 'sam@');
    fireEvent.changeText(getByTestId('account-login-password'), 'hunter2');
    fireEvent.press(getByTestId('account-login-submit'));

    expect(authService.signInWithEmail).not.toHaveBeenCalled();
    expect(getByTestId('account-login-error').props.children).toBe(
      copy.validation.emailInvalid,
    );
  });

  it('surfaces a cancelled Google sign-in as an error and stays put', async () => {
    (authService.signInWithGoogle as jest.Mock).mockImplementationOnce(
      async () => {
        runInAction(() => {
          authService.error = 'No ID token received from Google';
        });
      },
    );
    const {getByTestId} = render();

    fireEvent.press(getByTestId('account-login-google'));

    await waitFor(() =>
      expect(getByTestId('account-login-error').props.children).toBe(
        'No ID token received from Google',
      ),
    );
    expect(mockPopToTop).not.toHaveBeenCalled();
  });

  it('leaves a completed Google sign-in awaiting the session guard', async () => {
    const {getByTestId} = render();

    fireEvent.press(getByTestId('account-login-google'));

    await waitFor(() =>
      expect(authService.signInWithGoogle).toHaveBeenCalled(),
    );
    expect(
      getByTestId('account-login-submit').props.accessibilityState,
    ).toEqual(expect.objectContaining({disabled: true}));

    await act(async () => {
      runInAction(() => {
        authService.isAuthenticated = true;
      });
    });

    expect(mockPopToTop).toHaveBeenCalled();
  });

  it('replaces itself with Create Account rather than stacking a second route', () => {
    const {getByTestId} = render();

    fireEvent.press(getByTestId('account-login-signup-link'));

    expect(mockReplace).toHaveBeenCalledWith(ROUTES.ACCOUNT_SIGN_UP);
  });

  it('opens the reset sheet prefilled with the typed email', () => {
    const {getByTestId} = render();

    fireEvent.changeText(getByTestId('account-login-email'), 'sam@example.com');
    fireEvent.press(getByTestId('account-login-forgot'));

    expect(getByTestId('account-reset-email').props.value).toBe(
      'sam@example.com',
    );
  });

  it('submits with empty fields so the required-field message is reachable', () => {
    const {getByTestId} = render();
    const submit = getByTestId('account-login-submit');

    expect(submit.props.accessibilityState?.disabled).toBeFalsy();
    fireEvent.press(submit);

    expect(authService.signInWithEmail).not.toHaveBeenCalled();
    expect(getByTestId('account-login-error').props.children).toBe(
      copy.validation.emailRequired,
    );
  });

  it('keeps the sign-up prompt and its link in a single text run', () => {
    const {getByText} = render();

    // Two sibling Texts in a mirrored flex row reverse their reading order
    // under RTL; one run with an inline link cannot be reordered. A sibling
    // pair would also not compose into this single string.
    expect(
      getByText(
        `${copy.login.noAccountPrompt} ${copy.login.createAccountLink}`,
      ),
    ).toBeTruthy();
  });

  it('carries the sign-up link testID on a Text that is not nested in another', () => {
    const {getByTestId} = render();

    expect(isNestedInText(getByTestId('account-login-signup-link'))).toBe(
      false,
    );
  });

  it('keeps the legal footer prefix and both links in a single text run', () => {
    const {getByText} = render();

    expect(
      getByText(
        `${copy.legal.prefix} ${l10n.en.about.termsOfService} · ${l10n.en.about.privacyPolicy}`,
      ),
    ).toBeTruthy();
  });

  it('pops immediately when the route is opened with a live session', async () => {
    runInAction(() => {
      authService.isAuthenticated = true;
    });

    render();

    await waitFor(() => expect(mockPopToTop).toHaveBeenCalled());
  });
});
