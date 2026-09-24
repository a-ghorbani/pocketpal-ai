import {Platform} from 'react-native';
import {runInAction} from 'mobx';

import {
  PAL_ID,
  createHarness,
  flush,
  hubPal,
  localPal,
  record,
  stopAll,
  tx,
} from './purchaseTestHarness';

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
    (Platform as any).OS = 'ios';
  });

  afterEach(stopAll);

  afterAll(() => {
    (Platform as any).OS = originalOS;
  });

  describe('link', () => {
    it('links after a requested sign-in, exactly once', async () => {
      const h = createHarness({records: [record('active')]});
      h.store.currentEntitlements.mockResolvedValue([tx()]);
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
      h.store.currentEntitlements.mockResolvedValue([tx()]);
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
      h.store.currentEntitlements.mockResolvedValue([
        tx(),
        tx({
          productId: 'pal.2',
          transactionId: 'tx-2',
          proof: {platform: 'ios', jws: 'jws-2'},
        }),
      ]);

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

    it('does nothing while signed out', async () => {
      const h = createHarness({records: [record('active')]});
      await expect(h.purchases.link()).resolves.toBeUndefined();
      expect(h.api.link).not.toHaveBeenCalled();
    });

    it('links silently after a signed-in purchase, with the binding passed', async () => {
      const h = createHarness({signedIn: true});
      h.binding.getBinding.mockResolvedValueOnce({appAccountToken: 'uuid'});
      h.store.currentEntitlements.mockResolvedValue([tx()]);
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

  describe('owned Pal that is not installed', () => {
    it('reinstalls from current entitlements without a store sync', async () => {
      const h = createHarness({records: [record('active')]});
      h.store.currentEntitlements.mockResolvedValue([tx({unfinished: false})]);

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

      h.store.currentEntitlements.mockResolvedValue([tx({unfinished: false})]);
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
      h.store.currentEntitlements.mockResolvedValue([tx({unfinished: false})]);

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

    it('still restores when the store sync fails', async () => {
      const h = createHarness();
      h.store.sync.mockRejectedValueOnce(new Error('cancelled'));
      h.store.currentEntitlements.mockResolvedValue([tx({unfinished: false})]);

      await h.purchases.restore();
      await h.purchases.drainQueue();

      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('active');
    });
  });
});
