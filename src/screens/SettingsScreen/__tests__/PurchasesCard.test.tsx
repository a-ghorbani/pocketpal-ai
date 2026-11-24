import React from 'react';
import {AccessibilityInfo, Platform} from 'react-native';
import {runInAction} from 'mobx';

import {render, fireEvent, act} from '../../../../jest/test-utils';

import {PurchasesCard} from '../PurchasesCard';
import {palStore, purchaseStore} from '../../../store';
import {authService} from '../../../services';
import type {LedgerRecord} from '../../../store/PurchaseStore';

let mockAccountLinkEnabled = true;
jest.mock('../../../services/iap/accountLink', () => ({
  get ACCOUNT_LINK_ENABLED() {
    return mockAccountLinkEnabled;
  },
}));

const rec = (
  palId: string,
  status: LedgerRecord['status'],
  overrides: Partial<LedgerRecord> = {},
): LedgerRecord => ({
  palId,
  source: 'store',
  productId: `pal.${palId}`,
  transactionIds: [],
  status,
  title: `Pal ${palId}`,
  supportCode: `SUP-${palId}`,
  updatedAt: 1,
  ...overrides,
});

const setRecords = (...records: LedgerRecord[]) =>
  runInAction(() => {
    records.forEach(record => {
      purchaseStore.records[record.palId] = record;
    });
  });

describe('PurchasesCard', () => {
  beforeEach(() => {
    mockAccountLinkEnabled = true;
    (authService as any).isAuthenticated = false;
    runInAction(() => {
      (purchaseStore as any).reset();
      purchaseStore.availability = 'ready';
    });
  });

  it('lists store-owned Pals with status and support code', () => {
    setRecords(
      rec('a', 'active'),
      rec('b', 'unfulfillable'),
      rec('c', 'granted'),
      rec('d', 'pending_payment'),
      rec('e', 'removed'),
    );
    const {getByTestId, queryByTestId, getByText} = render(
      <PurchasesCard onSignInPress={jest.fn()} />,
    );

    expect(getByTestId('purchases-card')).toBeTruthy();
    expect(getByText('Purchased · Support code: SUP-a')).toBeTruthy();
    expect(
      getByText(
        'This Pal is no longer available. You can ask Apple for a refund.\nSupport code: SUP-b',
      ),
    ).toBeTruthy();
    expect(getByTestId('purchase-row-c')).toBeTruthy();
    expect(queryByTestId('purchase-row-d')).toBeNull();
    expect(queryByTestId('purchase-row-e')).toBeNull();
  });

  it('never lists account-only Pals', () => {
    palStore.userLibrary = [{id: 'library-only'} as any];
    const {queryByTestId} = render(<PurchasesCard onSignInPress={jest.fn()} />);
    expect(queryByTestId('purchase-row-library-only')).toBeNull();
    palStore.userLibrary = [];
  });

  it('restores purchases', () => {
    const {getByTestId} = render(<PurchasesCard onSignInPress={jest.fn()} />);
    fireEvent.press(getByTestId('settings-restore-purchases'));
    expect(purchaseStore.restore).toHaveBeenCalled();
  });

  it('signs in and links when signed out', () => {
    setRecords(rec('a', 'active'));
    runInAction(() => {
      (purchaseStore as any).needsLink = true;
    });
    const onSignInPress = jest.fn();
    const {getByTestId} = render(
      <PurchasesCard onSignInPress={onSignInPress} />,
    );
    fireEvent.press(getByTestId('settings-link-purchases'));
    expect(purchaseStore.requestLink).toHaveBeenCalled();
    expect(onSignInPress).toHaveBeenCalled();
    expect(purchaseStore.link).not.toHaveBeenCalled();
  });

  it('links directly when signed in', () => {
    (authService as any).isAuthenticated = true;
    setRecords(rec('a', 'active'));
    runInAction(() => {
      (purchaseStore as any).needsLink = true;
    });
    const onSignInPress = jest.fn();
    const {getByTestId} = render(
      <PurchasesCard onSignInPress={onSignInPress} />,
    );
    fireEvent.press(getByTestId('settings-link-purchases'));
    expect(purchaseStore.link).toHaveBeenCalled();
    expect(onSignInPress).not.toHaveBeenCalled();
  });

  it('hides the link row while account linking is off', () => {
    mockAccountLinkEnabled = false;
    setRecords(rec('a', 'active'));
    runInAction(() => {
      (purchaseStore as any).needsLink = true;
    });
    const {getByTestId, queryByTestId} = render(
      <PurchasesCard onSignInPress={jest.fn()} />,
    );
    expect(getByTestId('settings-restore-purchases')).toBeTruthy();
    expect(queryByTestId('settings-link-purchases')).toBeNull();
  });

  it('hides the link row when everything is linked', () => {
    (authService as any).isAuthenticated = true;
    setRecords(rec('a', 'active', {linkedUserId: 'user-1'}));
    const {queryByTestId} = render(<PurchasesCard onSignInPress={jest.fn()} />);
    expect(queryByTestId('settings-link-purchases')).toBeNull();
  });

  it('is hidden when billing is unavailable and nothing was bought', () => {
    runInAction(() => {
      purchaseStore.availability = 'unavailable';
    });
    const {queryByTestId} = render(<PurchasesCard onSignInPress={jest.fn()} />);
    expect(queryByTestId('purchases-card')).toBeNull();
  });

  it('still lists purchases without a restore button when billing is unavailable', () => {
    runInAction(() => {
      purchaseStore.availability = 'unavailable';
    });
    setRecords(rec('a', 'active'));
    const {getByTestId, queryByTestId} = render(
      <PurchasesCard onSignInPress={jest.fn()} />,
    );
    expect(getByTestId('purchase-row-a')).toBeTruthy();
    expect(queryByTestId('settings-restore-purchases')).toBeNull();
  });

  it('lists a held purchase with its code', () => {
    setRecords(rec('h', 'held_invalid'));
    const {getByText} = render(<PurchasesCard onSignInPress={jest.fn()} />);
    expect(
      getByText(
        "We couldn't unlock this purchase. Contact support with this code.\nSupport code: SUP-h",
      ),
    ).toBeTruthy();
  });

  describe('undeliverable copy', () => {
    const originalOS = Platform.OS;
    afterEach(() => {
      (Platform as any).OS = originalOS;
    });

    it.each([
      [
        'ios',
        false,
        'This Pal is no longer available. You can ask Apple for a refund.\nSupport code: SUP-b',
      ],
      [
        'ios',
        true,
        'This Pal is no longer available. You can ask Apple for a refund.\nSupport code: SUP-b',
      ],
      [
        'android',
        false,
        "This purchase couldn't be completed. Google will refund you.\nSupport code: SUP-b",
      ],
      [
        'android',
        true,
        'This Pal was withdrawn. Contact support for a refund.\nSupport code: SUP-b',
      ],
    ])(
      'uses the %s wording (withdrawn after delivery: %p)',
      (os, delivered, copy) => {
        (Platform as any).OS = os;
        setRecords(
          rec(
            'b',
            'unfulfillable',
            delivered ? {withdrawnAfterDelivery: true} : {},
          ),
        );
        const {getByText} = render(<PurchasesCard onSignInPress={jest.fn()} />);
        expect(getByText(copy)).toBeTruthy();
      },
    );
  });
});

