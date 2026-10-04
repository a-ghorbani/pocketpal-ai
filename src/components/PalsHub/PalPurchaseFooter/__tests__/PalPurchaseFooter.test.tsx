import React from 'react';
import {Alert, Linking, Platform} from 'react-native';
import {runInAction} from 'mobx';

import {act, render, fireEvent, waitFor} from '../../../../../jest/test-utils';
import {mockPremiumPalsHubPal} from '../../../../../jest/fixtures/pals';

import {PalPurchaseFooter} from '../PalPurchaseFooter';
import {palStore, purchaseStore} from '../../../../store';
import {authService} from '../../../../services';
import type {LedgerRecord} from '../../../../store/PurchaseStore';
import type {Pal} from '../../../../types/pal';
import {version} from '../../../../../jest/fixtures/iap';

let mockAccountLinkEnabled = true;
jest.mock('../../../../services/iap/accountLink', () => ({
  get ACCOUNT_LINK_ENABLED() {
    return mockAccountLinkEnabled;
  },
}));

jest.mock('../../PalModelStep', () => {
  const {Text} = require('react-native');
  return {
    PalModelStep: ({localPal}: any) => (
      <Text testID="model-step-mock">{localPal.id}</Text>
    ),
  };
});

const pal = {
  ...mockPremiumPalsHubPal,
  id: 'pal-1',
  title: 'Story Pal',
  store_product_id: 'pal.abc',
  iap_enabled: {ios: true, android: true},
};

const record = (
  status: LedgerRecord['status'],
  overrides: Partial<LedgerRecord> = {},
): LedgerRecord => ({
  palId: 'pal-1',
  source: 'store',
  productId: 'pal.abc',
  transactionIds: [],
  status,
  title: 'Story Pal',
  supportCode: 'SUP-7',
  updatedAt: 1,
  ...overrides,
});

const localPal = {
  type: 'local',
  id: 'local-1',
  name: 'Story Pal',
  palshub_id: 'pal-1',
} as Pal;

const setup = (
  props: Partial<React.ComponentProps<typeof PalPurchaseFooter>> = {},
) => {
  const onClose = jest.fn();
  const utils = render(
    <PalPurchaseFooter pal={pal} onClose={onClose} {...props} />,
    {withNavigation: true},
  );
  return {...utils, onClose};
};

const setPhase = (palId: string, phase: string) =>
  (purchaseStore as unknown as {phases: Map<string, string>}).phases.set(
    palId,
    phase,
  );

const purchasable = () =>
  runInAction(() => {
    purchaseStore.availability = 'ready';
    purchaseStore.products.set('pal.abc', {
      productId: 'pal.abc',
      displayPrice: '4,99 €',
    });
  });

