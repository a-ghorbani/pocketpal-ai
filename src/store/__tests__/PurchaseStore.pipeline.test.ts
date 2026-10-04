import {Platform} from 'react-native';
import {runInAction} from 'mobx';

import {LEDGER_KEY, PurchaseStore} from '../PurchaseStore';
import * as RNIap from 'react-native-iap';

import {NativeStore} from '../../services/iap/NativeStore';
import {bindingSource} from '../../services/iap/bindingSource';
import {iapApi} from '../../services/iap/iapApi';
import {authService} from '../../services/palshub/AuthService';
import {
  PAL_ID,
  PRODUCT,
  MemoryStorage,
  contentOf,
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

  afterEach(stopAll);

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
        contentVersion: version(3),
        transactionIds: ['tx-1'],
        title: 'Story Pal',
      });
      expect(h.storage.ledger()[PAL_ID].applied).toEqual(contentOf(hubPal()));
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

    it.each([
      ['revoked', 'removed'],
      ['removed', 'unfulfillable'],
    ] as const)(
      'writes %s as %s, deletes the local Pal, then finishes',
      async (verified, status) => {
        const h = createHarness({records: [record('unlocking')]});
        h.palStore.pals.push(localPal());
        h.api.verify.mockResolvedValueOnce([
          result(verified, {supportCode: 'SUP-9'}),
        ]);

        await h.purchases.processTransaction(tx(), {});

        expect(h.log).toEqual([
          'write:unlocking',
          `write:${status}`,
          'delete:local-pal-1',
          'finish:tx-1',
        ]);
      },
    );

    it('keeps the support code of a withdrawn purchase', async () => {
      const h = createHarness({records: [record('unlocking')]});
      h.api.verify.mockResolvedValueOnce([
        result('removed', {supportCode: 'SUP-9'}),
      ]);

      await h.purchases.processTransaction(tx(), {});

      expect(h.storage.ledger()[PAL_ID]).toMatchObject({
        status: 'unfulfillable',
        supportCode: 'SUP-9',
      });
    });

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
    it('finishes an unfinished transaction on unfulfillable without verifying', async () => {
      const h = createHarness({records: [record('unfulfillable')]});
      await h.purchases.processTransaction(tx(), {settledVerify: true});

      expect(h.store.finish).toHaveBeenCalledTimes(1);
      expect(h.api.verify).not.toHaveBeenCalled();
      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('unfulfillable');
    });

    it('leaves a granted record to the install queue on an active verify', async () => {
      const h = createHarness({records: [record('granted')]});
      await h.purchases.processTransaction(tx(), {settledVerify: true});

      expect(h.store.finish).toHaveBeenCalledTimes(1);
      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('granted');
      expect(h.palStore.installOwnedPal).not.toHaveBeenCalled();
    });

    it.each([
      ['revoked', 'removed'],
      ['removed', 'unfulfillable'],
    ] as const)(
      'removes a granted Pal on %s as %s',
      async (verified, status) => {
        const h = createHarness({records: [record('granted')]});
        h.palStore.pals.push(localPal());
        h.api.verify.mockResolvedValueOnce([result(verified)]);

        await h.purchases.processTransaction(tx(), {settledVerify: true});

        const rec = h.purchases.recordFor(PAL_ID);
        expect(rec?.status).toBe(status);
        expect(rec?.grant).toBeUndefined();
        expect(h.palStore.deletePal).toHaveBeenCalledWith('local-pal-1');
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

    it('offers newer content to an installed active Pal without applying it', async () => {
      const h = createHarness({records: [record('active')]});
      h.palStore.pals.push(localPal());
      h.api.verify.mockResolvedValueOnce([
        result('active', {
          contentVersion: version(4),
          pal: hubPal({title: 'New'}),
        }),
      ]);

      await h.purchases.processTransaction(tx(), {settledVerify: true});

      expect(h.palStore.applyCreatorUpdate).not.toHaveBeenCalled();
      expect(h.purchases.recordFor(PAL_ID)).toMatchObject({
        status: 'active',
        contentVersion: version(3),
        title: 'Story Pal',
        pendingUpdate: {contentVersion: version(4), pal: {title: 'New'}},
      });
      expect(h.purchases.updateAvailable(PAL_ID)).toBe(true);
    });

    it('does not offer the same content version', async () => {
      const h = createHarness({records: [record('active')]});
      h.palStore.pals.push(localPal());
      await h.purchases.processTransaction(tx(), {settledVerify: true});
      expect(h.purchases.recordFor(PAL_ID)?.pendingUpdate).toBeUndefined();
      expect(h.palStore.applyCreatorUpdate).not.toHaveBeenCalled();
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

    it('acknowledges an active purchase once, after the grant is written', async () => {
      const h = createHarness();
      await h.purchases.processTransaction(tx(), {});
      await settle(h);

      expect(h.log.slice(0, 3)).toEqual([
        'write:unlocking',
        'write:granted',
        'finish:tx-1',
      ]);
      expect(h.store.finish).toHaveBeenCalledTimes(1);
    });

    it.each([
      'unfulfillable',
      'revoked',
      'removed',
      'invalid',
      'pending',
      'failed',
      'unavailable',
    ] as const)('never acknowledges after verify %s', async status => {
      const h = createHarness();
      h.api.verify.mockResolvedValueOnce([result(status)]);
      await h.purchases.processTransaction(tx(), {});
      await settle(h);
      expect(h.store.finish).not.toHaveBeenCalled();
    });

    it('never re-acknowledges an acknowledged purchase on an open record', async () => {
      const h = createHarness({records: [record('unlocking')]});
      await h.purchases.processTransaction(tx({unfinished: false}), {});
      await settle(h);
      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('active');
      expect(h.store.finish).not.toHaveBeenCalled();
    });

    it('never acknowledges an invalid proof without a support code', async () => {
      const h = createHarness();
      h.api.verify.mockResolvedValueOnce([
        result('invalid', {supportCode: undefined}),
      ]);
      await h.purchases.processTransaction(tx(), {});
      expect(h.purchases.recordFor(PAL_ID)).toBeUndefined();
      expect(h.store.finish).not.toHaveBeenCalled();
    });

    it('never acknowledges a pending purchase', async () => {
      const h = createHarness();
      await h.purchases.processTransaction(
        tx({state: 'pending', unfinished: false}),
        {},
      );
      expect(h.store.finish).not.toHaveBeenCalled();
    });

    it.each(['granted', 'active'] as const)(
      'acknowledges an unacknowledged replay on a %s record once',
      async status => {
        const h = createHarness({records: [record(status)]});
        await h.purchases.processTransaction(tx(), {});
        await h.purchases.processTransaction(tx(), {});
        expect(h.store.finish).toHaveBeenCalledTimes(1);
      },
    );

    it('acknowledges a second delivery in one query after the first failed', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const h = createHarness({records: [record('active')]});
      h.store.finish.mockRejectedValueOnce(new Error('billing'));

      await h.purchases.processTransaction(tx(), {});
      await h.purchases.processTransaction(tx(), {});

      expect(h.store.finish).toHaveBeenCalledTimes(2);
      warn.mockRestore();
    });

    it('leaves an acknowledged replay alone', async () => {
      const h = createHarness({records: [record('active')]});
      await h.purchases.processTransaction(tx({unfinished: false}), {});
      expect(h.store.finish).not.toHaveBeenCalled();
    });

    it.each(['removed', 'unfulfillable'] as const)(
      'never acknowledges a replay on a %s record',
      async status => {
        const h = createHarness({records: [record(status)]});
        await h.purchases.processTransaction(tx(), {});
        expect(h.store.finish).not.toHaveBeenCalled();
      },
    );

    it('acknowledges a revived tombstone after the grant is written', async () => {
      const h = createHarness({records: [record('removed')]});
      await h.purchases.processTransaction(tx(), {settledVerify: true});
      await settle(h);

      expect(h.log.slice(0, 2)).toEqual(['write:granted', 'finish:tx-1']);
      expect(h.store.finish).toHaveBeenCalledTimes(1);
    });
  });

  describe('purchase ref', () => {
    const refreshKnown = async (h: ReturnType<typeof createHarness>) => {
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [tx({unfinished: false})],
      });
      await h.purchases.recover();
      return h.api.refresh.mock.calls.at(-1)![2];
    };

    it.each([
      ['with', true],
      ['without', false],
    ])(
      'replaces the stored code on a settled active verify %s a local Pal',
      async (_label, installedHere) => {
        const h = createHarness({
          records: [record('active', {supportCode: 'A'})],
        });
        if (installedHere) {
          h.palStore.pals.push(localPal());
        }
        h.api.verify.mockResolvedValueOnce([
          result('active', {supportCode: 'B'}),
        ]);

        await h.purchases.processTransaction(tx(), {settledVerify: true});

        expect(h.storage.ledger()[PAL_ID].supportCode).toBe('B');
        expect((await refreshKnown(h))[PAL_ID].purchaseRef).toBe('B');
      },
    );

    it('takes the new code when a tombstone is revived', async () => {
      const h = createHarness({
        records: [record('removed', {supportCode: 'A'})],
      });
      h.api.verify.mockResolvedValueOnce([
        result('active', {supportCode: 'B'}),
      ]);

      await h.purchases.processTransaction(tx(), {settledVerify: true});

      expect(h.purchases.recordFor(PAL_ID)?.supportCode).toBe('B');
    });

    it.each([
      ['a settled active record', 'active'],
      ['a revived tombstone', 'removed'],
    ] as const)(
      'drops the old code of %s when verify sends none',
      async (_label, status) => {
        const h = createHarness({
          records: [record(status, {supportCode: 'A'})],
        });
        h.palStore.pals.push(localPal());
        h.api.verify.mockResolvedValueOnce([
          result('active', {supportCode: undefined}),
        ]);

        await h.purchases.processTransaction(tx(), {settledVerify: true});

        expect(h.purchases.recordFor(PAL_ID)?.supportCode).toBeUndefined();
      },
    );

    it('Android: delivers an active purchase without a code, warns once and leaves it out of known', async () => {
      setOS('android');
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const h = createHarness();
      h.api.verify.mockResolvedValueOnce([
        result('active', {supportCode: undefined}),
      ]);
      const unacknowledged = tx({
        proof: {platform: 'android', productId: PRODUCT, purchaseToken: 'tok'},
      });

      await h.purchases.processTransaction(unacknowledged, {});
      await settle(h);

      const rec = h.purchases.recordFor(PAL_ID);
      expect(rec?.status).toBe('active');
      expect(rec?.supportCode).toBeUndefined();
      expect(h.palStore.installOwnedPal).toHaveBeenCalledTimes(1);
      expect(h.store.finish).toHaveBeenCalledTimes(1);
      const warnings = warn.mock.calls.filter(args =>
        String(args[0]).includes('support code'),
      );
      expect(warnings).toHaveLength(1);
      expect(JSON.stringify(warnings)).toContain(PAL_ID);
      expect(JSON.stringify(warnings)).not.toContain('tok');
      expect(await refreshKnown(h)).toEqual({});
      warn.mockRestore();
    });
  });

  describe('Android against react-native-iap', () => {
    const iap = RNIap as unknown as Record<string, jest.Mock>;

    const nativeTx = async () => {
      iap.getAvailablePurchases.mockResolvedValueOnce([
        {
          id: 'GPA.9',
          transactionId: 'GPA.9',
          productId: PRODUCT,
          purchaseState: 'purchased',
          purchaseToken: 'token-9',
          isAcknowledgedAndroid: false,
          transactionDate: Date.now(),
        },
      ]);
      const store = new NativeStore();
      const {
        transactions: [purchase],
      } = await store.currentEntitlements();
      return {store, purchase};
    };

    beforeEach(() => {
      setOS('android');
      iap.finishTransaction.mockClear();
      iap.acknowledgePurchaseAndroid.mockClear();
      iap.consumePurchaseAndroid.mockClear();
    });

    it.each(['removed', 'unfulfillable', 'revoked', 'invalid'] as const)(
      'never calls finishTransaction after verify %s',
      async status => {
        const h = createHarness();
        const {store, purchase} = await nativeTx();
        h.purchases.setStore(store);
        h.api.verify.mockResolvedValueOnce([result(status)]);

        await h.purchases.processTransaction(purchase, {});
        await settle(h);

        expect(purchase.unfinished).toBe(true);
        expect(iap.finishTransaction).toHaveBeenCalledTimes(0);
        expect(iap.acknowledgePurchaseAndroid).toHaveBeenCalledTimes(0);
        expect(iap.consumePurchaseAndroid).toHaveBeenCalledTimes(0);
      },
    );

    it('calls finishTransaction once, non-consumable, after verify active', async () => {
      const h = createHarness();
      const {store, purchase} = await nativeTx();
      h.purchases.setStore(store);

      await h.purchases.processTransaction(purchase, {});
      await h.purchases.processTransaction(purchase, {});
      await settle(h);

      expect(iap.finishTransaction).toHaveBeenCalledTimes(1);
      expect(iap.finishTransaction).toHaveBeenCalledWith({
        purchase: expect.objectContaining({id: 'GPA.9'}),
        isConsumable: false,
      });
      expect(iap.consumePurchaseAndroid).toHaveBeenCalledTimes(0);
    });
  });

  describe('one response with a grant and a revocation', () => {
    const respond = (results: Array<Record<string, unknown>>) => {
      const {
        verifyResponse,
        jsonResponse,
      } = require('../../../jest/fixtures/iap');
      (global as any).fetch = jest.fn(async () =>
        jsonResponse(verifyResponse(results)),
      );
    };
    const activeWith = (code: string) => {
      const {apiPal} = require('../../../jest/fixtures/iap');
      return {
        pal_id: PAL_ID,
        status: 'active',
        content_version: version(3),
        pal: apiPal({store_product_id: PRODUCT}),
        support_code: code,
      };
    };
    const revokedWith = (code: string) => ({
      pal_id: PAL_ID,
      status: 'revoked',
      support_code: code,
    });
    const run = async () => {
      const {iapApi: realApi} = require('../../services/iap/iapApi');
      const h = createHarness({records: [record('unlocking')]});
      h.deps.api = realApi;
      h.palStore.pals.push(localPal());
      await h.purchases.processTransaction(tx(), {});
      await settle(h);
      return h;
    };

    it.each(['ios', 'android'] as const)(
      '%s: the same purchase active and revoked ends removed, no grant',
      async os => {
        setOS(os);
        respond([activeWith('SUP-1'), revokedWith('SUP-1')]);

        const h = await run();

        expect(h.purchases.recordFor(PAL_ID)?.status).toBe('removed');
        expect(h.palStore.installOwnedPal).not.toHaveBeenCalled();
        expect(h.log).not.toContain('write:granted');
        expect(h.store.finish).toHaveBeenCalledTimes(os === 'ios' ? 1 : 0);
      },
    );

    it.each(['ios', 'android'] as const)(
      '%s: a refunded purchase beside an active one keeps the Pal owned',
      async os => {
        setOS(os);
        respond([revokedWith('SUP-A'), activeWith('SUP-B')]);

        const h = await run();

        expect(h.purchases.recordFor(PAL_ID)).toMatchObject({
          status: 'active',
          supportCode: 'SUP-B',
        });
        expect(h.palStore.deletePal).not.toHaveBeenCalled();
      },
    );
  });

  describe('invalid proof without a support code', () => {
    const invalidNoCode = () => result('invalid', {supportCode: undefined});

    it('deletes the open record before finishing and does not retry', async () => {
      const h = createHarness({records: [record('pending_payment')]});
      h.api.verify.mockResolvedValueOnce([invalidNoCode()]);

      await h.purchases.processTransaction(tx(), {});

      expect(h.log).toEqual([
        'write:unlocking',
        'write:',
        'finish:tx-1',
        'event:purchase_error',
      ]);
      expect(h.storage.ledger()[PAL_ID]).toBeUndefined();
      expect(h.purchases.invalidTxIds.has('tx-1')).toBe(true);
      expect(h.purchases.flowFor(PAL_ID)).toBe('invalid');
      await flush();
      expect(h.api.verify).toHaveBeenCalledTimes(1);
    });

    it('judges a proof once when the listener and Buy both deliver it', async () => {
      const h = createHarness();
      h.api.verify.mockResolvedValueOnce([invalidNoCode()]);

      await h.purchases.processTransaction(tx(), {settledVerify: true});
      await h.purchases.processTransaction(tx(), {settledVerify: true});

      expect(h.api.verify).toHaveBeenCalledTimes(1);
      expect(h.events.send).toHaveBeenCalledTimes(1);
      expect(h.purchases.recordFor(PAL_ID)).toBeUndefined();
    });

    it('re-verifies an invalid proof on an explicit install or restore', async () => {
      const h = createHarness();
      h.api.verify.mockResolvedValueOnce([invalidNoCode()]);
      await h.purchases.processTransaction(tx(), {});

      await h.purchases.processTransaction(tx(), {
        settledVerify: true,
        install: true,
      });
      await settle(h);

      expect(h.api.verify).toHaveBeenCalledTimes(2);
      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('active');
    });

    it.each(['granted', 'active', 'unfulfillable', 'removed'] as const)(
      'leaves a settled %s record unchanged',
      async status => {
        const h = createHarness({records: [record(status)]});
        h.api.verify.mockResolvedValue([invalidNoCode()]);

        await h.purchases.processTransaction(tx(), {settledVerify: true});

        expect(h.purchases.recordFor(PAL_ID)?.status).toBe(status);
        expect(h.purchases.flowFor(PAL_ID)).not.toBe('invalid');
      },
    );
  });

  describe('invalid proof with a support code', () => {
    const invalidWithCode = () => result('invalid', {supportCode: 'SUP-9'});

    it('holds the record with its code, hides Buy and finishes on iOS', async () => {
      const h = createHarness({records: [record('unlocking')]});
      h.api.verify.mockResolvedValueOnce([invalidWithCode()]);

      await h.purchases.processTransaction(tx(), {});

      expect(h.log).toEqual([
        'write:unlocking',
        'write:held_invalid',
        'finish:tx-1',
        'event:purchase_error',
      ]);
      expect(h.storage.ledger()[PAL_ID]).toMatchObject({
        status: 'held_invalid',
        supportCode: 'SUP-9',
      });
      expect(h.purchases.flowFor(PAL_ID)).toBe('held_invalid');
      runInAction(() => {
        h.purchases.availability = 'ready';
        h.purchases.products.set(PRODUCT, {
          productId: PRODUCT,
          displayPrice: '$4.99',
        });
      });
      expect(h.purchases.canBuy(hubPal())).toBe(false);
      expect(h.purchases.isOwned(PAL_ID)).toBe(false);
    });

    it('Android: holds it without any finish call', async () => {
      setOS('android');
      const h = createHarness({records: [record('unlocking')]});
      h.api.verify.mockResolvedValueOnce([invalidWithCode()]);

      await h.purchases.processTransaction(tx(), {});

      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('held_invalid');
      expect(h.store.finish).not.toHaveBeenCalled();
    });

    it('never re-verifies on the listener or recovery', async () => {
      const h = createHarness({records: [record('held_invalid')]});
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [tx({unfinished: false})],
      });

      await h.purchases.processTransaction(tx(), {settledVerify: true});
      await h.purchases.recover();

      expect(h.api.verify).not.toHaveBeenCalled();
      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('held_invalid');
    });

    it.each(['ios', 'android'] as const)(
      '%s: a restore that verifies active clears it and grants',
      async os => {
        setOS(os);
        const h = createHarness({records: [record('held_invalid')]});
        h.store.currentEntitlements.mockResolvedValue({
          ok: true,
          transactions: [tx()],
        });

        await h.purchases.restore();
        await settle(h);

        expect(h.purchases.recordFor(PAL_ID)?.status).toBe('active');
        expect(h.store.finish).toHaveBeenCalledTimes(1);
      },
    );

    it.each([
      ['invalid', 'held_invalid'],
      ['pending', 'held_invalid'],
      ['revoked', 'removed'],
      ['removed', 'unfulfillable'],
      ['unfulfillable', 'unfulfillable'],
    ] as const)(
      'on an explicit re-verify, %s leaves it %s',
      async (verdict, status) => {
        setOS('android');
        const h = createHarness({records: [record('held_invalid')]});
        h.api.verify.mockResolvedValueOnce([result(verdict)]);

        await h.purchases.processTransaction(tx(), {
          settledVerify: true,
          install: true,
        });

        expect(h.purchases.recordFor(PAL_ID)?.status).toBe(status);
        expect(h.store.finish).not.toHaveBeenCalled();
      },
    );
  });

  describe('ordering and crashes', () => {
    it.each(['ios', 'android'] as const)(
      '%s: handles two deliveries of one transaction once',
      async os => {
        setOS(os);
        const h = createHarness();
        await Promise.all([
          h.purchases.processTransaction(tx(), {settledVerify: true}),
          h.purchases.processTransaction(tx(), {settledVerify: true}),
        ]);
        await settle(h);

        expect(h.palStore.installOwnedPal).toHaveBeenCalledTimes(1);
        expect(h.store.finish).toHaveBeenCalledTimes(1);
        expect(h.purchases.recordFor(PAL_ID)?.status).toBe('active');
      },
    );

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

    it('shows an update only while the Pal is installed', async () => {
      const pendingUpdate = {
        pal: hubPal({updated_at: version(4), title: 'Story Pal 2'}),
        content: contentOf(
          hubPal({updated_at: version(4), title: 'Story Pal 2'}),
        ),
        contentVersion: version(4),
      };
      const h = createHarness({records: [record('active', {pendingUpdate})]});
      await h.purchases.load();

      expect(h.purchases.updateAvailable(PAL_ID)).toBe(false);

      h.palStore.pals.push(localPal());
      expect(h.purchases.updateAvailable(PAL_ID)).toBe(true);
    });

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
        'the store returned no product',
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

  describe('events', () => {
    const readyHarness = () => {
      const h = createHarness({signedIn: true});
      runInAction(() => {
        h.purchases.availability = 'ready';
        h.purchases.products.set(PRODUCT, {
          productId: PRODUCT,
          displayPrice: '4,99 €',
        });
      });
      h.binding.getBinding.mockImplementation(async () => {
        h.log.push('binding');
        return null;
      });
      return h;
    };

    it('sends buy_tap before fetching the binding', async () => {
      const h = readyHarness();
      await h.purchases.buy(hubPal());
      expect(h.log.slice(0, 2)).toEqual(['event:buy_tap', 'binding']);
      expect(h.events.send).toHaveBeenCalledWith(PAL_ID, 'buy_tap');
    });

    it.each([
      [{kind: 'cancelled'}, 'purchase_cancelled'],
      [{kind: 'error', code: 'network-error'}, 'purchase_error'],
    ])('sends the outcome event for %p', async (outcome, type) => {
      const h = readyHarness();
      h.store.purchase.mockResolvedValueOnce(outcome as any);
      await h.purchases.buy(hubPal());
      expect(h.events.send.mock.calls).toEqual([
        [PAL_ID, 'buy_tap'],
        [PAL_ID, type],
      ]);
    });

    it('sends purchase_error when the proof is invalid', async () => {
      const h = readyHarness();
      h.api.verify.mockResolvedValueOnce([result('invalid')]);
      await h.purchases.buy(hubPal());
      expect(h.events.send).toHaveBeenLastCalledWith(PAL_ID, 'purchase_error');
    });

    it('sends nothing but buy_tap for a completed purchase', async () => {
      const h = readyHarness();
      await h.purchases.buy(hubPal());
      await settle(h);
      expect(h.events.send).toHaveBeenCalledTimes(1);
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

    it('buys with a null binding and no binding request while account linking is off', async () => {
      const h = readyHarness(true);
      h.deps.binding = bindingSource;
      runInAction(() => {
        authService.isAuthenticated = true;
      });
      const bindingSpy = jest
        .spyOn(iapApi, 'binding')
        .mockResolvedValue({appAccountToken: 'uuid'} as any);
      try {
        await h.purchases.buy(hubPal());
        expect(bindingSpy).not.toHaveBeenCalled();
        expect(h.store.purchase).toHaveBeenCalledWith(PRODUCT, null);
      } finally {
        runInAction(() => {
          authService.isAuthenticated = false;
        });
        bindingSpy.mockRestore();
      }
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
      h.store.currentEntitlements.mockResolvedValueOnce({
        ok: true,
        transactions: [tx()],
      });

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

    it('keeps Buy available after a declined payment', async () => {
      const h = readyHarness();
      const declined = hubPal({id: 'pal-2', store_product_id: 'pal.2'});
      runInAction(() => {
        h.purchases.products.set('pal.2', {
          productId: 'pal.2',
          displayPrice: '4,99 €',
        });
      });
      h.store.purchase.mockResolvedValueOnce({
        kind: 'error',
        code: 'billing-unavailable',
      });
      await expect(h.purchases.buy(declined)).resolves.toBe('close');
      expect(h.purchases.availability).toBe('ready');
      expect(h.purchases.canBuy(declined)).toBe(true);

      await h.purchases.buy(hubPal());
      await settle(h);
      expect(h.purchases.flowFor(PAL_ID)).toBe('ready');
      expect(h.purchases.recordFor('pal-2')).toBeUndefined();
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
    h.store.currentEntitlements.mockResolvedValue({
      ok: true,
      transactions: [tx()],
    });
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
