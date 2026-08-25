import React from 'react';

import {runInAction} from 'mobx';

import {
  fireEvent,
  render as baseRender,
  waitFor,
} from '../../../../jest/test-utils';

import {ResetPasswordSheet} from '../ResetPasswordSheet';

import {authService} from '../../../services';
import {l10n, t} from '../../../locales';

jest.mock('../../../components/Sheet/Sheet', () => {
  const {TextInput, View} = require('react-native');
  const MockSheet = ({children, isVisible, title}: any) =>
    isVisible ? (
      <View testID="sheet">
        <View testID="sheet-title">{title}</View>
        {children}
      </View>
    ) : null;
  MockSheet.ScrollView = ({children}: any) => <View>{children}</View>;
  MockSheet.TextInput = TextInput;
  return {Sheet: MockSheet};
});

const copy = l10n.en.settings.account;

const onClose = jest.fn();

const render = (initialEmail = 'sam@example.com') =>
  baseRender(
    <ResetPasswordSheet
      isVisible
      initialEmail={initialEmail}
      onClose={onClose}
    />,
    {withSafeArea: true},
  );

describe('ResetPasswordSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    runInAction(() => {
      authService.error = null;
    });
  });

  it('sends the reset link and swaps to the confirmation for that address', async () => {
    (authService.resetPassword as jest.Mock).mockResolvedValueOnce(true);
    const {getByTestId, getByText, queryByTestId} = render(' sam@example.com ');

    expect(getByTestId('account-reset-email').props.value).toBe(
      ' sam@example.com ',
    );
    fireEvent.press(getByTestId('account-reset-submit'));

    await waitFor(() => expect(getByTestId('account-reset-sent')).toBeTruthy());
    expect(authService.resetPassword).toHaveBeenCalledWith('sam@example.com');
    expect(
      getByText(t(copy.reset.sentBody, {email: 'sam@example.com'})),
    ).toBeTruthy();
    expect(queryByTestId('account-reset-submit')).toBeNull();

    fireEvent.press(getByTestId('account-reset-done'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the confirmation for an address with no account', async () => {
    (authService.resetPassword as jest.Mock).mockResolvedValueOnce(true);
    const {getByTestId} = render('nobody@example.com');

    fireEvent.press(getByTestId('account-reset-submit'));

    await waitFor(() => expect(getByTestId('account-reset-sent')).toBeTruthy());
  });

  it('shows the service error when the request is rejected', async () => {
    (authService.resetPassword as jest.Mock).mockImplementationOnce(
      async () => {
        runInAction(() => {
          authService.error = 'Authentication not configured';
        });
        return false;
      },
    );
    const {getByTestId, queryByTestId} = render();

    fireEvent.press(getByTestId('account-reset-submit'));

    await waitFor(() =>
      expect(getByTestId('account-reset-error').props.children).toBe(
        'Authentication not configured',
      ),
    );
    expect(queryByTestId('account-reset-sent')).toBeNull();
  });

  it('does not call the service when the email is malformed', () => {
    const {getByTestId} = render('sam@');

    fireEvent.press(getByTestId('account-reset-submit'));

    expect(authService.resetPassword).not.toHaveBeenCalled();
    expect(getByTestId('account-reset-error').props.children).toBe(
      copy.validation.emailInvalid,
    );
  });
});
