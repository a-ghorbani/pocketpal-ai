import {Platform} from 'react-native';
import {runInAction} from 'mobx';

import {LEDGER_KEY, PurchaseStore} from '../PurchaseStore';
import {
  PAL_ID,
  PRODUCT,
  MemoryStorage,
  createHarness,
  flush,
  hubPal,
  localPal,
  record,
  result,
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

const originalOS = Platform.OS;
const setOS = (os: 'ios' | 'android') => {
  (Platform as any).OS = os;
};

const settle = async (h: ReturnType<typeof createHarness>) => {
  await flush();
  await h.purchases.drainQueue();
  await flush();
};

describe('PurchaseStore pipeline', () => {
  beforeEach(() => {
    setOS('ios');
  });

  afterAll(() => {
    setOS(originalOS as 'ios' | 'android');
  });

  describe('open records', () => {
    it('records a pending transaction without verifying', async () => {
      const h = createHarness();
      runInAction(() => {
        h.palStore.cachedPalsHubPals.push(hubPal());
      });
      await h.purchases.processTransaction(tx({state: 'pending'}), {});

      expect(h.api.verify).not.toHaveBeenCalled();
      expect(h.storage.ledger()[PAL_ID]).toMatchObject({
        status: 'pending_payment',
        pendingSince: 1_000,
      });
    });

    it('persists unlocking, then the grant, then finishes, then installs', async () => {
      const h = createHarness();
      runInAction(() => {
        h.palStore.cachedPalsHubPals.push(hubPal());
      });

      await h.purchases.processTransaction(tx(), {});
      await settle(h);

      expect(h.log).toEqual([
        'write:unlocking',
        'write:granted',
        'finish:tx-1',
        'install:pal-1',
        'write:active',
      ]);
      expect(h.storage.ledger()[PAL_ID]).toMatchObject({
        status: 'active',
        supportCode: 'SUP-1',
        contentVersion: 3,
        appliedPromptHash: 'hash-pal-1',
        transactionIds: ['tx-1'],
        title: 'Story Pal',
      });
      expect(h.storage.ledger()[PAL_ID].grant).toBeUndefined();
    });

    it('keeps a provisional record and re-keys it by the verified pal id', async () => {
      const h = createHarness();
      h.api.verify.mockResolvedValueOnce([result('pending')]);

      await h.purchases.processTransaction(tx(), {});

      expect(Object.keys(h.storage.ledger())).toEqual([PAL_ID]);
      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('pending_payment');
    });

    it.each([
      ['a network failure', () => Promise.reject(new Error('offline'))],
      ['a failed result', () => Promise.resolve([result('failed')])],
      ['an empty result list', () => Promise.resolve([])],
    ])('stays unlocking after %s and never finishes', async (_label, impl) => {
      const h = createHarness();
      h.api.verify.mockImplementationOnce(impl as any);

      await h.purchases.processTransaction(tx(), {});

      expect(h.purchases.recordFor(PRODUCT)?.status).toBe('unlocking');
      expect(h.store.finish).not.toHaveBeenCalled();
    });

    it('moves to pending payment when verify says pending', async () => {
      const h = createHarness({records: [record('unlocking')]});
      h.api.verify.mockResolvedValueOnce([result('pending')]);

      await h.purchases.processTransaction(tx(), {});

      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('pending_payment');
      expect(h.store.finish).not.toHaveBeenCalled();
    });

    it('persists unfulfillable with its support code before finishing', async () => {
      const h = createHarness();
      h.api.verify.mockResolvedValueOnce([
        result('unfulfillable', {supportCode: 'SUP-9'}),
      ]);

      await h.purchases.processTransaction(tx(), {});

      expect(h.log).toEqual([
        'write:unlocking',
        'write:unfulfillable',
        'finish:tx-1',
      ]);
      expect(h.storage.ledger()[PAL_ID].supportCode).toBe('SUP-9');
      expect(h.palStore.installOwnedPal).not.toHaveBeenCalled();
    });

    it.each(['revoked', 'removed'] as const)(
      'writes a tombstone and deletes the local Pal on %s',
      async status => {
        const h = createHarness({records: [record('unlocking')]});
        h.palStore.pals.push(localPal());
        h.api.verify.mockResolvedValueOnce([result(status)]);

        await h.purchases.processTransaction(tx(), {});

        expect(h.log).toEqual([
          'write:unlocking',
          'write:removed',
          'delete:local-pal-1',
          'finish:tx-1',
        ]);
      },
    );

    it('moves pending payment to unlocking when the payment clears', async () => {
      const h = createHarness({records: [record('pending_payment')]});

      await h.purchases.processTransaction(tx(), {});
      await settle(h);

      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('active');
      expect(h.purchases.recordFor(PAL_ID)?.pendingSince).toBeUndefined();
    });

    it.each(['pending_payment', 'unlocking'] as const)(
      'keeps %s on another pending delivery',
      async status => {
        const h = createHarness({records: [record(status)]});

        await h.purchases.processTransaction(tx({state: 'pending'}), {});

        expect(h.purchases.recordFor(PAL_ID)).toMatchObject({
          status,
          updatedAt: 1,
        });
        expect(h.api.verify).not.toHaveBeenCalled();
      },
    );

    it('re-verifies an unlocking record', async () => {
      const h = createHarness({records: [record('unlocking')]});
      await h.purchases.processTransaction(tx(), {});
      await settle(h);
      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('active');
    });
  });

  describe('settled records', () => {
    it.each(['granted', 'unfulfillable'] as const)(
      'finishes an unfinished transaction on %s without verifying',
      async status => {
        const h = createHarness({records: [record(status)]});
        await h.purchases.processTransaction(tx(), {settledVerify: true});

        expect(h.store.finish).toHaveBeenCalledTimes(1);
        expect(h.api.verify).not.toHaveBeenCalled();
        expect(h.purchases.recordFor(PAL_ID)?.status).toBe(status);
      },
    );

    it.each(['active', 'removed'] as const)(
      'does not verify %s without settledVerify',
      async status => {
        const h = createHarness({records: [record(status)]});
        await h.purchases.processTransaction(tx(), {});
        expect(h.api.verify).not.toHaveBeenCalled();
        expect(h.store.finish).toHaveBeenCalledTimes(1);
      },
    );

    it.each([
      ['a failure', () => Promise.reject(new Error('offline'))],
      ['pending', () => Promise.resolve([result('pending')])],
      ['unfulfillable', () => Promise.resolve([result('unfulfillable')])],
      ['invalid', () => Promise.resolve([result('invalid')])],
    ])('never lowers an active record on %s', async (_label, impl) => {
      const h = createHarness({records: [record('active')]});
      h.palStore.pals.push(localPal());
      h.api.verify.mockImplementationOnce(impl as any);

      await h.purchases.processTransaction(tx(), {settledVerify: true});

      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('active');
      expect(h.palStore.deletePal).not.toHaveBeenCalled();
    });

    it('removes an active Pal on revoked unless the signed-in library lists it', async () => {
      const h = createHarness({records: [record('active')], signedIn: true});
      h.palStore.pals.push(localPal());
      h.palStore.userLibrary.push(hubPal());
      h.api.verify.mockResolvedValueOnce([result('revoked')]);

      await h.purchases.processTransaction(tx(), {settledVerify: true});

      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('removed');
      expect(h.palStore.deletePal).not.toHaveBeenCalled();
    });

    it('applies newer content to an installed active Pal', async () => {
      const h = createHarness({records: [record('active')]});
      h.palStore.pals.push(localPal());
      h.api.verify.mockResolvedValueOnce([
        result('active', {contentVersion: 4, pal: hubPal({title: 'New'})}),
      ]);

      await h.purchases.processTransaction(tx(), {settledVerify: true});

      expect(h.palStore.applyOwnedPalContent).toHaveBeenCalledWith(
        'local-pal-1',
        expect.objectContaining({title: 'New'}),
        'hash-3',
      );
      expect(h.purchases.recordFor(PAL_ID)).toMatchObject({
        status: 'active',
        contentVersion: 4,
        appliedPromptHash: 'hash-new',
        title: 'New',
      });
    });

    it('does not reapply the same content version', async () => {
      const h = createHarness({records: [record('active')]});
      h.palStore.pals.push(localPal());
      await h.purchases.processTransaction(tx(), {settledVerify: true});
      expect(h.palStore.applyOwnedPalContent).not.toHaveBeenCalled();
    });

    it('reinstalls an active Pal that is not installed only when asked', async () => {
      const h = createHarness({records: [record('active')]});
      await h.purchases.processTransaction(tx(), {settledVerify: true});
      expect(h.palStore.installOwnedPal).not.toHaveBeenCalled();

      await h.purchases.processTransaction(tx(), {
        settledVerify: true,
        install: true,
      });
      await settle(h);
      expect(h.palStore.installOwnedPal).toHaveBeenCalledTimes(1);
      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('active');
    });

    it('revives a tombstone only on an explicit active verify', async () => {
      const h = createHarness({records: [record('removed')]});
      h.api.verify.mockResolvedValueOnce([result('revoked')]);
      await h.purchases.processTransaction(tx(), {settledVerify: true});
      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('removed');

      await h.purchases.processTransaction(tx(), {settledVerify: true});
      await settle(h);
      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('active');
    });
  });

  describe('Android', () => {
    beforeEach(() => setOS('android'));

    it.each(['active', 'unfulfillable', 'revoked', 'invalid'] as const)(
      'never finishes after verify %s',
      async status => {
        const h = createHarness();
        h.api.verify.mockResolvedValueOnce([result(status)]);
        await h.purchases.processTransaction(tx({unfinished: false}), {});
        await settle(h);
        expect(h.store.finish).not.toHaveBeenCalled();
      },
    );

    it('never finishes a replayed settled transaction', async () => {
      const h = createHarness({records: [record('granted')]});
      await h.purchases.processTransaction(tx(), {});
      expect(h.store.finish).not.toHaveBeenCalled();
    });
  });

  describe('invalid proof', () => {
    it('deletes the open record before finishing and does not retry', async () => {
      const h = createHarness({records: [record('pending_payment')]});
      h.api.verify.mockResolvedValueOnce([result('invalid')]);

      await h.purchases.processTransaction(tx(), {});

      expect(h.log).toEqual(['write:unlocking', 'write:', 'finish:tx-1']);
      expect(h.storage.ledger()[PAL_ID]).toBeUndefined();
      expect(h.purchases.invalidTxIds.has('tx-1')).toBe(true);
      expect(h.purchases.flowFor(PAL_ID)).toBe('invalid');
      await flush();
      expect(h.api.verify).toHaveBeenCalledTimes(1);
    });

    it.each(['granted', 'active', 'unfulfillable', 'removed'] as const)(
      'leaves a settled %s record unchanged',
      async status => {
        const h = createHarness({records: [record(status)]});
        h.api.verify.mockResolvedValue([result('invalid')]);

        await h.purchases.processTransaction(tx(), {settledVerify: true});

        expect(h.purchases.recordFor(PAL_ID)?.status).toBe(status);
        expect(h.purchases.flowFor(PAL_ID)).not.toBe('invalid');
      },
    );
  });

  describe('ordering and crashes', () => {
    it('handles two deliveries of one transaction once', async () => {
      const h = createHarness();
      await Promise.all([
        h.purchases.processTransaction(tx(), {settledVerify: true}),
        h.purchases.processTransaction(tx(), {settledVerify: true}),
      ]);
      await settle(h);

      expect(h.palStore.installOwnedPal).toHaveBeenCalledTimes(1);
      expect(h.store.finish).toHaveBeenCalledTimes(2);
      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('active');
    });

    it('waits for the Pal store to be ready', async () => {
      const h = createHarness();
      let release!: () => void;
      (h.palStore as any).ready = new Promise<void>(resolve => {
        release = resolve;
      });

      const run = h.purchases.processTransaction(tx(), {});
      await flush();
      expect(h.api.verify).not.toHaveBeenCalled();

      release();
      await run;
      expect(h.api.verify).toHaveBeenCalledTimes(1);
    });

    it.each([1, 2, 3])(
      'resumes to active after a crash at write %i',
      async failAt => {
        const log: string[] = [];
        const storage = new MemoryStorage(log);
        storage.failOnWrite = failAt;
        const first = createHarness({storage, log});
        await first.purchases
          .processTransaction(tx(), {})
          .catch(() => undefined);
        await first.purchases.drainQueue().catch(() => undefined);
        await flush();
        if (failAt <= 2) {
          expect(first.store.finish).not.toHaveBeenCalled();
        }

        storage.failOnWrite = undefined;
        const relaunched = createHarness({storage});
        await relaunched.purchases.drainQueue();
        await relaunched.purchases.processTransaction(tx(), {});
        await settle(relaunched);

        expect(storage.ledger()[PAL_ID].status).toBe('active');
      },
    );

    it('installs a persisted grant offline and finishes without verifying', async () => {
      const h = createHarness({records: [record('granted')]});
      h.api.verify.mockRejectedValue(new Error('offline'));

      await h.purchases.drainQueue();
      await h.purchases.processTransaction(tx(), {});

      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('active');
      expect(h.store.finish).toHaveBeenCalledTimes(1);
      expect(h.api.verify).not.toHaveBeenCalled();
    });

    it('keeps a grant when the install throws', async () => {
      const h = createHarness({records: [record('granted')]});
      h.palStore.installOwnedPal.mockRejectedValueOnce(new Error('db'));

      await h.purchases.drainQueue();
      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('granted');

      await h.purchases.drainQueue();
      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('active');
    });

    it('joins a running drain and runs one more pass', async () => {
      const h = createHarness({records: [record('granted')]});
      const first = h.purchases.drainQueue();
      const second = h.purchases.drainQueue();
      expect(second).toBe(first);
      await first;
      expect(h.palStore.installOwnedPal).toHaveBeenCalledTimes(1);
    });
  });

  describe('corrupt ledger', () => {
    it.each(['{not json', JSON.stringify({version: 2, records: {}})])(
      'starts empty and only an outcome write overwrites %p',
      async raw => {
        const log: string[] = [];
        const storage = new MemoryStorage(log);
        storage.values.set(LEDGER_KEY, raw);
        const h = createHarness({storage, log});

        await h.purchases.processTransaction(tx({state: 'pending'}), {});
        expect(storage.values.get(LEDGER_KEY)).toBe(raw);

        h.api.verify.mockResolvedValueOnce([result('active')]);
        await h.purchases.processTransaction(tx(), {});
        expect(storage.ledger()[PAL_ID].status).toBe('granted');
      },
    );
  });

  describe('selectors', () => {
    const ready = (h: ReturnType<typeof createHarness>) => {
      runInAction(() => {
        h.purchases.availability = 'ready';
        h.purchases.products.set(PRODUCT, {
          productId: PRODUCT,
          displayPrice: '4,99 €',
        });
      });
    };

    it('allows Buy when every condition holds', () => {
      const h = createHarness();
      ready(h);
      expect(h.purchases.canBuy(hubPal())).toBe(true);
    });

    it.each([
      [
        'billing is not ready',
        (h: any) => (h.purchases.availability = 'initializing'),
        {},
      ],
      [
        'billing is unavailable',
        (h: any) => (h.purchases.availability = 'unavailable'),
        {},
      ],
      [
        'the platform is not enabled',
        () => {},
        {iap_enabled: {ios: false, android: true}},
      ],
      ['availability is missing', () => {}, {iap_enabled: undefined}],
      [
        'the storefront has no product',
        (h: any) => h.purchases.products.clear(),
        {},
      ],
      ['the listing marks it owned', () => {}, {is_owned: true}],
      [
        'the library lists it',
        (h: any) => {
          h.auth.isAuthenticated = true;
          h.palStore.userLibrary.push(hubPal());
        },
        {},
      ],
      [
        'it is a legacy install',
        (h: any) => h.palStore.pals.push(localPal()),
        {},
      ],
    ])('hides Buy when %s', (_label, mutate, overrides) => {
      const h = createHarness();
      ready(h);
      runInAction(() => mutate(h));
      expect(h.purchases.canBuy(hubPal(overrides))).toBe(false);
    });

    it.each([
      'pending_payment',
      'unlocking',
      'granted',
      'active',
      'unfulfillable',
      'removed',
    ] as const)('hides Buy for a %s record', async status => {
      const h = createHarness({records: [record(status)]});
      await h.purchases.load();
      ready(h);
      expect(h.purchases.canBuy(hubPal())).toBe(false);
    });

    it('counts library Pals as owned only while signed in', () => {
      const h = createHarness();
      h.palStore.userLibrary.push(hubPal());
      expect(h.purchases.isOwned(PAL_ID)).toBe(false);
      h.auth.isAuthenticated = true;
      expect(h.purchases.isOwned(PAL_ID)).toBe(true);
    });
  });

  describe('buy', () => {
    const readyHarness = (signedIn = false) => {
      const h = createHarness({signedIn});
      runInAction(() => {
        h.purchases.availability = 'ready';
        h.purchases.products.set(PRODUCT, {
          productId: PRODUCT,
          displayPrice: '4,99 €',
        });
      });
      return h;
    };

    it('shows paying while the store sheet is up', async () => {
      const h = readyHarness();
      let resolvePurchase!: (value: any) => void;
      h.store.purchase.mockReturnValueOnce(
        new Promise(resolve => {
          resolvePurchase = resolve;
        }),
      );
      const buying = h.purchases.buy(hubPal());
      await flush();
      expect(h.purchases.flowFor(PAL_ID)).toBe('paying');

      resolvePurchase({kind: 'cancelled'});
      await expect(buying).resolves.toBe('close');
      expect(h.purchases.flowFor(PAL_ID)).toBe('idle');
    });

    it('completes a purchase to ready in the sheet session', async () => {
      const h = readyHarness();
      await h.purchases.buy(hubPal());
      await settle(h);
      expect(h.purchases.flowFor(PAL_ID)).toBe('ready');
      h.purchases.endSession(PAL_ID);
      expect(h.purchases.flowFor(PAL_ID)).toBe('active');
    });

    it('fetches the binding only when signed in and passes it on', async () => {
      const signedOut = readyHarness(false);
      await signedOut.purchases.buy(hubPal());
      expect(signedOut.binding.getBinding).not.toHaveBeenCalled();
      expect(signedOut.store.purchase).toHaveBeenCalledWith(PRODUCT, null);

      const signedIn = readyHarness(true);
      signedIn.binding.getBinding.mockResolvedValueOnce({
        appAccountToken: 'uuid',
      } as any);
      await signedIn.purchases.buy(hubPal());
      expect(signedIn.store.purchase).toHaveBeenCalledWith(PRODUCT, {
        appAccountToken: 'uuid',
      });
    });

    it('records a pending purchase', async () => {
      const h = readyHarness();
      h.store.purchase.mockResolvedValueOnce({kind: 'pending'});
      await expect(h.purchases.buy(hubPal())).resolves.toBe('stay');
      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('pending_payment');
    });

    it('restores silently when already owned', async () => {
      const h = readyHarness();
      h.store.purchase.mockResolvedValueOnce({kind: 'already_owned'});
      h.store.currentEntitlements.mockResolvedValueOnce([tx()]);

      await expect(h.purchases.buy(hubPal())).resolves.toBe('stay');
      await settle(h);

      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('active');
      expect(h.store.sync).not.toHaveBeenCalled();
    });

    it('offers restore when an owned product has no entitlement here', async () => {
      const h = readyHarness();
      h.store.purchase.mockResolvedValueOnce({kind: 'already_owned'});
      await h.purchases.buy(hubPal());
      expect(h.purchases.flowFor(PAL_ID)).toBe('restore_needed');
    });

    it('downgrades availability on a store refusal', async () => {
      const h = readyHarness();
      h.store.purchase.mockResolvedValueOnce({
        kind: 'error',
        code: 'developer-error',
        downgrade: true,
      });
      await expect(h.purchases.buy(hubPal())).resolves.toBe('close');
      expect(h.purchases.availability).toBe('unavailable');
      expect(h.purchases.canBuy(hubPal())).toBe(false);
    });

    it('keeps availability on other errors', async () => {
      const h = readyHarness();
      h.store.purchase.mockResolvedValueOnce({
        kind: 'error',
        code: 'network-error',
        downgrade: false,
      });
      await expect(h.purchases.buy(hubPal())).resolves.toBe('close');
      expect(h.purchases.availability).toBe('ready');
      expect(h.purchases.recordFor(PAL_ID)).toBeUndefined();
    });

    it('does nothing when Buy is not allowed', async () => {
      const h = createHarness();
      await expect(h.purchases.buy(hubPal())).resolves.toBe('stay');
      expect(h.store.purchase).not.toHaveBeenCalled();
    });
  });

  it('only buy starts a payment', async () => {
    const h = createHarness({
      records: [
        record('granted'),
        record('removed', {palId: 'pal-2', productId: 'pal.2'}),
      ],
    });
    h.store.currentEntitlements.mockResolvedValue([tx()]);
    await h.purchases.drainQueue();
    await h.purchases.processTransaction(tx(), {
      settledVerify: true,
      install: true,
    });
    await h.purchases.installOwned(hubPal());
    h.store.emit(tx());
    await settle(h);
    expect(h.store.purchase).not.toHaveBeenCalled();
  });

  it('processes store updates from the listener with settled verification', async () => {
    const h = createHarness({records: [record('active')]});
    h.palStore.pals.push(localPal());
    h.api.verify.mockResolvedValueOnce([result('revoked')]);

    h.store.emit(tx());
    await settle(h);

    expect(h.purchases.recordFor(PAL_ID)?.status).toBe('removed');
  });

  it('fetches store products for the listing once billing is ready', async () => {
    const h = createHarness();
    runInAction(() => {
      h.palStore.cachedPalsHubPals.push(
        hubPal(),
        hubPal({id: 'pal-2', store_product_id: 'pal.2', iap_enabled: {}}),
        hubPal({id: 'pal-3', store_product_id: undefined}),
      );
    });
    await h.purchases.syncProducts();
    expect(h.store.fetchProducts).not.toHaveBeenCalled();

    runInAction(() => {
      h.purchases.availability = 'ready';
    });
    await h.purchases.syncProducts();
    await h.purchases.syncProducts();

    expect(h.store.fetchProducts).toHaveBeenCalledTimes(1);
    expect(h.store.fetchProducts).toHaveBeenCalledWith([PRODUCT]);
    expect(h.purchases.productFor(PRODUCT)?.displayPrice).toBe('4,99 €');
  });

  it('is constructible with default dependencies', () => {
    expect(new PurchaseStore(createHarness().deps).availability).toBe(
      'initializing',
    );
  });
});