describe('PurchasesCard in a non-store build', () => {
  beforeEach(() => {
    (global as any).__PLUS_STORE_GATE__ = false;
    (authService as any).isAuthenticated = false;
    runInAction(() => {
      (purchaseStore as any).reset();
      purchaseStore.availability = 'ready';
    });
  });

  afterEach(() => {
    (global as any).__PLUS_STORE_GATE__ = true;
  });

  it('hides Settings › Purchases and its Restore button when billing is ready', () => {
    const {queryByTestId} = render(<PurchasesCard onSignInPress={jest.fn()} />);
    expect(queryByTestId('purchases-card')).toBeNull();
    expect(queryByTestId('settings-restore-purchases')).toBeNull();
  });

  it('hides Settings › Purchases with store-owned records while billing is unavailable', () => {
    runInAction(() => {
      purchaseStore.availability = 'unavailable';
      (purchaseStore as any).needsLink = true;
      purchaseStore.linkConflict = true;
    });
    setRecords(rec('a', 'active'), rec('b', 'held_invalid'));
    const {queryByTestId} = render(<PurchasesCard onSignInPress={jest.fn()} />);
    expect(queryByTestId('purchases-card')).toBeNull();
    expect(queryByTestId('purchase-row-a')).toBeNull();
    expect(queryByTestId('settings-link-purchases')).toBeNull();
  });
});

