import {Platform} from 'react-native';
import * as RNIap from 'react-native-iap';

import {
  NativeStore,
  EARLIER_TRANSACTION_MS,
  PURCHASE_SETTLE_GRACE_MS,
} from '../NativeStore';
import type {StoreTransaction} from '../StorePort';

const iap = RNIap as unknown as Record<string, jest.Mock>;

type Listener = (value: any) => void;

const originalOS = Platform.OS;

const setOS = (os: 'ios' | 'android') => {
  (Platform as any).OS = os;
};

const purchase = (overrides: Record<string, unknown> = {}) => ({
  id: 'tx-1',
  transactionId: 'GPA.1',
  productId: 'pal.a',
  purchaseState: 'purchased',
  purchaseToken: 'token-a',
  transactionDate: Date.now(),
  ...overrides,
});

const captureListeners = () => {
  const updates: Listener[] = [];
  const errors: Listener[] = [];
  iap.purchaseUpdatedListener.mockImplementation((cb: Listener) => {
    updates.push(cb);
    return {remove: jest.fn(() => updates.splice(updates.indexOf(cb), 1))};
  });
  iap.purchaseErrorListener.mockImplementation((cb: Listener) => {
    errors.push(cb);
    return {remove: jest.fn(() => errors.splice(errors.indexOf(cb), 1))};
  });
  return {
    update: (value: unknown) => [...updates].forEach(cb => cb(value)),
    error: (value: unknown) => [...errors].forEach(cb => cb(value)),
    counts: () => ({updates: updates.length, errors: errors.length}),
  };
};

