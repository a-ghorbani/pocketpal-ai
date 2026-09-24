import React from 'react';
import {runInAction} from 'mobx';

import {render, fireEvent} from '../../../../jest/test-utils';

import {PurchasesCard} from '../PurchasesCard';
import {palStore, purchaseStore} from '../../../store';
import {authService} from '../../../services';
import type {LedgerRecord} from '../../../store/PurchaseStore';

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
    expect(getByText('Owned · Support code: SUP-a')).toBeTruthy();
    expect(
      getByText(
        "We couldn't deliver this. Support has been notified — ref SUP-b",
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
});