describe('PurchasesCard Restore shows the Plus outcome', () => {
  const UNLOCKED = 'Plus is unlocked on this device.';
  const NONE = 'No Plus purchase found.';
  const FAILED = "Couldn't reach the store. Try again.";
  const PENDING = 'Waiting for the store to confirm your payment.';
  const ALL = [UNLOCKED, NONE, FAILED, PENDING];

  const flush = () => new Promise(resolve => setTimeout(resolve, 0));

  type Settle = {
    plusAfter: boolean;
    pendingAfter?: boolean;
    result?: {queryOk: boolean};
    error?: Error;
  };

  const holdRestore = (settle: Settle) => {
    let release!: () => void;
    (purchaseStore.restore as jest.Mock).mockImplementationOnce(async () => {
      runInAction(() => {
        purchaseStore.isRestoring = true;
      });
      await new Promise<void>(resolve => {
        release = resolve;
      });
      runInAction(() => {
        purchaseStore.plusUnlocked = settle.plusAfter;
        purchaseStore.plusPending = settle.pendingAfter ?? false;
        purchaseStore.isRestoring = false;
      });
      if (settle.error) {
        throw settle.error;
      }
      return settle.result ?? {queryOk: true};
    });
    return () =>
      act(async () => {
        release();
        await flush();
      });
  };

  const shownOutcomes = (r: ReturnType<typeof render>) =>
    ALL.filter(text => r.queryByText(text) !== null);

  beforeEach(() => {
    (authService as any).isAuthenticated = false;
    runInAction(() => {
      (purchaseStore as any).reset();
      purchaseStore.availability = 'ready';
    });
  });

  const cases: [string, boolean, Settle, string][] = [
    ['Plus unlocks', false, {plusAfter: true}, UNLOCKED],
    ['Plus was already unlocked', true, {plusAfter: true}, UNLOCKED],
    ['no Plus purchase, already locked', false, {plusAfter: false}, NONE],
    ['no Plus purchase, Plus relocks', true, {plusAfter: false}, NONE],
    [
      'a Plus payment is pending',
      false,
      {plusAfter: false, pendingAfter: true},
      PENDING,
    ],
    [
      'the store query fails',
      false,
      {plusAfter: false, result: {queryOk: false}},
      FAILED,
    ],
    [
      'restore throws',
      false,
      {plusAfter: false, error: new Error('boom')},
      FAILED,
    ],
  ];

  describe.each([false, true])('with Pal rows: %p', withPalRows => {
    it.each(cases)(
      'shows exactly one line when %s',
      async (_name, plusBefore, settle, expected) => {
        runInAction(() => {
          purchaseStore.plusUnlocked = plusBefore;
        });
        if (withPalRows) {
          setRecords(rec('a', 'active'));
        }
        const release = holdRestore(settle);
        const r = render(<PurchasesCard onSignInPress={jest.fn()} />);
        expect(shownOutcomes(r)).toEqual([]);

        fireEvent.press(r.getByTestId('settings-restore-purchases'));
        await act(flush);
        expect(shownOutcomes(r)).toEqual([]);

        await release();

        expect(shownOutcomes(r)).toEqual([expected]);
        if (withPalRows) {
          expect(r.getByText('Purchased · Support code: SUP-a')).toBeTruthy();
        }
      },
    );
  });

  it.each([
    [
      'Plus stays unlocked although the store query fails',
      true,
      {plusAfter: true, result: {queryOk: false}},
      UNLOCKED,
    ],
    [
      'a Plus payment is pending and the store query fails',
      false,
      {plusAfter: false, pendingAfter: true, result: {queryOk: false}},
      FAILED,
    ],
  ] as [string, boolean, Settle, string][])(
    'follows the Plus screen order when %s',
    async (_name, plusBefore, settle, expected) => {
      runInAction(() => {
        purchaseStore.plusUnlocked = plusBefore;
      });
      const release = holdRestore(settle);
      const r = render(<PurchasesCard onSignInPress={jest.fn()} />);

      fireEvent.press(r.getByTestId('settings-restore-purchases'));
      await release();

      expect(shownOutcomes(r)).toEqual([expected]);
    },
  );

  it('does not leave a rejected restore unhandled', async () => {
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    try {
      (purchaseStore.restore as jest.Mock).mockRejectedValueOnce(
        new Error('boom'),
      );
      const r = render(<PurchasesCard onSignInPress={jest.fn()} />);
      fireEvent.press(r.getByTestId('settings-restore-purchases'));
      await act(async () => {
        await flush();
        await flush();
      });
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('clears the previous line while the next restore runs', async () => {
    (purchaseStore.restore as jest.Mock).mockResolvedValueOnce({
      queryOk: false,
    });
    const release = holdRestore({plusAfter: false});
    const r = render(<PurchasesCard onSignInPress={jest.fn()} />);

    fireEvent.press(r.getByTestId('settings-restore-purchases'));
    await act(flush);
    expect(shownOutcomes(r)).toEqual([FAILED]);

    fireEvent.press(r.getByTestId('settings-restore-purchases'));
    await act(flush);
    expect(shownOutcomes(r)).toEqual([]);

    await release();
    expect(shownOutcomes(r)).toEqual([NONE]);
  });

  describe('screen readers', () => {
    const originalOS = Platform.OS;
    let announceSpy: jest.SpyInstance;

    beforeEach(() => {
      announceSpy = jest
        .spyOn(AccessibilityInfo, 'announceForAccessibility')
        .mockImplementation(() => {});
    });

    afterEach(() => {
      (Platform as any).OS = originalOS;
      announceSpy.mockRestore();
    });

    it.each([
      ['ios', [[NONE]]],
      ['android', []],
    ])(
      '%s announces the outcome as the Plus screen does',
      async (os, calls) => {
        (Platform as any).OS = os;
        const r = render(<PurchasesCard onSignInPress={jest.fn()} />);

        fireEvent.press(r.getByTestId('settings-restore-purchases'));
        await act(flush);

        expect(r.getByText(NONE).props.accessibilityLiveRegion).toBe('polite');
        expect(announceSpy.mock.calls).toEqual(calls);
      },
    );
  });
});
