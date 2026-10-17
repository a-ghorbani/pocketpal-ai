import {Platform} from 'react-native';
import {runInAction} from 'mobx';

import {
  PAL_ID,
  PRODUCT,
  createHarness,
  flush,
  hubPal,
  localPal,
  record,
  result,
  stopAll,
  tx,
  version,
} from './purchaseTestHarness';

let mockAccountLinkEnabled = true;
jest.mock('../../services/iap/accountLink', () => ({
  get ACCOUNT_LINK_ENABLED() {
    return mockAccountLinkEnabled;
  },
}));

jest.mock('../PalStore', () => ({
  palStore: {
    ready: Promise.resolve(),
    pals: [],
    userLibrary: [],
    cachedPalsHubPals: [],
  },
}));

const signIn = (h: ReturnType<typeof createHarness>, id = 'user-1') =>
  runInAction(() => {
    h.auth.user = {id};
    h.auth.isAuthenticated = true;
  });

describe('PurchaseStore link and restore', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    mockAccountLinkEnabled = true;
    (Platform as any).OS = 'ios';
  });

  afterEach(stopAll);

  afterAll(() => {
    (Platform as any).OS = originalOS;
  });

  describe('link', () => {
    it('links after a requested sign-in, exactly once', async () => {
      const h = createHarness({records: [record('active')]});
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [tx()],
      });
      await h.purchases.load();

      h.purchases.requestLink();
      signIn(h);
      await flush();
      await flush();

      expect(h.api.link).toHaveBeenCalledTimes(1);
      expect(h.api.link).toHaveBeenCalledWith('ios', [
        {platform: 'ios', jws: 'jws-1'},
      ]);
      expect(h.purchases.recordFor(PAL_ID)?.linkedUserId).toBe('user-1');
      expect(h.purchases.linkPending).toBe(false);

      runInAction(() => {
        h.auth.isAuthenticated = false;
      });
      signIn(h);
      await flush();
      expect(h.api.link).toHaveBeenCalledTimes(1);
    });

    it('never links after a cancelled sign-in', async () => {
      const h = createHarness({records: [record('active')]});
      h.purchases.requestLink();
      h.purchases.cancelLinkRequest();
      signIn(h);
      await flush();
      expect(h.api.link).not.toHaveBeenCalled();
    });

    it('keeps the Pal and reports a conflict on 409', async () => {
      const h = createHarness({records: [record('active')], signedIn: true});
      h.palStore.pals.push(localPal());
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [tx()],
      });
      h.api.link.mockResolvedValueOnce('conflict');

      await expect(h.purchases.link()).resolves.toBe('conflict');

      expect(h.purchases.linkConflict).toBe(true);
      expect(h.purchases.recordFor(PAL_ID)?.linkedUserId).toBeUndefined();
      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('active');
      expect(h.palStore.deletePal).not.toHaveBeenCalled();
    });

    it('sends only records not yet linked to this user', async () => {
      const h = createHarness({
        records: [
          record('active', {linkedUserId: 'user-1'}),
          record('active', {palId: 'pal-2', productId: 'pal.2'}),
        ],
        signedIn: true,
      });
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [
          tx(),
          tx({
            productId: 'pal.2',
            transactionId: 'tx-2',
            proof: {platform: 'ios', jws: 'jws-2'},
          }),
        ],
      });

      await h.purchases.link();

      expect(h.api.link).toHaveBeenCalledWith('ios', [
        {platform: 'ios', jws: 'jws-2'},
      ]);
    });

    it('offers linking again for a different account', async () => {
      const h = createHarness({
        records: [record('active', {linkedUserId: 'user-1'})],
      });
      await h.purchases.load();
      signIn(h, 'user-2');
      expect(h.purchases.needsLink).toBe(true);
      signIn(h, 'user-1');
      expect(h.purchases.needsLink).toBe(false);
    });

    describe('needsLink', () => {
      const unlinked = record('active', {palId: 'A', productId: 'pal.a'});
      const linked = record('active', {
        palId: 'B',
        productId: 'pal.b',
        linkedUserId: 'u1',
      });

      it.each([
        ['an unlinked and a linked purchase', [unlinked, linked], true],
        ['only a linked purchase', [linked], false],
      ])('signed out with %s: %p', async (_name, records, expected) => {
        const h = createHarness({records});
        await h.purchases.load();
        expect(h.purchases.needsLink).toBe(expected);
      });

      it.each([
        ['u1', false],
        ['u2', true],
      ])(
        'signed in as %s with only a u1 purchase: %p',
        async (id, expected) => {
          const h = createHarness({records: [linked]});
          await h.purchases.load();
          signIn(h, id);
          expect(h.purchases.needsLink).toBe(expected);
        },
      );
    });

    it('does nothing while signed out', async () => {
      const h = createHarness({records: [record('active')]});
      await expect(h.purchases.link()).resolves.toBeUndefined();
      expect(h.api.link).not.toHaveBeenCalled();
    });

    it('links silently after a signed-in purchase, with the binding passed', async () => {
      const h = createHarness({signedIn: true});
      h.binding.getBinding.mockResolvedValueOnce({appAccountToken: 'uuid'});
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [tx()],
      });
      runInAction(() => {
        h.purchases.availability = 'ready';
        h.purchases.products.set(hubPal().store_product_id!, {
          productId: hubPal().store_product_id!,
          displayPrice: '$4.99',
        });
      });

      await h.purchases.buy(hubPal());
      await h.purchases.drainQueue();
      await flush();

      expect(h.store.purchase).toHaveBeenCalledWith(hubPal().store_product_id, {
        appAccountToken: 'uuid',
      });
      expect(h.api.link).toHaveBeenCalledTimes(1);
      expect(h.purchases.linkPending).toBe(false);
    });
  });

  describe('with account linking off', () => {
    beforeEach(() => {
      mockAccountLinkEnabled = false;
    });

    it('ignores a link request and makes no call on sign-in', async () => {
      const h = createHarness({records: [record('active')]});
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [tx()],
      });
      await h.purchases.load();

      h.purchases.requestLink();
      expect(h.purchases.linkPending).toBe(false);
      signIn(h);
      await flush();
      await flush();

      expect(h.api.link).not.toHaveBeenCalled();
    });

    it('returns from link without a request when signed in', async () => {
      const h = createHarness({records: [record('active')], signedIn: true});
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [tx()],
      });

      await expect(h.purchases.link()).resolves.toBeUndefined();

      expect(h.api.link).not.toHaveBeenCalled();
      expect(h.store.currentEntitlements).not.toHaveBeenCalled();
    });

    it('makes no link call after a signed-in purchase', async () => {
      const h = createHarness({signedIn: true});
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [tx()],
      });
      runInAction(() => {
        h.purchases.availability = 'ready';
        h.purchases.products.set(hubPal().store_product_id!, {
          productId: hubPal().store_product_id!,
          displayPrice: '$4.99',
        });
      });

      await h.purchases.buy(hubPal());
      await h.purchases.drainQueue();
      await flush();

      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('active');
      expect(h.api.link).not.toHaveBeenCalled();
    });
  });

  describe('owned Pal that is not installed', () => {
    it('reinstalls from current entitlements without a store sync', async () => {
      const h = createHarness({records: [record('active')]});
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [tx({unfinished: false})],
      });

      await expect(h.purchases.installOwned(hubPal())).resolves.toBe(true);
      await h.purchases.drainQueue();

      expect(h.store.sync).not.toHaveBeenCalled();
      expect(h.store.purchase).not.toHaveBeenCalled();
      expect(h.palStore.installOwnedPal).toHaveBeenCalledTimes(1);
      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('active');
    });

    it('offers Restore when the store account has no entitlement', async () => {
      const h = createHarness({records: [record('active')]});
      await h.purchases.load();

      await expect(h.purchases.installOwned(hubPal())).resolves.toBe(false);

      expect(h.purchases.flowFor(PAL_ID)).toBe('restore_needed');
      expect(h.palStore.deletePal).not.toHaveBeenCalled();

      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [tx({unfinished: false})],
      });
      await h.purchases.restore();
      await h.purchases.drainQueue();
      expect(h.purchases.flowFor(PAL_ID)).toBe('ready');
    });

    it('offers Restore for an already-owned purchase with no local record', async () => {
      const h = createHarness();
      await h.purchases.installOwned(hubPal());
      expect(h.purchases.flowFor(PAL_ID)).toBe('restore_needed');
    });
  });

  describe('restore', () => {
    it('syncs, then installs every entitlement', async () => {
      const h = createHarness();
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [tx({unfinished: false})],
      });

      await h.purchases.restore();
      await h.purchases.drainQueue();

      expect(h.log[0]).toBe('sync');
      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('active');
      expect(h.purchases.isRestoring).toBe(false);
    });

    it('drops a stale iOS pending record at once', async () => {
      const h = createHarness({records: [record('pending_payment')]});
      await h.purchases.restore();
      expect(h.purchases.recordFor(PAL_ID)).toBeUndefined();
      runInAction(() => {
        h.purchases.availability = 'ready';
        h.purchases.products.set(hubPal().store_product_id!, {
          productId: hubPal().store_product_id!,
          displayPrice: '$4.99',
        });
      });
      expect(h.purchases.canBuy(hubPal())).toBe(true);
    });

    it('Android: judges stale pending by its own query, not a later one', async () => {
      (Platform as any).OS = 'android';
      const h = createHarness({
        records: [
          record('pending_payment', {palId: 'P2', productId: 'pal.p2'}),
        ],
      });
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [
          tx({
            unfinished: false,
            proof: {
              platform: 'android',
              productId: PRODUCT,
              purchaseToken: 'tok',
            },
          }),
        ],
      });
      h.api.verify.mockImplementation(async () => {
        h.store.currentEntitlements.mockResolvedValue({
          ok: false,
          transactions: [],
        });
        return [result('active')];
      });

      await h.purchases.restore();

      expect(h.api.verify).toHaveBeenCalled();
      expect(h.purchases.recordFor('P2')).toBeUndefined();
    });

    describe('held purchase', () => {
      const held = () => record('held_invalid', {supportCode: 'SUP-H'});
      const failQuery = (h: ReturnType<typeof createHarness>) =>
        h.store.currentEntitlements.mockResolvedValue({
          ok: false,
          transactions: [],
        });

      it('Android: clears it when a successful query no longer lists the product', async () => {
        (Platform as any).OS = 'android';
        const h = createHarness({records: [held()]});

        await h.purchases.restore();

        expect(h.purchases.recordFor(PAL_ID)).toBeUndefined();
      });

      it('Android: keeps it when the store query failed', async () => {
        (Platform as any).OS = 'android';
        const h = createHarness({records: [held()]});
        failQuery(h);

        await h.purchases.restore();

        expect(h.purchases.recordFor(PAL_ID)?.status).toBe('held_invalid');
      });

      it('Android: keeps a hold written after the query started', async () => {
        (Platform as any).OS = 'android';
        const h = createHarness({records: [held()]});
        h.api.verify.mockResolvedValueOnce([
          result('invalid', {palId: 'P2', supportCode: 'SUP-2'}),
        ]);
        h.store.currentEntitlements.mockImplementation(async () => {
          await h.purchases.processTransaction(
            tx({
              productId: 'pal.p2',
              transactionId: 'tx-2',
              unfinished: false,
              proof: {
                platform: 'android',
                productId: 'pal.p2',
                purchaseToken: 'tok-2',
              },
            }),
            {},
          );
          return {ok: true, transactions: []};
        });

        await h.purchases.restore();

        expect(h.purchases.recordFor('P2')?.status).toBe('held_invalid');
        expect(h.purchases.recordFor(PAL_ID)).toBeUndefined();
      });

      it('iOS: keeps it after a successful query without the product', async () => {
        const h = createHarness({records: [held()]});

        await h.purchases.restore();

        expect(h.purchases.recordFor(PAL_ID)?.status).toBe('held_invalid');
      });

      it('iOS: keeps it when the store query failed', async () => {
        const h = createHarness({records: [held()]});
        failQuery(h);

        await h.purchases.restore();

        expect(h.purchases.recordFor(PAL_ID)?.status).toBe('held_invalid');
      });
    });

    it('Android: acknowledges a restored held purchase on the next recovery after a failed acknowledgement', async () => {
      (Platform as any).OS = 'android';
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const heldTx = tx({
        proof: {platform: 'android', productId: PRODUCT, purchaseToken: 'tok'},
      });
      const h = createHarness({records: [record('unlocking')]});
      h.api.verify.mockResolvedValueOnce([
        result('invalid', {supportCode: 'SUP-H'}),
      ]);
      await h.purchases.processTransaction(heldTx, {});
      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('held_invalid');
      expect(h.purchases.invalidTxIds.has('tx-1')).toBe(true);
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [heldTx],
      });
      h.store.finish.mockRejectedValueOnce(new Error('billing'));

      await h.purchases.restore();
      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('active');
      expect(h.store.finish).toHaveBeenCalledTimes(1);

      await h.purchases.recover();

      expect(h.store.finish).toHaveBeenCalledTimes(2);
      warn.mockRestore();
    });

    it('never replaces the grant of a record still waiting to install', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const h = createHarness({records: [record('granted')]});
      h.palStore.installOwnedPal.mockRejectedValue(new Error('db'));
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [tx({unfinished: false})],
      });
      const seen: {status?: string; installed: boolean}[] = [];
      h.api.verify.mockImplementation(async () => {
        seen.push({
          status: h.purchases.recordFor(PAL_ID)?.status,
          installed: h.purchases.localPalFor(PAL_ID) !== undefined,
        });
        return [
          result('active', {
            pal: hubPal({title: 'Other', updated_at: version(9)}),
          }),
        ];
      });

      await h.purchases.restore();

      expect(h.palStore.installOwnedPal).toHaveBeenCalled();
      expect(seen).toEqual([{status: 'granted', installed: false}]);
      const rec = h.purchases.recordFor(PAL_ID);
      expect(rec?.status).toBe('granted');
      expect(rec?.grant?.pal.title).toBe('Story Pal');
      expect(rec?.grant?.contentVersion).toBe(version(3));
      warn.mockRestore();
    });

    it('still restores when the store sync fails', async () => {
      const h = createHarness();
      h.store.sync.mockRejectedValueOnce(new Error('cancelled'));
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [tx({unfinished: false})],
      });

      await h.purchases.restore();
      await h.purchases.drainQueue();

      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('active');
    });
  });
});
