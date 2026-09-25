import React from 'react';
import {Platform} from 'react-native';
import {runInAction} from 'mobx';

import {render, fireEvent, waitFor} from '../../../../../jest/test-utils';
import {mockPremiumPalsHubPal} from '../../../../../jest/fixtures/pals';

import {PalPurchaseFooter} from '../PalPurchaseFooter';
import {palStore, purchaseStore} from '../../../../store';
import {authService} from '../../../../services';
import type {LedgerRecord} from '../../../../store/PurchaseStore';
import type {Pal} from '../../../../types/pal';

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
    (authService as any).isAuthenticated = false;
    runInAction(() => {
      (purchaseStore as any).reset();
      palStore.pals = [];
    });
  });

  afterEach(() => {
    (Platform as any).OS = originalOS;
  });

  it('renders name, the store-priced Buy button and the one-time line in order', () => {
    purchasable();
    const {getByTestId, getByText, toJSON} = setup();

    expect(getByTestId('buy-button')).toBeTruthy();
    expect(getByText('Get for 4,99 €')).toBeTruthy();
    const text = JSON.stringify(toJSON());
    const name = text.indexOf('Story Pal');
    const button = text.indexOf('Get for 4,99 €');
    const line = text.indexOf(
      'One-time purchase. Yours to keep. No account needed.',
    );
    expect(name).toBeLessThan(button);
    expect(button).toBeLessThan(line);
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
    const {getByTestId} = setup();
    expect(getByTestId('buy-button').props.accessibilityState?.disabled).toBe(
      true,
    );
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
    expect(
      getByText("Payment pending — we'll unlock it as soon as it clears"),
    ).toBeTruthy();
    expect(queryByTestId('buy-button')).toBeNull();
  });

  it('shows unlocking with a Retry that retries at once', () => {
    runInAction(() => {
      purchaseStore.records['pal-1'] = record('unlocking');
    });
    const {getByText, getByTestId} = setup();
    expect(getByText('Paid — unlocking…')).toBeTruthy();
    fireEvent.press(getByTestId('purchase-retry-button'));
    expect(purchaseStore.retry).toHaveBeenCalledWith('pal-1');
  });

  it('shows progress while installing a grant', () => {
    runInAction(() => {
      purchaseStore.records['pal-1'] = record('granted');
    });
    const {getByTestId} = setup();
    expect(getByTestId('purchase-installing')).toBeTruthy();
  });

  it.each([
    ['ios', "We couldn't deliver this. Support has been notified — ref SUP-7"],
    [
      'android',
      "We couldn't deliver this, so your purchase has been refunded — ref SUP-7",
    ],
  ])('shows the %s undeliverable copy', (os, copy) => {
    (Platform as any).OS = os;
    runInAction(() => {
      purchaseStore.records['pal-1'] = record('unfulfillable');
    });
    const {getByText} = setup();
    expect(getByText(copy)).toBeTruthy();
  });

  it('shows the support reference for an undeliverable purchase and no Buy', () => {
    (Platform as any).OS = 'ios';
    purchasable();
    runInAction(() => {
      purchaseStore.records['pal-1'] = record('unfulfillable');
    });
    const {getByText, queryByTestId} = setup();
    expect(
      getByText(
        "We couldn't deliver this. Support has been notified — ref SUP-7",
      ),
    ).toBeTruthy();
    expect(queryByTestId('buy-button')).toBeNull();
  });

  it('shows the invalid-proof message with Buy back', () => {
    purchasable();
    runInAction(() => {
      setPhase('pal-1', 'invalid');
    });
    const {getByText, getByTestId} = setup();
    expect(
      getByText(
        "We couldn't verify this purchase. Try Restore purchases, or contact support.",
      ),
    ).toBeTruthy();
    expect(getByTestId('buy-button')).toBeTruthy();
  });

  it.each([
    ['ios', 'App Store'],
    ['android', 'Google Play'],
  ])('shows the %s confirmation, support code and model step', (os, store) => {
    (Platform as any).OS = os;
    runInAction(() => {
      purchaseStore.records['pal-1'] = record('active');
      setPhase('pal-1', 'ready');
      palStore.pals = [localPal];
    });
    const {getByText, getByTestId} = setup();
    expect(
      getByText(
        `Story Pal is yours to keep. It's tied to your ${store} account — reinstall and tap Restore purchases to get it back.`,
      ),
    ).toBeTruthy();
    expect(getByText('Support code: SUP-7')).toBeTruthy();
    expect(getByTestId('model-step-mock')).toBeTruthy();
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
      expect(getByTestId('owned-button')).toBeTruthy();
      expect(queryByTestId('buy-button')).toBeNull();
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
    fireEvent.press(getByTestId('purchase-restore-button'));
    expect(purchaseStore.restore).toHaveBeenCalled();
  });
});
