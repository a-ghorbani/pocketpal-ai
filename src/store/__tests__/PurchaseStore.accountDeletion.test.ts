import {runInAction} from 'mobx';

import {
  createHarness,
  hubPal,
  localPal,
  record,
  stopAll,
} from './purchaseTestHarness';

jest.mock('../PalStore', () => ({
  palStore: {
    ready: Promise.resolve(),
    pals: [],
    userLibrary: [],
    cachedPalsHubPals: [],
  },
}));

const deletedAccountHarness = async () => {
  const h = createHarness({
    signedIn: true,
    records: [record('active', {palId: 'P1', productId: 'pal.p1'})],
  });
  await h.purchases.load();
  h.palStore.userLibrary.push(hubPal({id: 'P2'}), hubPal({id: 'P3'}));
  h.palStore.pals.push(localPal('P3'));
  const ledgerBefore = h.storage.ledger();
  const palsBefore = [...h.palStore.pals];
  return {h, ledgerBefore, palsBefore};
};

const clearAccountPals = (h: ReturnType<typeof createHarness>) =>
  h.palStore.userLibrary.splice(0);

describe('PurchaseStore after account deletion', () => {
  afterEach(() => {
    stopAll();
  });

  it('ends library-only ownership of an uninstalled Pal and keeps ledger ownership', async () => {
    const {h, ledgerBefore} = await deletedAccountHarness();
    expect(h.purchases.isOwned('P2')).toBe(true);

    clearAccountPals(h);

    expect(h.purchases.isOwned('P1')).toBe(true);
    expect(h.purchases.isOwned('P2')).toBe(false);
    expect(h.storage.ledger()).toEqual(ledgerBefore);
    expect(h.storage.setItem).not.toHaveBeenCalled();
  });

  it('does not hand the deleted library to the next account', async () => {
    const {h} = await deletedAccountHarness();
    clearAccountPals(h);

    runInAction(() => {
      h.auth.user = {id: 'user-2'};
    });

    expect(h.purchases.isOwned('P2')).toBe(false);
  });

  it('keeps an installed paid Pal owned as a legacy install', async () => {
    const {h, palsBefore} = await deletedAccountHarness();

    clearAccountPals(h);

    expect(h.purchases.isLegacyInstall('P3')).toBe(true);
    expect(h.purchases.isOwned('P3')).toBe(true);
    expect(h.palStore.pals).toEqual(palsBefore);
  });
});