describe('NativeStore', () => {
  let store: NativeStore;

  beforeEach(() => {
    jest.clearAllMocks();
    iap.requestPurchase.mockResolvedValue(null);
    store = new NativeStore();
  });

  afterEach(() => {
    setOS(originalOS as 'ios' | 'android');
  });

  describe('init', () => {
    it('reports a connected store', async () => {
      iap.initConnection.mockResolvedValueOnce(true);
      await expect(store.init()).resolves.toBe(true);
    });

    it('reports unavailable when the connection throws', async () => {
      iap.initConnection.mockRejectedValueOnce(new Error('no play services'));
      await expect(store.init()).resolves.toBe(false);
    });
  });

  it('maps products to their store price string', async () => {
    iap.fetchProducts.mockResolvedValueOnce([
      {id: 'pal.a', displayPrice: '4,99 €'},
    ]);
    await expect(store.fetchProducts(['pal.a', 'pal.b'])).resolves.toEqual([
      {productId: 'pal.a', displayPrice: '4,99 €'},
    ]);
    expect(iap.fetchProducts).toHaveBeenCalledWith({
      skus: ['pal.a', 'pal.b'],
      type: 'in-app',
    });
  });

  it('skips the product query for an empty list', async () => {
    await expect(store.fetchProducts([])).resolves.toEqual([]);
    expect(iap.fetchProducts).not.toHaveBeenCalled();
  });

  describe('purchase', () => {
    it('resolves purchased with an iOS proof and passes the binding', async () => {
      setOS('ios');
      const events = captureListeners();
      const pending = store.purchase('pal.a', {appAccountToken: 'uuid'});

      events.update(purchase({id: 'ios-tx-1', purchaseToken: 'jws-a'}));
      const outcome = await pending;

      expect(outcome).toEqual({
        kind: 'purchased',
        tx: expect.objectContaining({
          productId: 'pal.a',
          transactionId: 'ios-tx-1',
          state: 'purchased',
          unfinished: true,
          proof: {platform: 'ios', jws: 'jws-a'},
        }),
      });
      expect(iap.requestPurchase).toHaveBeenCalledWith({
        request: {
          apple: {sku: 'pal.a', appAccountToken: 'uuid'},
          google: {skus: ['pal.a']},
        },
        type: 'in-app',
      });
      expect(events.counts()).toEqual({updates: 0, errors: 0});
    });

    it('resolves purchased with an Android proof and account id', async () => {
      setOS('android');
      const events = captureListeners();
      const pending = store.purchase('pal.a', {obfuscatedAccountId: 'hash'});

      events.update(purchase());
      const outcome = await pending;

      expect(outcome).toEqual({
        kind: 'purchased',
        tx: expect.objectContaining({
          transactionId: 'GPA.1',
          unfinished: false,
          proof: {
            platform: 'android',
            productId: 'pal.a',
            purchaseToken: 'token-a',
          },
        }),
      });
      expect(iap.requestPurchase.mock.calls[0][0].request.google).toEqual({
        skus: ['pal.a'],
        obfuscatedAccountId: 'hash',
      });
    });

    it('purchases unbound when there is no binding', async () => {
      setOS('ios');
      const events = captureListeners();
      const pending = store.purchase('pal.a', null);
      events.update(purchase());
      await pending;
      expect(iap.requestPurchase.mock.calls[0][0].request).toEqual({
        apple: {sku: 'pal.a'},
        google: {skus: ['pal.a']},
      });
    });

    it('ignores updates for other products', async () => {
      setOS('android');
      const events = captureListeners();
      const pending = store.purchase('pal.a', null);
      events.update(purchase({productId: 'pal.other'}));
      events.update(purchase());
      await expect(pending).resolves.toMatchObject({kind: 'purchased'});
    });

    it.each(['pending', 'unknown'])(
      'maps purchase state %s to pending',
      async state => {
        setOS('android');
        const events = captureListeners();
        const pending = store.purchase('pal.a', null);
        events.update(purchase({purchaseState: state, transactionId: null}));
        await expect(pending).resolves.toEqual({kind: 'pending'});
      },
    );

    it('maps an iOS success on an earlier transaction to already owned', async () => {
      setOS('ios');
      const events = captureListeners();
      const pending = store.purchase('pal.a', null);
      events.update(
        purchase({
          transactionDate: Date.now() - EARLIER_TRANSACTION_MS - 1000,
        }),
      );
      await expect(pending).resolves.toEqual({kind: 'already_owned'});
    });

    it.each([
      ['deferred-payment', {kind: 'pending'}],
      ['pending', {kind: 'pending'}],
      ['already-owned', {kind: 'already_owned'}],
      ['duplicate-purchase', {kind: 'already_owned'}],
      ['user-cancelled', {kind: 'cancelled'}],
      ['billing-unavailable', {kind: 'error', downgrade: true}],
      ['iap-not-available', {kind: 'error', downgrade: true}],
      ['developer-error', {kind: 'error', downgrade: true}],
      ['feature-not-supported', {kind: 'error', downgrade: true}],
      ['item-unavailable', {kind: 'error', downgrade: true}],
      ['sku-not-found', {kind: 'error', downgrade: true}],
      ['network-error', {kind: 'error', downgrade: false}],
      ['service-error', {kind: 'error', downgrade: false}],
    ])('maps error %s', async (code, expected) => {
      const events = captureListeners();
      const pending = store.purchase('pal.a', null);
      events.error({code, message: 'x'});
      await expect(pending).resolves.toMatchObject(expected);
    });

    it('maps a rejected request by its code', async () => {
      captureListeners();
      iap.requestPurchase.mockRejectedValueOnce({code: 'sku-not-found'});
      await expect(store.purchase('pal.a', null)).resolves.toEqual({
        kind: 'error',
        code: 'sku-not-found',
        downgrade: true,
      });
    });
  });

  describe('purchase listener', () => {
    it('receives already-delivered iOS transactions for the purchase only', () => {
      captureListeners();
      store.purchase('pal.a', null);
      store.onTransaction(jest.fn());

      const [[, purchaseOptions], [, globalOptions]] =
        iap.purchaseUpdatedListener.mock.calls;
      expect(purchaseOptions).toEqual({dedupeTransactionIOS: false});
      expect(globalOptions).toBeUndefined();
    });
  });

  describe('purchase without an update event', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    const settleAfterGrace = async (pending: Promise<unknown>) => {
      await jest.advanceTimersByTimeAsync(PURCHASE_SETTLE_GRACE_MS);
      return pending;
    };

    it('iOS: settles from the store query once the grace period ends', async () => {
      setOS('ios');
      const events = captureListeners();
      iap.getAvailablePurchases.mockResolvedValueOnce([
        purchase({productId: 'pal.other', id: 'other'}),
        purchase({id: 'ios-tx-2', purchaseToken: 'jws-2'}),
      ]);
      const pending = store.purchase('pal.a', null);

      await jest.advanceTimersByTimeAsync(PURCHASE_SETTLE_GRACE_MS - 1);
      expect(iap.getAvailablePurchases).not.toHaveBeenCalled();

      await expect(settleAfterGrace(pending)).resolves.toEqual({
        kind: 'purchased',
        tx: expect.objectContaining({
          transactionId: 'ios-tx-2',
          proof: {platform: 'ios', jws: 'jws-2'},
        }),
      });
      expect(iap.getAvailablePurchases).toHaveBeenCalledWith({
        onlyIncludeActiveItemsIOS: true,
      });
      expect(events.counts()).toEqual({updates: 0, errors: 0});
    });

    it('iOS: maps an unfinished pending transaction to pending', async () => {
      setOS('ios');
      captureListeners();
      iap.getPendingTransactionsIOS.mockResolvedValueOnce([
        purchase({purchaseState: 'pending'}),
      ]);
      await expect(
        settleAfterGrace(store.purchase('pal.a', null)),
      ).resolves.toEqual({kind: 'pending'});
    });

    it('iOS: maps an earlier transaction to already owned', async () => {
      setOS('ios');
      captureListeners();
      iap.getAvailablePurchases.mockResolvedValueOnce([
        purchase({transactionDate: Date.now() - EARLIER_TRANSACTION_MS - 1}),
      ]);
      await expect(
        settleAfterGrace(store.purchase('pal.a', null)),
      ).resolves.toEqual({kind: 'already_owned'});
    });

    it.each([
      ['the store lists no transaction', () => {}],
      [
        'the store query throws',
        () => iap.getAvailablePurchases.mockRejectedValueOnce(new Error('x')),
      ],
    ])(
      'iOS: closes with a non-downgrade error when %s',
      async (_n, arrange) => {
        setOS('ios');
        const events = captureListeners();
        arrange();
        await expect(
          settleAfterGrace(store.purchase('pal.a', null)),
        ).resolves.toEqual({kind: 'error', code: 'unknown', downgrade: false});
        expect(events.counts()).toEqual({updates: 0, errors: 0});
      },
    );

    it('iOS: an event within the grace period settles without a query', async () => {
      setOS('ios');
      const events = captureListeners();
      const pending = store.purchase('pal.a', null);
      await jest.advanceTimersByTimeAsync(1_000);

      events.update(purchase());

      await expect(pending).resolves.toMatchObject({kind: 'purchased'});
      expect(jest.getTimerCount()).toBe(0);
      await jest.advanceTimersByTimeAsync(PURCHASE_SETTLE_GRACE_MS);
      expect(iap.getAvailablePurchases).not.toHaveBeenCalled();
    });

    it('iOS: resolves once when the event arrives after the fallback', async () => {
      setOS('ios');
      const events = captureListeners();
      const resolved = jest.fn();
      store.purchase('pal.a', null).then(resolved);

      await jest.advanceTimersByTimeAsync(PURCHASE_SETTLE_GRACE_MS);
      events.update(purchase());
      await jest.advanceTimersByTimeAsync(0);

      expect(resolved).toHaveBeenCalledTimes(1);
      expect(resolved).toHaveBeenCalledWith(
        expect.objectContaining({kind: 'error'}),
      );
    });

    it('Android: waits for the event with no fallback', async () => {
      setOS('android');
      const events = captureListeners();
      const pending = store.purchase('pal.a', null);
      await jest.advanceTimersByTimeAsync(PURCHASE_SETTLE_GRACE_MS * 2);

      expect(jest.getTimerCount()).toBe(0);
      expect(iap.getAvailablePurchases).not.toHaveBeenCalled();
      events.update(purchase());
      await expect(pending).resolves.toMatchObject({kind: 'purchased'});
    });
  });

  describe('transaction lists', () => {
    it('lists iOS unfinished transactions as unfinished', async () => {
      setOS('ios');
      iap.getPendingTransactionsIOS.mockResolvedValueOnce([purchase()]);
      const [tx] = await store.unfinished();
      expect(tx.unfinished).toBe(true);
    });

    it('has no unfinished list on Android', async () => {
      setOS('android');
      await expect(store.unfinished()).resolves.toEqual([]);
      expect(iap.getPendingTransactionsIOS).not.toHaveBeenCalled();
    });

    it('marks the query ok after a successful entitlement query', async () => {
      setOS('android');
      iap.getAvailablePurchases.mockResolvedValueOnce([
        purchase(),
        purchase({productId: 'pal.b', purchaseState: 'pending'}),
      ]);
      const txs = await store.currentEntitlements();
      expect(store.queryOk).toBe(true);
      expect(txs.map(tx => tx.state)).toEqual(['purchased', 'pending']);
    });

    it('returns nothing and clears queryOk when the query fails', async () => {
      iap.getAvailablePurchases.mockRejectedValueOnce(new Error('offline'));
      await expect(store.currentEntitlements()).resolves.toEqual([]);
      expect(store.queryOk).toBe(false);
    });

    it('drops purchases without a token', async () => {
      iap.getAvailablePurchases.mockResolvedValueOnce([
        purchase({purchaseToken: null}),
      ]);
      await expect(store.currentEntitlements()).resolves.toEqual([]);
    });
  });

  describe('finish', () => {
    const tx: StoreTransaction = {
      productId: 'pal.a',
      transactionId: 'tx-1',
      state: 'purchased',
      unfinished: true,
      proof: {platform: 'ios', jws: 'jws'},
      handle: {id: 'tx-1'},
    };

    it('finishes as non-consumable on iOS', async () => {
      setOS('ios');
      await store.finish(tx);
      expect(iap.finishTransaction).toHaveBeenCalledWith({
        purchase: {id: 'tx-1'},
        isConsumable: false,
      });
    });

    it.each(['removed', 'unfulfillable', 'revoked', 'invalid'])(
      'never finishes, acknowledges or consumes on Android after %s',
      async () => {
        setOS('android');
        await store.finish({...tx, unfinished: false});
        expect(iap.finishTransaction).not.toHaveBeenCalled();
        expect(iap.acknowledgePurchaseAndroid).not.toHaveBeenCalled();
        expect(iap.consumePurchaseAndroid).not.toHaveBeenCalled();
      },
    );

    it('never finishes, acknowledges or consumes on Android', async () => {
      setOS('android');
      await store.finish(tx);
      expect(iap.finishTransaction).not.toHaveBeenCalled();
      expect(iap.acknowledgePurchaseAndroid).not.toHaveBeenCalled();
      expect(iap.consumePurchaseAndroid).not.toHaveBeenCalled();
    });
  });

  it('syncs with the App Store only on iOS', async () => {
    setOS('android');
    await store.sync();
    expect(iap.syncIOS).not.toHaveBeenCalled();
    setOS('ios');
    await store.sync();
    expect(iap.syncIOS).toHaveBeenCalledTimes(1);
  });

  it('forwards transaction updates until unsubscribed', () => {
    setOS('ios');
    const events = captureListeners();
    const listener = jest.fn();
    const unsubscribe = store.onTransaction(listener);

    events.update(purchase());
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({productId: 'pal.a', unfinished: true}),
    );

    unsubscribe();
    events.update(purchase());
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