describe('PalPurchaseFooter', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    mockAccountLinkEnabled = true;
    (authService as any).isAuthenticated = false;
    runInAction(() => {
      (purchaseStore as any).reset();
      palStore.pals = [];
    });
  });

  afterEach(() => {
    (Platform as any).OS = originalOS;
  });

  it('renders the name above the store-priced Buy button', () => {
    purchasable();
    const {getByTestId, getByText, toJSON} = setup();

    expect(getByTestId('buy-button')).toBeTruthy();
    expect(getByText('4,99 €')).toBeTruthy();
    const text = JSON.stringify(toJSON());
    expect(text.indexOf('Story Pal')).toBeLessThan(text.indexOf('4,99 €'));
  });

  it('takes the price only from the store product', () => {
    purchasable();
    const {queryByText} = setup({pal: {...pal, price_cents: 1234}});
    expect(queryByText(/12[.,]34/)).toBeNull();
  });

  it('renders nothing at all when the Pal is not purchasable', () => {
    const {queryByTestId} = setup();
    expect(queryByTestId('buy-button')).toBeNull();
    expect(queryByTestId('pal-purchase-footer')).toBeNull();
  });

  it('shows paying while the store sheet is up', () => {
    purchasable();
    runInAction(() => {
      setPhase('pal-1', 'paying');
    });
    const {getByTestId, queryByTestId} = setup();
    expect(getByTestId('purchase-paying')).toHaveProp(
      'accessibilityLabel',
      'Unlocking',
    );
    expect(queryByTestId('buy-button')).toBeNull();
  });

  it('buys and closes the sheet on a cancel or error', async () => {
    purchasable();
    (purchaseStore.buy as jest.Mock).mockResolvedValueOnce('close');
    const {getByTestId, onClose} = setup();

    fireEvent.press(getByTestId('buy-button'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(purchaseStore.buy).toHaveBeenCalledWith(pal);
  });

  it('keeps the sheet open while the purchase continues', async () => {
    purchasable();
    const {getByTestId, onClose} = setup();
    fireEvent.press(getByTestId('buy-button'));
    await waitFor(() => expect(purchaseStore.buy).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows the pending message', () => {
    runInAction(() => {
      purchaseStore.records['pal-1'] = record('pending_payment');
    });
    const {getByText, queryByTestId} = setup();
    expect(getByText('Pending')).toBeTruthy();
    expect(queryByTestId('buy-button')).toBeNull();
  });

  it('shows unlocking with a Retry that retries at once', () => {
    runInAction(() => {
      purchaseStore.records['pal-1'] = record('unlocking');
    });
    const {getByTestId} = setup();
    expect(getByTestId('purchase-unlocking')).toHaveProp(
      'accessibilityLabel',
      'Unlocking',
    );
    fireEvent.press(getByTestId('purchase-retry-button'));
    expect(purchaseStore.retry).toHaveBeenCalledWith('pal-1');
  });

  it('shows progress while installing a grant', () => {
    runInAction(() => {
      purchaseStore.records['pal-1'] = record('granted');
    });
    const {getByTestId} = setup();
    expect(getByTestId('purchase-installing')).toHaveProp(
      'accessibilityLabel',
      'Unlocking',
    );
  });

  it('shows the iOS no-longer-available copy with a refund link and the support code', () => {
    (Platform as any).OS = 'ios';
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    runInAction(() => {
      purchaseStore.records['pal-1'] = record('unfulfillable');
    });
    const {getByTestId} = setup();
    expect(getByTestId('purchase-unfulfillable')).toHaveTextContent(
      'This Pal is no longer available. You can ask Apple for a refund.',
    );
    expect(getByTestId('purchase-support-code')).toHaveTextContent(
      'Support code: SUP-7',
    );

    fireEvent.press(getByTestId('purchase-refund-link'));

    expect(openURL).toHaveBeenCalledWith('https://reportaproblem.apple.com');
    openURL.mockRestore();
  });

  it.each([
    [false, "This purchase couldn't be completed. Google will refund you."],
    [true, 'This Pal was withdrawn. Contact support for a refund.'],
  ])(
    'shows the Android copy for withdrawn after delivery %p with the support code',
    (delivered, text) => {
      (Platform as any).OS = 'android';
      runInAction(() => {
        purchaseStore.records['pal-1'] = record(
          'unfulfillable',
          delivered ? {withdrawnAfterDelivery: true} : {},
        );
      });
      const {getByTestId, queryByTestId} = setup();
      expect(getByTestId('purchase-unfulfillable')).toHaveTextContent(text);
      expect(queryByTestId('purchase-refund-link')).toBeNull();
      expect(getByTestId('purchase-support-code')).toHaveTextContent(
        'Support code: SUP-7',
      );
    },
  );

  it('shows no Buy for an undeliverable purchase', () => {
    (Platform as any).OS = 'ios';
    purchasable();
    runInAction(() => {
      purchaseStore.records['pal-1'] = record('unfulfillable');
    });
    const {queryByTestId} = setup();
    expect(queryByTestId('buy-button')).toBeNull();
  });

  describe('creator update', () => {
    const withUpdate = (changeNote?: string) =>
      runInAction(() => {
        purchaseStore.records['pal-1'] = record('active', {
          pendingUpdate: {
            pal: {...pal, title: 'Story Pal 2'},
            content: {},
            contentVersion: version(4),
            ...(changeNote ? {changeNote} : {}),
          },
        });
        palStore.pals = [localPal];
      });

    it.each([
      [undefined, 'A new version from the creator is available.'],
      [
        'Fixes a typo',
        'A new version from the creator is available: Fixes a typo.',
      ],
    ])('prompts with note %p beside Owned', (note, text) => {
      withUpdate(note);
      const {getByTestId} = setup();
      expect(getByTestId('owned-button')).toBeTruthy();
      expect(getByTestId('pal-update-prompt')).toHaveTextContent(text);
      expect(getByTestId('pal-update-button')).toHaveTextContent('Update');
    });

    it('shows no prompt without a pending update', () => {
      runInAction(() => {
        purchaseStore.records['pal-1'] = record('active');
        palStore.pals = [localPal];
      });
      const {queryByTestId} = setup();
      expect(queryByTestId('pal-update-prompt')).toBeNull();
      expect(queryByTestId('pal-update-button')).toBeNull();
    });

    it('confirms inline and cancels back to the prompt', () => {
      const alert = jest.spyOn(Alert, 'alert');
      withUpdate();
      const {getByTestId, getByText, queryByTestId} = setup();

      fireEvent.press(getByTestId('pal-update-button'));

      expect(
        getByText('This replaces your edits to the parts the creator changed.')
          .props.testID,
      ).toBe('pal-update-confirm-text');
      expect(getByTestId('pal-update-confirm')).toHaveTextContent('Update');
      expect(getByTestId('pal-update-cancel')).toHaveTextContent('Cancel');
      expect(queryByTestId('pal-update-prompt')).toBeNull();

      fireEvent.press(getByTestId('pal-update-cancel'));

      expect(getByTestId('pal-update-prompt')).toBeTruthy();
      expect(purchaseStore.applyUpdate).not.toHaveBeenCalled();
      expect(alert).not.toHaveBeenCalled();
    });

    it('never confirms a newer version than the prompt the user saw', () => {
      withUpdate('First fix');
      const {getByTestId, queryByTestId} = setup();
      fireEvent.press(getByTestId('pal-update-button'));

      act(() =>
        runInAction(() => {
          purchaseStore.records['pal-1'] = record('active', {
            pendingUpdate: {
              pal: {...pal, title: 'Story Pal 3'},
              content: {},
              contentVersion: version(5),
              changeNote: 'Second fix',
            },
          });
        }),
      );
      const confirm = queryByTestId('pal-update-confirm');
      if (confirm) {
        fireEvent.press(confirm);
      }

      expect(purchaseStore.applyUpdate).not.toHaveBeenCalledWith('pal-1', 5);
    });

    it('shows the error alert when the update fails and closes the confirm step', async () => {
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      (purchaseStore.applyUpdate as jest.Mock).mockRejectedValueOnce(
        new Error('Disk full'),
      );
      withUpdate();
      const {getByTestId, queryByTestId} = setup();
      fireEvent.press(getByTestId('pal-update-button'));

      fireEvent.press(getByTestId('pal-update-confirm'));

      await waitFor(() =>
        expect(alert).toHaveBeenCalledWith('Error', 'Disk full'),
      );
      expect(queryByTestId('pal-update-confirm-text')).toBeNull();
      expect(getByTestId('pal-update-prompt')).toBeTruthy();
      alert.mockRestore();
    });

    it('applies the shown version once for a double tap', async () => {
      let finish = () => {};
      (purchaseStore.applyUpdate as jest.Mock).mockImplementationOnce(
        () =>
          new Promise<void>(resolve => {
            finish = resolve;
          }),
      );
      withUpdate();
      const {getByTestId, queryByTestId} = setup();
      fireEvent.press(getByTestId('pal-update-button'));

      fireEvent.press(getByTestId('pal-update-confirm'));
      fireEvent.press(getByTestId('pal-update-confirm'));

      expect(purchaseStore.applyUpdate).toHaveBeenCalledTimes(1);
      expect(purchaseStore.applyUpdate).toHaveBeenCalledWith(
        'pal-1',
        version(4),
      );
      runInAction(() => {
        purchaseStore.records['pal-1'] = record('active');
      });
      finish();
      await waitFor(() =>
        expect(queryByTestId('pal-update-confirm-text')).toBeNull(),
      );
      expect(queryByTestId('pal-update-prompt')).toBeNull();
    });
  });

  it('holds an unverifiable purchase with its code, Restore and no Buy', () => {
    purchasable();
    runInAction(() => {
      purchaseStore.records['pal-1'] = record('held_invalid');
    });
    const {getByTestId, queryByTestId} = setup();
    expect(getByTestId('purchase-held-invalid')).toHaveTextContent(
      "We couldn't unlock this purchase. Contact support with this code.",
    );
    expect(getByTestId('purchase-support-code')).toHaveTextContent(
      'Support code: SUP-7',
    );
    expect(queryByTestId('buy-button')).toBeNull();
    fireEvent.press(getByTestId('purchase-restore-button'));
    expect(purchaseStore.restore).toHaveBeenCalled();
  });

  it('shows the invalid-proof message with Buy back', () => {
    purchasable();
    runInAction(() => {
      setPhase('pal-1', 'invalid');
    });
    const {getByText, getByTestId} = setup();
    expect(getByText("We couldn't verify this purchase.")).toBeTruthy();
    expect(getByTestId('buy-button')).toBeTruthy();
  });

  it('shows only the model step once the purchase is ready', () => {
    runInAction(() => {
      purchaseStore.records['pal-1'] = record('active');
      setPhase('pal-1', 'ready');
      palStore.pals = [localPal];
    });
    const {getByTestId, queryByTestId} = setup();
    expect(getByTestId('purchase-ready')).toBeTruthy();
    expect(getByTestId('model-step-mock')).toBeTruthy();
    expect(queryByTestId('purchase-support-code')).toBeNull();
  });

  describe('owned', () => {
    it.each([
      [
        'a store record',
        () => {
          purchaseStore.records['pal-1'] = record('active');
        },
        pal,
      ],
      ['the listing', () => {}, {...pal, is_owned: true}],
    ])('shows Owned, never Buy, for %s', (_label, mutate, shown) => {
      purchasable();
      runInAction(mutate);
      const {getByTestId, queryByTestId} = setup({pal: shown});
      expect(getByTestId('owned-button')).toHaveTextContent('Install');
      expect(queryByTestId('buy-button')).toBeNull();
    });

    it('labels the owned button Open when the Pal is installed', () => {
      runInAction(() => {
        purchaseStore.records['pal-1'] = record('active');
        palStore.pals = [localPal];
      });
      const {getByTestId} = setup();
      expect(getByTestId('owned-button')).toHaveTextContent('Open');
    });

    it('opens the model step for an installed Pal', async () => {
      runInAction(() => {
        purchaseStore.records['pal-1'] = record('active');
        palStore.pals = [localPal];
      });
      const {getByTestId, findByTestId} = setup();
      fireEvent.press(getByTestId('owned-button'));
      expect(await findByTestId('model-step-mock')).toBeTruthy();
      expect(purchaseStore.installOwned).not.toHaveBeenCalled();
    });

    it('installs a store-owned Pal that is not installed', async () => {
      runInAction(() => {
        purchaseStore.records['pal-1'] = record('active');
      });
      (purchaseStore.installOwned as jest.Mock).mockImplementationOnce(
        async () => {
          runInAction(() => {
            palStore.pals = [localPal];
          });
          return true;
        },
      );
      const {getByTestId, findByTestId} = setup();
      fireEvent.press(getByTestId('owned-button'));
      expect(await findByTestId('model-step-mock')).toBeTruthy();
      expect(purchaseStore.installOwned).toHaveBeenCalledWith(pal);
      expect(palStore.downloadPalsHubPal).not.toHaveBeenCalled();
    });

    it('downloads an account-owned Pal that is not installed', async () => {
      (palStore.downloadPalsHubPal as jest.Mock).mockImplementationOnce(
        async () => {
          palStore.pals = [localPal];
        },
      );
      const owned = {...pal, is_owned: true};
      const {getByTestId, findByTestId} = setup({pal: owned});
      fireEvent.press(getByTestId('owned-button'));
      expect(await findByTestId('model-step-mock')).toBeTruthy();
      expect(palStore.downloadPalsHubPal).toHaveBeenCalledWith(owned);
      expect(purchaseStore.installOwned).not.toHaveBeenCalled();
    });
  });

  it('ends the sheet session on unmount without touching the record', () => {
    runInAction(() => {
      purchaseStore.records['pal-1'] = record('unlocking');
    });
    const {unmount} = setup();
    unmount();
    expect(purchaseStore.endSession).toHaveBeenCalledWith('pal-1');
    expect(purchaseStore.recordFor('pal-1')?.status).toBe('unlocking');
  });

  describe('account', () => {
    it('offers an in-app sign-in when signed out and Buy shows', () => {
      purchasable();
      const onSignInPress = jest.fn();
      const {getByTestId, getByText} = setup({onSignInPress});
      expect(getByText('Already own it? Sign in')).toBeTruthy();
      fireEvent.press(getByTestId('purchase-signin-link'));
      expect(onSignInPress).toHaveBeenCalled();
    });

    it('hides the sign-in line when signed in', () => {
      purchasable();
      (authService as any).isAuthenticated = true;
      const {queryByTestId} = setup({onSignInPress: jest.fn()});
      expect(queryByTestId('purchase-signin-link')).toBeNull();
    });

    const ready = () =>
      runInAction(() => {
        purchaseStore.records['pal-1'] = record('active');
        setPhase('pal-1', 'ready');
      });

    it('prompts once after a signed-out purchase and links through sign-in', () => {
      ready();
      const onSignInPress = jest.fn();
      const {getByTestId, getByText} = setup({onSignInPress});
      expect(
        getByText('Sign in to use it on your other devices too'),
      ).toBeTruthy();
      fireEvent.press(getByTestId('purchase-link-signin'));
      expect(purchaseStore.requestLink).toHaveBeenCalled();
      expect(onSignInPress).toHaveBeenCalled();
    });

    it('can dismiss the prompt', () => {
      ready();
      const {getByTestId, queryByTestId} = setup({onSignInPress: jest.fn()});
      fireEvent.press(getByTestId('purchase-link-dismiss'));
      expect(queryByTestId('purchase-link-prompt')).toBeNull();
      expect(purchaseStore.requestLink).not.toHaveBeenCalled();
    });

    it('never prompts a signed-in user', () => {
      ready();
      (authService as any).isAuthenticated = true;
      const {queryByTestId} = setup({onSignInPress: jest.fn()});
      expect(queryByTestId('purchase-link-prompt')).toBeNull();
    });

    it('does not prompt after a signed-out purchase while account linking is off', () => {
      mockAccountLinkEnabled = false;
      ready();
      const {getByTestId, queryByTestId} = setup({onSignInPress: jest.fn()});
      expect(getByTestId('purchase-ready')).toBeTruthy();
      expect(queryByTestId('purchase-link-prompt')).toBeNull();
    });

    it('keeps the in-app sign-in line while account linking is off', () => {
      mockAccountLinkEnabled = false;
      purchasable();
      const {getByTestId} = setup({onSignInPress: jest.fn()});
      expect(getByTestId('purchase-signin-link')).toBeTruthy();
    });

    it('explains a purchase linked to another account', () => {
      ready();
      runInAction(() => {
        purchaseStore.linkConflict = true;
      });
      const {getByTestId} = setup();
      expect(getByTestId('purchase-link-conflict')).toBeTruthy();
    });
  });

  it('offers Restore when the store account has no entitlement', () => {
    runInAction(() => {
      setPhase('pal-1', 'restore_needed');
    });
    const {getByTestId} = setup();
    expect(getByTestId('purchase-restore-needed')).not.toHaveTextContent(
      /store account/,
    );
    fireEvent.press(getByTestId('purchase-restore-button'));
    expect(purchaseStore.restore).toHaveBeenCalled();
  });

  describe('licence notice', () => {
    const showNotice = (shown: boolean) =>
      runInAction(() => {
        (purchaseStore as any).showsLicenseNotice = shown;
      });

    it('states the licence with both terms links above Buy', () => {
      purchasable();
      showNotice(true);
      const openURL = jest
        .spyOn(Linking, 'openURL')
        .mockResolvedValue(undefined);
      const {getByTestId} = setup();

      expect(getByTestId('purchase-license-notice')).toHaveTextContent(
        "You're buying a license to use this Pal. Terms of Sale · Apple Media Services Terms",
      );
      fireEvent.press(getByTestId('purchase-terms-of-sale-link'));
      fireEvent.press(getByTestId('purchase-apple-terms-link'));
      expect(openURL.mock.calls).toEqual([
        ['https://palshub.ai/legal/terms-of-sale'],
        ['https://www.apple.com/legal/internet-services/itunes/us/terms.html'],
      ]);
      openURL.mockRestore();
    });

    it('shows nothing when the storefront needs no notice', () => {
      purchasable();
      showNotice(false);
      const {queryByTestId, getByTestId} = setup();
      expect(getByTestId('buy-button')).toBeTruthy();
      expect(queryByTestId('purchase-license-notice')).toBeNull();
    });

    it('is not shown once the Pal is owned', () => {
      purchasable();
      showNotice(true);
      runInAction(() => {
        purchaseStore.records['pal-1'] = record('active');
      });
      const {queryByTestId} = setup();
      expect(queryByTestId('purchase-license-notice')).toBeNull();
    });
  });
});
