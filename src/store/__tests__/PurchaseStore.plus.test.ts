import {Platform} from 'react-native';
import {runInAction} from 'mobx';

import {refreshBody} from '../../services/iap/iapWire';
import {PLUS_KEY} from '../PurchaseStore';
import {
  MemoryStorage,
  PAL_ID,
  PRODUCT,
  createHarness,
  flush,
  hubPal,
  plusTx,
  record,
  stopAll,
  tx,
} from './purchaseTestHarness';
import type {StoreTransaction} from '../../services/iap/StorePort';

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

const androidPlusTx = (overrides: Partial<StoreTransaction> = {}) => {
  const productId = overrides.productId ?? 'plus.1';
  return plusTx({
    proof: {
      platform: 'android',
      productId,
      purchaseToken: `tok-${productId}`,
    },
    ...overrides,
  });
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return {promise, resolve};
};

const until = async (condition: () => boolean) => {
  for (let i = 0; i < 100 && !condition(); i++) {
    await flush();
  }
  expect(condition()).toBe(true);
};

const ownerHarness = () => {
  const log: string[] = [];
  const storage = new MemoryStorage(log);
  storage.seedPlus();
  return createHarness({storage, log});
};

const readyHarness = async (h = createHarness()) => {
  await h.purchases.recover();
  await until(() => !h.purchases.plusProductsLoading);
  h.store.purchase.mockImplementation(async (productId: string) => ({
    kind: 'purchased' as const,
    tx: plusTx({productId}),
  }));
  return h;
};

const allProofs = (calls: unknown[][]) =>
  JSON.stringify(calls.map(call => call[1]));

