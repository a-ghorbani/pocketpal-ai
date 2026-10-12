import React from 'react';
import {Alert} from 'react-native';

import {render, fireEvent, act} from '../../../../jest/test-utils';

import {AccountCard} from '../AccountCard';
import {authService} from '../../../services';
import {deleteAccount} from '../../../services/palshub/accountDeletion';

const deleteAccountMock = deleteAccount as jest.Mock;

const CONFIRM_MESSAGE =
  'This permanently deletes your PalsHub account and its library. Pals bought through the App Store or Google Play stay restorable on this device with your store account. Purchase records are kept anonymised for legal reasons.';

const alertMock = () => Alert.alert as jest.Mock;
const confirmButtons = () => alertMock().mock.calls[0][2];

const pressDeleteAndConfirm = async (
  getByTestId: (id: string) => any,
): Promise<void> => {
  fireEvent.press(getByTestId('settings-delete-account'));
  await act(async () => {
    await confirmButtons()[1].onPress();
  });
};

describe('AccountCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert');
    (authService as any).isAuthenticated = true;
  });

  afterEach(() => {
    (authService as any).isAuthenticated = false;
    jest.restoreAllMocks();
  });

  it('renders nothing while signed out', () => {
    (authService as any).isAuthenticated = false;
    const {queryByTestId} = render(<AccountCard />);

    expect(queryByTestId('account-card')).toBeNull();
    expect(queryByTestId('settings-delete-account')).toBeNull();
  });

  it('shows the Account card with a Delete account button while signed in', () => {
    const {getByTestId, getByText} = render(<AccountCard />);

    expect(getByTestId('account-card')).toBeTruthy();
    expect(getByText('Account')).toBeTruthy();
    expect(getByText('Delete account')).toBeTruthy();
  });

  it('asks for one confirmation with a destructive Delete', () => {
    const {getByTestId} = render(<AccountCard />);

    fireEvent.press(getByTestId('settings-delete-account'));

    expect(alertMock()).toHaveBeenCalledTimes(1);
    const [title, message, buttons] = alertMock().mock.calls[0];
    expect(title).toBe('Delete account?');
    expect(message).toBe(CONFIRM_MESSAGE);
    expect(buttons).toEqual([
      {text: 'Cancel', style: 'cancel'},
      {text: 'Delete', style: 'destructive', onPress: expect.any(Function)},
    ]);
    expect(deleteAccountMock).not.toHaveBeenCalled();
  });

  it('deletes nothing when the confirmation is cancelled', () => {
    const {getByTestId} = render(<AccountCard />);

    fireEvent.press(getByTestId('settings-delete-account'));
    confirmButtons()[0].onPress?.();

    expect(deleteAccountMock).not.toHaveBeenCalled();
  });

  it('deletes once on confirm', async () => {
    deleteAccountMock.mockResolvedValue({kind: 'deleted'});
    const {getByTestId} = render(<AccountCard />);

    await pressDeleteAndConfirm(getByTestId);

    expect(deleteAccountMock).toHaveBeenCalledTimes(1);
  });

  it('disables the button while the deletion is pending', async () => {
    let resolve: (value: unknown) => void = () => {};
    deleteAccountMock.mockReturnValue(
      new Promise(done => {
        resolve = done;
      }),
    );
    const {getByTestId} = render(<AccountCard />);

    fireEvent.press(getByTestId('settings-delete-account'));
    act(() => {
      confirmButtons()[1].onPress();
    });

    expect(
      getByTestId('settings-delete-account').props.accessibilityState,
    ).toMatchObject({disabled: true});
    fireEvent.press(getByTestId('settings-delete-account'));
    expect(alertMock()).toHaveBeenCalledTimes(1);
    expect(deleteAccountMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve({kind: 'failed'});
    });
    expect(
      getByTestId('settings-delete-account').props.accessibilityState,
    ).toMatchObject({disabled: false});
  });

  it.each([
    ['deleted', {kind: 'deleted'}, 'Your account has been deleted.'],
    ['sign_in_again', {kind: 'sign_in_again'}, 'Please sign in again'],
    ['failed', {kind: 'failed'}, 'Could not delete, try again'],
    [
      'creator',
      {kind: 'creator', contact: 'x@example.test'},
      'Creator accounts are deleted by our support team: x@example.test',
    ],
  ])('shows the %s outcome', async (_, outcome, message) => {
    deleteAccountMock.mockResolvedValue(outcome);
    const {getByTestId} = render(<AccountCard />);

    await pressDeleteAndConfirm(getByTestId);

    expect(alertMock()).toHaveBeenCalledTimes(2);
    expect(alertMock().mock.calls[1]).toEqual(['Delete account', message]);
  });

  it('shows nothing more when the Apple step is cancelled', async () => {
    deleteAccountMock.mockResolvedValue({kind: 'cancelled'});
    const {getByTestId} = render(<AccountCard />);

    await pressDeleteAndConfirm(getByTestId);

    expect(alertMock()).toHaveBeenCalledTimes(1);
  });

  describe('the prompt when Apple cannot confirm', () => {
    const openPrompt = async () => {
      deleteAccountMock.mockResolvedValue({kind: 'cancelled'});
      const {getByTestId} = render(<AccountCard />);
      await pressDeleteAndConfirm(getByTestId);
      const answer = deleteAccountMock.mock.calls[0][0].confirmWithoutApple();
      const [title, message, buttons] = alertMock().mock.calls[1];
      return {answer, title, message, buttons};
    };

    it('asks with a cancel and a destructive Delete', async () => {
      const {title, message, buttons} = await openPrompt();

      expect(title).toBe('Delete account');
      expect(message).toBe(
        "Couldn't confirm with Apple. Delete your account anyway?",
      );
      expect(buttons).toEqual([
        {text: 'Cancel', style: 'cancel', onPress: expect.any(Function)},
        {text: 'Delete', style: 'destructive', onPress: expect.any(Function)},
      ]);
    });

    it.each([
      ['Delete', true, 1],
      ['Cancel', false, 0],
    ])('%s answers %s', async (_, expected, index) => {
      const {answer, buttons} = await openPrompt();

      buttons[index].onPress();

      await expect(answer).resolves.toBe(expected);
    });
  });

  it('still reports the outcome after unmounting mid-flight', async () => {
    const errorSpy = jest.spyOn(console, 'error');
    let resolve: (value: unknown) => void = () => {};
    deleteAccountMock.mockReturnValue(
      new Promise(done => {
        resolve = done;
      }),
    );
    const {getByTestId, unmount} = render(<AccountCard />);

    fireEvent.press(getByTestId('settings-delete-account'));
    act(() => {
      confirmButtons()[1].onPress();
    });
    unmount();
    await act(async () => {
      resolve({kind: 'deleted'});
    });

    expect(alertMock().mock.calls[1]).toEqual([
      'Delete account',
      'Your account has been deleted.',
    ]);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
