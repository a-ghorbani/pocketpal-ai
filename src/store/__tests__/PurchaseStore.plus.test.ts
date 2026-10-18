import {Platform} from 'react-native';

import {refreshBody} from '../../services/iap/iapWire';
import {PLUS_KEY} from '../PurchaseStore';
import {
  MemoryStorage,
  PAL_ID,
  PRODUCT,
  createHarness,
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
    });

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
});