describe('PurchaseStore Plus', () => {
  afterEach(() => {
    stopAll();
    jest.useRealTimers();
  });

  afterAll(() => {
    setOS(originalOS as 'ios' | 'android');
  });

  describe('delivery', () => {
    it('Android: persists the unlock before acknowledging the purchase', async () => {
      setOS('android');
      const h = createHarness();

      await h.purchases.processTransaction(androidPlusTx());

      expect(h.purchases.plusUnlocked).toBe(true);
      expect(h.storage.plusDoc()).toMatchObject({
        version: 1,
        productId: 'plus.1',
      });
      expect(h.log.indexOf('write:plus')).toBeGreaterThanOrEqual(0);
      expect(h.log.indexOf('write:plus')).toBeLessThan(
        h.log.indexOf('finish:plus.1-tx'),
      );
      expect(h.store.finish).toHaveBeenCalledTimes(1);
    });

    it('iOS: persists the unlock before finishing the transaction', async () => {
      setOS('ios');
      const h = createHarness();

      h.store.emit(plusTx());
      await h.purchases.processTransaction(plusTx());

      expect(h.purchases.plusUnlocked).toBe(true);
      expect(h.log.indexOf('write:plus')).toBeLessThan(
        h.log.indexOf('finish:plus.1-tx'),
      );
      expect(h.store.finish).toHaveBeenCalledTimes(1);
    });

    it('never sends a Plus transaction to PalsHub or the ledger', async () => {
      const h = createHarness();

      await h.purchases.processTransaction(plusTx());

      expect(h.api.verify).not.toHaveBeenCalled();
      expect(h.api.refresh).not.toHaveBeenCalled();
      expect(h.api.link).not.toHaveBeenCalled();
      expect(h.events.send).not.toHaveBeenCalled();
      expect(h.purchases.records).toEqual({});
      expect(h.storage.ledger()).toEqual({});
    });

    it('acknowledges every owned tier (two tiers bought)', async () => {
      setOS('android');
      const h = createHarness();

      await h.purchases.processTransaction(androidPlusTx());
      await h.purchases.processTransaction(
        androidPlusTx({productId: 'plus.2'}),
      );

      expect(h.store.finish).toHaveBeenCalledTimes(2);
      expect(h.purchases.plusUnlocked).toBe(true);
      expect(h.log.filter(entry => entry === 'write:plus')).toHaveLength(1);
      expect(h.storage.plusDoc()).toMatchObject({productId: 'plus.1'});
    });

    it('keeps the first unlock record and still finishes a redelivered tier', async () => {
      const h = ownerHarness();
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [
          plusTx({unfinished: false}),
          plusTx({productId: 'plus.3'}),
        ],
      });

      await h.purchases.recover();

      expect(
        h.storage.setItem.mock.calls.filter(([key]) => key === PLUS_KEY),
      ).toEqual([]);
      expect(h.log).toContain('finish:plus.3-tx');
      expect(h.store.finish).toHaveBeenCalledTimes(1);
      expect(h.storage.plusDoc()).toEqual({
        version: 1,
        productId: 'plus.1',
        unlockedAt: 1,
      });
      expect(h.purchases.plusUnlocked).toBe(true);
    });

    it('writes and then finishes a redelivery after a failed first write', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const h = createHarness();
      h.storage.failPlusWrite = true;
      await h.purchases.processTransaction(plusTx());
      expect(h.store.finish).not.toHaveBeenCalled();

      h.storage.failPlusWrite = false;
      await h.purchases.processTransaction(plusTx());

      expect(h.log.indexOf('write:plus')).toBeGreaterThanOrEqual(0);
      expect(h.log.indexOf('write:plus')).toBeLessThan(
        h.log.indexOf('finish:plus.1-tx'),
      );
      expect(h.storage.plusDoc()).toMatchObject({productId: 'plus.1'});
      warn.mockRestore();
    });

    it('writes before finishing when the stored unlock cannot be read', async () => {
      const h = ownerHarness();
      h.store.currentEntitlements.mockResolvedValue({
        ok: false,
        transactions: [],
      });
      await h.purchases.recover();
      h.storage.failPlusRead = true;

      await h.purchases.processTransaction(plusTx({productId: 'plus.2'}));

      expect(h.storage.plusDoc()).toMatchObject({productId: 'plus.2'});
      expect(h.log.indexOf('write:plus')).toBeGreaterThanOrEqual(0);
      expect(h.log.indexOf('write:plus')).toBeLessThan(
        h.log.indexOf('finish:plus.2-tx'),
      );
    });

    it.each([
      ['corrupt', 'not json'],
      ['wrong-version', JSON.stringify({version: 2, productId: 'plus.1'})],
    ])(
      'writes before finishing when the stored unlock is %s',
      async (_label, raw) => {
        const h = createHarness();
        h.storage.values.set(PLUS_KEY, raw);

        await h.purchases.processTransaction(plusTx());

        expect(h.log.indexOf('write:plus')).toBeGreaterThanOrEqual(0);
        expect(h.log.indexOf('write:plus')).toBeLessThan(
          h.log.indexOf('finish:plus.1-tx'),
        );
        expect(h.storage.plusDoc()).toMatchObject({
          version: 1,
          productId: 'plus.1',
        });
      },
    );

    it('stays unlocked in memory and does not finish when the write fails', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const h = createHarness();
      h.storage.failPlusWrite = true;

      await h.purchases.processTransaction(plusTx());

      expect(h.purchases.plusUnlocked).toBe(true);
      expect(h.storage.plusDoc()).toBeNull();
      expect(h.store.finish).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it('does not re-finish an already finished entitlement', async () => {
      const h = createHarness();

      await h.purchases.processTransaction(plusTx({unfinished: false}));

      expect(h.purchases.plusUnlocked).toBe(true);
      expect(h.store.finish).not.toHaveBeenCalled();
    });

    it('marks a pending payment without unlocking or finishing it', async () => {
      setOS('android');
      const h = createHarness();

      await h.purchases.processTransaction(
        androidPlusTx({state: 'pending', transactionId: undefined}),
      );

      expect(h.purchases.plusPending).toBe(true);
      expect(h.purchases.plusUnlocked).toBe(false);
      expect(h.storage.plusDoc()).toBeNull();
      expect(h.store.finish).not.toHaveBeenCalled();
    });

    it('ignores a pending payment once Plus is unlocked', async () => {
      const h = createHarness();
      h.storage.seedPlus();

      await h.purchases.processTransaction(
        plusTx({state: 'pending', transactionId: undefined}),
      );

      expect(h.purchases.plusUnlocked).toBe(true);
      expect(h.purchases.plusPending).toBe(false);
    });

    it('clears pending when the payment is delivered', async () => {
      const h = createHarness();
      await h.purchases.processTransaction(
        plusTx({state: 'pending', transactionId: undefined}),
      );

      await h.purchases.processTransaction(plusTx());

      expect(h.purchases.plusPending).toBe(false);
      expect(h.purchases.plusUnlocked).toBe(true);
    });

    it('keeps the Pal pipeline unchanged for a pal product', async () => {
      const h = createHarness();

      await h.purchases.processTransaction(tx());

      expect(h.api.verify).toHaveBeenCalledTimes(1);
      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('granted');
      expect(h.purchases.plusUnlocked).toBe(false);
      expect(h.storage.plusDoc()).toBeNull();
    });
  });

  describe('loading the stored unlock', () => {
    it('reads a stored unlock as unlocked', async () => {
      const h = createHarness();
      h.storage.seedPlus('plus.3');

      await h.purchases.loadPlus();

      expect(h.purchases.plusUnlocked).toBe(true);
    });

    it.each([
      ['garbage', 'not json'],
      ['wrong version', JSON.stringify({version: 2, productId: 'plus.1'})],
      ['no product', JSON.stringify({version: 1})],
      ['null', 'null'],
    ])('reads an unreadable document (%s) as locked', async (_label, raw) => {
      const h = createHarness();
      h.storage.values.set(PLUS_KEY, raw);

      await h.purchases.loadPlus();

      expect(h.purchases.plusUnlocked).toBe(false);
    });

    it('reads once per process', async () => {
      const h = createHarness();

      await h.purchases.loadPlus();
      await h.purchases.loadPlus();

      expect(
        h.storage.getItem.mock.calls.filter(([key]) => key === PLUS_KEY),
      ).toHaveLength(1);
    });

    it('never overwrites a delivery that lands while the read is in flight', async () => {
      const h = createHarness();
      const read = deferred<string | null>();
      h.storage.getItem.mockImplementation(async (key: string) =>
        key === PLUS_KEY ? read.promise : null,
      );

      const delivery = h.purchases.processTransaction(plusTx());
      read.resolve(null);
      await delivery;

      expect(h.purchases.plusUnlocked).toBe(true);
    });

    it('unlocks a returning owner at start before PalStore is ready', async () => {
      const storage = new MemoryStorage([]);
      storage.seedPlus();
      const h = createHarness({storage});
      h.palStore.ready = new Promise(() => {});

      h.purchases.start().catch(() => {});
      await h.purchases.loadPlus();

      expect(h.purchases.plusUnlocked).toBe(true);
    });
  });

  describe('refresh', () => {
    it('sends no Plus proof when a Pal and Plus are recovered together', async () => {
      setOS('ios');
      const h = createHarness({records: [record('unlocking')]});
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [tx({unfinished: false}), plusTx({unfinished: false})],
      });

      await h.purchases.recover();

      expect(h.purchases.plusUnlocked).toBe(true);
      expect(h.api.refresh).toHaveBeenCalledTimes(1);
      const [platform, proofs, known] = h.api.refresh.mock.calls[0];
      expect(proofs).toEqual([{platform: 'ios', jws: 'jws-1'}]);
      const body = JSON.stringify(refreshBody(platform, proofs, known));
      expect(body).not.toContain('plus.');
      expect(allProofs(h.api.verify.mock.calls)).not.toContain('plus.');
      expect(Object.values(h.purchases.records).map(r => r.productId)).toEqual([
        PRODUCT,
      ]);
    });
  });

  describe('recovery', () => {
    it('Android: delivers a purchase approved while the app was closed', async () => {
      setOS('android');
      const h = createHarness();
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [androidPlusTx()],
      });

      await h.purchases.recover();

      expect(h.purchases.plusUnlocked).toBe(true);
      expect(h.store.finish).toHaveBeenCalledTimes(1);
      expect(h.log.indexOf('write:plus')).toBeLessThan(
        h.log.indexOf('finish:plus.1-tx'),
      );
    });

    it('Android: re-derives a pending payment from the store list', async () => {
      setOS('android');
      const h = createHarness();
      const pending = androidPlusTx({
        state: 'pending',
        transactionId: undefined,
        unfinished: false,
      });
      h.store.currentEntitlements.mockResolvedValueOnce({
        ok: true,
        transactions: [pending],
      });

      await h.purchases.recover();
      expect(h.purchases.plusPending).toBe(true);

      await h.purchases.recover();
      expect(h.purchases.plusPending).toBe(false);
      expect(h.purchases.plusUnlocked).toBe(false);
    });

    it('unlocks a fresh install when the store lists any tier', async () => {
      const h = createHarness();
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [plusTx({productId: 'plus.3', unfinished: false})],
      });

      await h.purchases.recover();

      expect(h.purchases.plusUnlocked).toBe(true);
      expect(h.storage.plusDoc()).toMatchObject({productId: 'plus.3'});
      expect(h.purchases.plusChecked).toBe(true);
    });

    it('relocks after a refund when a successful query lists no purchase', async () => {
      const h = ownerHarness();

      await h.purchases.recover();

      expect(h.purchases.plusUnlocked).toBe(false);
      expect(h.storage.plusDoc()).toBeNull();
      expect(h.log).toContain('delete:plus');
    });

    it('keeps the unlock and pending state when the query fails (offline)', async () => {
      const h = ownerHarness();
      h.store.currentEntitlements.mockResolvedValue({
        ok: false,
        transactions: [],
      });

      await h.purchases.recover();

      expect(h.purchases.plusUnlocked).toBe(true);
      expect(h.storage.plusDoc()).not.toBeNull();
      expect(h.purchases.plusChecked).toBe(true);
    });

    it('Android: keeps pending when the query fails', async () => {
      setOS('android');
      const h = createHarness();
      await h.purchases.processTransaction(
        androidPlusTx({state: 'pending', transactionId: undefined}),
      );
      h.store.currentEntitlements.mockResolvedValue({
        ok: false,
        transactions: [],
      });

      await h.purchases.recover();

      expect(h.purchases.plusPending).toBe(true);
    });

    it('does not relock when a delivery lands while the query is in flight', async () => {
      const h = ownerHarness();
      h.store.currentEntitlements.mockImplementation(async () => {
        await h.purchases.processTransaction(plusTx({productId: 'plus.2'}));
        return {ok: true, transactions: []};
      });

      await h.purchases.recover();

      expect(h.purchases.plusUnlocked).toBe(true);
      expect(h.storage.plusDoc()).toMatchObject({productId: 'plus.1'});
      expect(h.log).not.toContain('write:plus');
      expect(h.log).toContain('finish:plus.2-tx');
    });

    it('Android: does not clear a pending payment made while the query is in flight', async () => {
      setOS('android');
      const h = createHarness();
      h.store.currentEntitlements.mockImplementation(async () => {
        await h.purchases.processTransaction(
          androidPlusTx({state: 'pending', transactionId: undefined}),
        );
        return {ok: true, transactions: []};
      });

      await h.purchases.recover();

      expect(h.purchases.plusPending).toBe(true);
    });

    it('stays locked in this process when the relock delete fails', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const h = ownerHarness();
      h.storage.failPlusDelete = true;

      await h.purchases.recover();

      expect(h.purchases.plusUnlocked).toBe(false);
      expect(h.storage.plusDoc()).not.toBeNull();
      warn.mockRestore();
    });

    it('holds the first check until the query settles', async () => {
      const h = createHarness();
      let answer!: () => void;
      h.store.currentEntitlements.mockImplementation(
        () =>
          new Promise(resolve => {
            answer = () =>
              resolve({ok: true, transactions: [plusTx({unfinished: false})]});
          }),
      );

      const recovery = h.purchases.recover();
      await until(() => answer !== undefined);
      expect(h.purchases.plusChecked).toBe(false);

      answer();
      await recovery;

      expect(h.purchases.plusChecked).toBe(true);
      expect(h.purchases.plusUnlocked).toBe(true);
    });

    it('settles Plus before a slow Pal verify', async () => {
      setOS('ios');
      const h = createHarness({records: [record('unlocking')]});
      h.api.verify.mockImplementation(() => {
        h.log.push('verify');
        return new Promise(() => {});
      });
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [tx({unfinished: false}), plusTx({unfinished: false})],
      });

      h.purchases.recover().catch(() => {});
      await until(() => h.purchases.plusChecked);

      expect(h.purchases.plusUnlocked).toBe(true);
      await until(() => h.log.includes('verify'));
      expect(h.log.indexOf('write:plus')).toBeLessThan(h.log.indexOf('verify'));
    });

    it('leaves the first check open when billing init fails', async () => {
      const h = createHarness();
      h.store.init.mockResolvedValue(false);

      await h.purchases.recover();

      expect(h.purchases.availability).toBe('unavailable');
      expect(h.purchases.plusChecked).toBe(false);
    });

    it('releases the first check when recovery throws', async () => {
      const h = createHarness();
      h.store.init.mockRejectedValue(new Error('boom'));

      await expect(h.purchases.recover()).rejects.toThrow('boom');

      expect(h.purchases.plusChecked).toBe(true);
    });

    it('iOS: recovery never clears pending (deferred purchases are not listed)', async () => {
      setOS('ios');
      const h = createHarness();
      await h.purchases.processTransaction(
        plusTx({state: 'pending', transactionId: undefined}),
      );

      await h.purchases.recover();

      expect(h.purchases.plusPending).toBe(true);
    });

    it('runs whether or not a Plus feature has shipped', async () => {
      const h = createHarness();
      h.store.currentEntitlements.mockResolvedValueOnce({
        ok: true,
        transactions: [plusTx({unfinished: false})],
      });

      await h.purchases.recover();
      expect(h.purchases.plusUnlocked).toBe(true);

      await h.purchases.recover();
      expect(h.purchases.plusUnlocked).toBe(false);
    });
  });

  describe('restore', () => {
    it('restores any tier and reports a successful query', async () => {
      const h = createHarness();
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [plusTx({productId: 'plus.4', unfinished: false})],
      });

      await expect(h.purchases.restore()).resolves.toEqual({queryOk: true});

      expect(h.purchases.plusUnlocked).toBe(true);
    });

    it('reports a successful query that found nothing and stays locked', async () => {
      const h = createHarness();

      await expect(h.purchases.restore()).resolves.toEqual({queryOk: true});

      expect(h.purchases.plusUnlocked).toBe(false);
    });

    it('reports a failed query and relocks nothing', async () => {
      const h = ownerHarness();
      h.store.currentEntitlements.mockResolvedValue({
        ok: false,
        transactions: [],
      });

      await expect(h.purchases.restore()).resolves.toEqual({queryOk: false});

      expect(h.purchases.plusUnlocked).toBe(true);
    });

    it('iOS: clears pending on a successful restore', async () => {
      setOS('ios');
      const h = createHarness();
      runInAction(() => {
        h.purchases.availability = 'ready';
      });
      await h.purchases.processTransaction(
        plusTx({state: 'pending', transactionId: undefined}),
      );

      await h.purchases.restore();

      expect(h.purchases.plusPending).toBe(false);
    });

    it('waits for an in-flight recovery instead of queueing another', async () => {
      const h = createHarness();
      let ready!: (value: boolean) => void;
      h.store.init.mockImplementationOnce(
        () =>
          new Promise<boolean>(resolve => {
            ready = resolve;
          }),
      );

      const recovery = h.purchases.recover();
      const restore = h.purchases.restore();
      await until(() => ready !== undefined);
      ready(true);
      await Promise.all([recovery, restore]);
      await flush();

      expect(h.store.init).toHaveBeenCalledTimes(1);
      expect(h.purchases.availability).toBe('ready');
    });

    it('starts billing through recovery when it is not ready yet', async () => {
      const h = createHarness();

      await h.purchases.restore();

      expect(h.store.init).toHaveBeenCalledTimes(1);
      expect(h.purchases.availability).toBe('ready');
    });

    it('still queries the store when the recovery before it fails', async () => {
      const h = createHarness();
      h.store.init.mockRejectedValueOnce(new Error('boom'));

      await expect(h.purchases.restore()).resolves.toEqual({queryOk: true});

      expect(h.store.currentEntitlements).toHaveBeenCalledTimes(1);
    });

    it('settles Plus before a slow Pal verify', async () => {
      setOS('ios');
      const h = createHarness();
      runInAction(() => {
        h.purchases.availability = 'ready';
      });
      h.api.verify.mockImplementation(() => new Promise(() => {}));
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [tx({unfinished: false}), plusTx({unfinished: false})],
      });

      h.purchases.restore().catch(() => {});
      await until(() => h.purchases.plusChecked);

      expect(h.purchases.plusUnlocked).toBe(true);
    });
  });

  describe('account changes', () => {
    it('keeps the unlock across sign-out and account deletion', async () => {
      const storage = new MemoryStorage([]);
      storage.seedPlus();
      const h = createHarness({storage, signedIn: true});
      await h.purchases.loadPlus();

      runInAction(() => {
        h.auth.isAuthenticated = false;
        h.auth.user = null;
      });
      h.palStore.userLibrary.splice(0);
      await flush();

      expect(h.purchases.plusUnlocked).toBe(true);
      expect(storage.removeItem).not.toHaveBeenCalled();
    });
  });

  describe('buy', () => {
    it('buys the selected tier and unlocks', async () => {
      const h = await readyHarness();

      await expect(h.purchases.buyPlus('plus.2')).resolves.toBe('purchased');

      expect(h.store.purchase).toHaveBeenCalledWith('plus.2', null);
      expect(h.purchases.plusUnlocked).toBe(true);
      expect(h.purchases.plusFlow).toBe('idle');
      expect(h.events.send).not.toHaveBeenCalled();
    });

    it('shows paying while the store sheet is open', async () => {
      const h = await readyHarness();
      let settle!: () => void;
      h.store.purchase.mockImplementation(
        () =>
          new Promise(resolve => {
            settle = () => resolve({kind: 'cancelled'});
          }),
      );

      const buying = h.purchases.buyPlus('plus.1');
      await until(() => settle !== undefined);
      expect(h.purchases.plusFlow).toBe('paying');

      settle();
      await buying;
      expect(h.purchases.plusFlow).toBe('idle');
    });

    it.each([
      ['not a Plus product', async () => createHarness(), 'pal.2'],
      ['billing not ready', async () => createHarness(), 'plus.1'],
    ])(
      'refuses without calling the store: %s',
      async (_label, make, productId) => {
        const h = await make();

        await expect(h.purchases.buyPlus(productId)).resolves.toBe('error');

        expect(h.store.purchase).not.toHaveBeenCalled();
      },
    );

    it('refuses before the first check settles', async () => {
      const h = createHarness();
      runInAction(() => {
        h.purchases.availability = 'ready';
      });
      await until(() => !h.purchases.plusProductsLoading);

      await expect(h.purchases.buyPlus('plus.1')).resolves.toBe('error');

      expect(h.purchases.plusChecked).toBe(false);
      expect(h.store.purchase).not.toHaveBeenCalled();
    });

    it('refuses a product the store did not return', async () => {
      const h = createHarness();
      h.store.fetchProducts.mockResolvedValue([
        {productId: 'plus.1', displayPrice: '$4.99'},
      ]);
      await readyHarness(h);

      await expect(h.purchases.buyPlus('plus.2')).resolves.toBe('error');

      expect(h.store.purchase).not.toHaveBeenCalled();
    });

    it('refuses while unlocked', async () => {
      const h = await readyHarness();
      await h.purchases.processTransaction(plusTx({unfinished: false}));

      await expect(h.purchases.buyPlus('plus.1')).resolves.toBe('error');

      expect(h.store.purchase).not.toHaveBeenCalled();
    });

    it('refuses while a payment is pending', async () => {
      const h = await readyHarness();
      await h.purchases.processTransaction(
        plusTx({state: 'pending', transactionId: undefined}),
      );

      await expect(h.purchases.buyPlus('plus.1')).resolves.toBe('error');

      expect(h.store.purchase).not.toHaveBeenCalled();
    });

    it('ignores a double tap', async () => {
      const h = await readyHarness();

      const results = await Promise.all([
        h.purchases.buyPlus('plus.1'),
        h.purchases.buyPlus('plus.1'),
      ]);

      expect(results).toEqual(['purchased', 'error']);
      expect(h.store.purchase).toHaveBeenCalledTimes(1);
    });

    it('marks a pending payment and unlocks when the store later approves it', async () => {
      const h = await readyHarness();
      h.store.purchase.mockResolvedValue({kind: 'pending'});

      await expect(h.purchases.buyPlus('plus.1')).resolves.toBe('pending');
      expect(h.purchases.plusPending).toBe(true);
      expect(h.purchases.plusUnlocked).toBe(false);

      h.store.emit(plusTx());
      await until(() => h.purchases.plusUnlocked);
      expect(h.purchases.plusPending).toBe(false);
    });

    it.each([
      [{kind: 'cancelled'} as const, 'cancelled'],
      [{kind: 'error', code: 'service-error'} as const, 'error'],
    ])('returns to idle, locked, on %p', async (outcome, expected) => {
      const h = await readyHarness();
      h.store.purchase.mockResolvedValue(outcome);

      await expect(h.purchases.buyPlus('plus.1')).resolves.toBe(expected);

      expect(h.purchases.plusUnlocked).toBe(false);
      expect(h.purchases.plusPending).toBe(false);
      expect(h.purchases.plusFlow).toBe('idle');
      expect(h.purchases.availability).toBe('ready');
    });

    it('returns an error when the store call throws', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const h = await readyHarness();
      h.store.purchase.mockRejectedValue(new Error('boom'));

      await expect(h.purchases.buyPlus('plus.1')).resolves.toBe('error');

      expect(h.purchases.plusFlow).toBe('idle');
      expect(h.purchases.availability).toBe('ready');
      warn.mockRestore();
    });

    it('delivers an already owned tier from a fresh query', async () => {
      const h = await readyHarness();
      h.store.purchase.mockResolvedValue({kind: 'already_owned'});
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [plusTx({productId: 'plus.2', unfinished: false})],
      });

      await expect(h.purchases.buyPlus('plus.1')).resolves.toBe('purchased');

      expect(h.purchases.plusUnlocked).toBe(true);
    });

    it.each([
      ['lists nothing', {ok: true, transactions: []}],
      ['fails', {ok: false, transactions: []}],
    ])(
      'returns an error when already owned but the query %s',
      async (_label, query) => {
        const h = await readyHarness();
        h.store.purchase.mockResolvedValue({kind: 'already_owned'});
        h.store.currentEntitlements.mockResolvedValue(query);

        await expect(h.purchases.buyPlus('plus.1')).resolves.toBe('error');

        expect(h.purchases.plusUnlocked).toBe(false);
      },
    );

    it('never relocks on already owned', async () => {
      const h = await readyHarness();
      h.store.purchase.mockImplementation(async () => {
        await h.purchases.processTransaction(plusTx({unfinished: false}));
        return {kind: 'already_owned'};
      });
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [],
      });

      await expect(h.purchases.buyPlus('plus.1')).resolves.toBe('purchased');

      expect(h.purchases.plusUnlocked).toBe(true);
      expect(h.storage.removeItem).not.toHaveBeenCalled();
    });

    it('sends no account binding when signed in', async () => {
      const h = await readyHarness(createHarness({signedIn: true}));

      await h.purchases.buyPlus('plus.1');

      expect(h.store.purchase).toHaveBeenCalledWith('plus.1', null);
      expect(h.binding.getBinding).not.toHaveBeenCalled();
      expect(h.api.link).not.toHaveBeenCalled();
    });

    it('can buy again after a refund relock', async () => {
      const h = await readyHarness(ownerHarness());
      expect(h.purchases.plusUnlocked).toBe(false);

      await expect(h.purchases.buyPlus('plus.1')).resolves.toBe('purchased');
    });

    it('never starts a payment from recovery, restore or already owned', async () => {
      const h = await readyHarness();
      h.store.purchase.mockResolvedValue({kind: 'already_owned'});
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [plusTx({unfinished: false})],
      });

      await h.purchases.recover();
      await h.purchases.restore();
      expect(h.store.purchase).not.toHaveBeenCalled();

      await h.purchases.processTransaction(
        plusTx({state: 'pending', transactionId: undefined}),
      );
      expect(h.store.purchase).not.toHaveBeenCalled();
    });
  });

  describe('products', () => {
    const plusIds = ['plus.1', 'plus.2', 'plus.3', 'plus.4'];
    const plusFetches = (h: ReturnType<typeof createHarness>) =>
      h.store.fetchProducts.mock.calls.filter(([ids]) =>
        ids.some(id => id.startsWith('plus.')),
      );
    const setReady = (h: ReturnType<typeof createHarness>) =>
      runInAction(() => {
        h.purchases.availability = 'ready';
      });
    const settled = (h: ReturnType<typeof createHarness>) =>
      until(() => !h.purchases.plusProductsLoading);

    it('does not fetch before billing is ready, then fetches once when it is', async () => {
      const h = createHarness();

      h.purchases.retryPlusProducts();
      await h.purchases.syncProducts();
      await flush();
      expect(h.store.fetchProducts).not.toHaveBeenCalled();
      expect(h.purchases.plusProductsLoading).toBe(false);
      expect(h.purchases.plusProducts).toEqual([]);

      setReady(h);
      await settled(h);

      expect(plusFetches(h)).toEqual([[plusIds]]);
      expect(h.purchases.plusProducts.map(p => p.productId)).toEqual(plusIds);
    });

    it('shows loading from the moment billing is ready and joins a retry', async () => {
      const h = createHarness();
      let answer!: () => void;
      const loadingAtCall: boolean[] = [];
      h.store.fetchProducts.mockImplementation((ids: string[]) => {
        loadingAtCall.push(h.purchases.plusProductsLoading);
        return new Promise(resolve => {
          answer = () =>
            resolve(ids.map(productId => ({productId, displayPrice: '$1'})));
        });
      });

      setReady(h);
      expect(h.purchases.plusProductsLoading).toBe(true);
      h.purchases.retryPlusProducts();
      await flush();
      answer();
      await settled(h);

      expect(plusFetches(h)).toHaveLength(1);
      expect(loadingAtCall).toEqual([true]);
      expect(h.purchases.plusProducts).toHaveLength(4);
    });

    it.each([
      ['empty', () => Promise.resolve([])],
      ['rejected', () => Promise.reject(new Error('offline'))],
    ])(
      'does not ask for Plus again when the Pals list changes after an %s fetch',
      async (_label, firstAnswer) => {
        const h = createHarness({observablePals: true});
        h.store.fetchProducts.mockImplementationOnce(firstAnswer);
        setReady(h);
        await settled(h);
        expect(plusFetches(h)).toHaveLength(1);

        runInAction(() => {
          h.palStore.cachedPalsHubPals.push(hubPal());
        });
        await until(() =>
          h.store.fetchProducts.mock.calls.some(([ids]) =>
            ids.includes(PRODUCT),
          ),
        );
        await flush();

        expect(plusFetches(h)).toHaveLength(1);
        expect(h.purchases.plusProducts).toEqual([]);
      },
    );

    it('retries only the missing products when asked after a partial answer', async () => {
      const h = createHarness();
      h.store.fetchProducts.mockResolvedValueOnce([
        {productId: 'plus.3', displayPrice: '$24.99'},
        {productId: 'plus.1', displayPrice: '$4.99'},
      ]);
      setReady(h);
      await settled(h);

      h.purchases.retryPlusProducts();
      expect(h.purchases.plusProductsLoading).toBe(true);
      await settled(h);

      expect(plusFetches(h)).toEqual([[plusIds], [['plus.2', 'plus.4']]]);
      expect(h.purchases.plusProducts.map(p => p.productId)).toEqual(plusIds);
    });

    it('does not ask again once every product is known', async () => {
      const h = createHarness();
      setReady(h);
      await settled(h);

      h.purchases.retryPlusProducts();
      await flush();

      expect(plusFetches(h)).toHaveLength(1);
      expect(h.purchases.plusProductsLoading).toBe(false);
    });

    it('retries after a failed fetch and after an empty one', async () => {
      const h = createHarness();
      h.store.fetchProducts
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce([]);
      setReady(h);
      await settled(h);
      expect(h.purchases.plusProducts).toEqual([]);

      h.purchases.retryPlusProducts();
      await settled(h);
      expect(h.purchases.plusProducts).toEqual([]);

      h.purchases.retryPlusProducts();
      await settled(h);
      expect(plusFetches(h)).toHaveLength(3);
      expect(h.purchases.plusProducts).toHaveLength(4);
    });

    it('keeps catalog order for a partial answer', async () => {
      const h = createHarness();
      h.store.fetchProducts.mockResolvedValue([
        {productId: 'plus.3', displayPrice: '$24.99'},
        {productId: 'plus.1', displayPrice: '$4.99'},
      ]);

      setReady(h);
      await settled(h);

      expect(h.purchases.plusProducts.map(p => p.productId)).toEqual([
        'plus.1',
        'plus.3',
      ]);
    });
  });
});
