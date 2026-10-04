import {AppState, Platform} from 'react-native';
import {runInAction} from 'mobx';

import {refreshBody} from '../../services/iap/iapWire';
import {
  LEDGER_KEY,
  RETRY_DELAYS_MS,
  RETRY_STEADY_MS,
  STALE_PENDING_MS,
} from '../PurchaseStore';
import {
  MemoryStorage,
  PAL_ID,
  PRODUCT,
  changedPal,
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

const androidTx = (overrides = {}) =>
  tx({
    unfinished: false,
    proof: {platform: 'android', productId: PRODUCT, purchaseToken: 'tok'},
    ...overrides,
  });

describe('PurchaseStore recovery', () => {
  afterEach(() => {
    stopAll();
    jest.useRealTimers();
  });

  afterAll(() => {
    setOS(originalOS as 'ios' | 'android');
  });

  describe('launch', () => {
    it('iOS: drives an unfinished transaction left unlocking to installed', async () => {
      setOS('ios');
      const h = createHarness({records: [record('unlocking')]});
      h.store.unfinished.mockResolvedValue([tx()]);

      await h.purchases.recover();
      await h.purchases.drainQueue();

      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('active');
      expect(h.store.finish).toHaveBeenCalledTimes(1);
      expect(h.log.indexOf('write:granted')).toBeLessThan(
        h.log.indexOf('finish:tx-1'),
      );
    });

    it('Android: drives a purchase from the store list and acknowledges it once', async () => {
      setOS('android');
      const h = createHarness({records: [record('unlocking')]});
      h.store.currentEntitlements
        .mockResolvedValueOnce({
          ok: true,
          transactions: [androidTx({unfinished: true})],
        })
        .mockResolvedValue({ok: true, transactions: [androidTx()]});

      await h.purchases.recover();
      await h.purchases.drainQueue();
      await h.purchases.recover();

      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('active');
      expect(h.store.finish).toHaveBeenCalledTimes(1);
    });

    it.each(['active', 'granted'] as const)(
      'Android: acknowledges an unacknowledged purchase on a settled %s record',
      async status => {
        setOS('android');
        const h = createHarness({records: [record(status)]});
        h.store.currentEntitlements.mockResolvedValue({
          ok: true,
          transactions: [androidTx({unfinished: true})],
        });

        await h.purchases.recover();

        expect(h.store.finish).toHaveBeenCalledTimes(1);
        expect(h.api.verify).not.toHaveBeenCalled();
      },
    );

    it('Android: leaves an acknowledged settled purchase alone', async () => {
      setOS('android');
      const h = createHarness({records: [record('active')]});
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [androidTx()],
      });

      await h.purchases.recover();

      expect(h.store.finish).not.toHaveBeenCalled();
    });

    it.each(['removed', 'unfulfillable'] as const)(
      'Android: never acknowledges an unacknowledged purchase on a %s record',
      async status => {
        setOS('android');
        const h = createHarness({records: [record(status)]});
        h.store.currentEntitlements.mockResolvedValue({
          ok: true,
          transactions: [androidTx({unfinished: true})],
        });

        await h.purchases.recover();

        expect(h.store.finish).not.toHaveBeenCalled();
      },
    );

    it('iOS: installs a persisted grant offline and finishes without verifying', async () => {
      setOS('ios');
      const h = createHarness({records: [record('granted')]});
      h.api.verify.mockRejectedValue(new Error('offline'));
      h.api.refresh.mockRejectedValue(new Error('offline'));
      h.store.unfinished.mockResolvedValue([tx()]);

      await h.purchases.recover();

      expect(h.log.slice(0, 2)).toEqual(['install:pal-1', 'write:active']);
      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('active');
      expect(h.store.finish).toHaveBeenCalledTimes(1);
      expect(h.api.verify).not.toHaveBeenCalled();
    });

    it('marks billing unavailable and still installs grants when init fails', async () => {
      const h = createHarness({records: [record('granted')]});
      h.store.init.mockResolvedValue(false);

      await h.purchases.recover();

      expect(h.purchases.availability).toBe('unavailable');
      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('active');
      expect(h.store.currentEntitlements).not.toHaveBeenCalled();
    });

    it('marks billing ready after a successful init', async () => {
      const h = createHarness();
      await h.purchases.recover();
      expect(h.purchases.availability).toBe('ready');
    });

    it('installs every entitlement on a fresh install without an account prompt', async () => {
      setOS('ios');
      const h = createHarness();
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [
          tx({unfinished: false}),
          tx({
            productId: 'pal.2',
            transactionId: 'tx-2',
            unfinished: false,
            proof: {platform: 'ios', jws: 'jws-2'},
          }),
        ],
      });
      h.api.verify.mockImplementation(async (_platform, proofs: any) => [
        result('active', {
          palId: proofs[0].jws === 'jws-1' ? PAL_ID : 'pal-2',
          pal: hubPal({id: proofs[0].jws === 'jws-1' ? PAL_ID : 'pal-2'}),
        }),
      ]);

      await h.purchases.recover();
      await h.purchases.drainQueue();

      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('active');
      expect(h.purchases.recordFor('pal-2')?.status).toBe('active');
      expect(h.store.sync).not.toHaveBeenCalled();
    });

    it('does not re-drive a tombstone or call verify for it', async () => {
      setOS('ios');
      const h = createHarness({records: [record('removed')]});
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [tx({unfinished: false})],
      });

      await h.purchases.recover();

      expect(h.api.verify).not.toHaveBeenCalled();
      expect(h.purchases.canBuy(hubPal())).toBe(false);
      expect(h.purchases.flowFor(PAL_ID)).toBe('idle');
    });

    it('skips a transaction whose proof was invalid this session', async () => {
      const h = createHarness();
      h.api.verify.mockResolvedValueOnce([
        result('invalid', {supportCode: undefined}),
      ]);
      await h.purchases.processTransaction(tx(), {});
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [tx()],
      });
      h.store.unfinished.mockResolvedValue([tx()]);

      await h.purchases.recover();

      expect(h.api.verify).toHaveBeenCalledTimes(1);
      expect(h.purchases.recordFor(PAL_ID)).toBeUndefined();
    });

    it('never calls store sync', async () => {
      const h = createHarness({records: [record('pending_payment')]});
      await h.purchases.recover();
      expect(h.store.sync).not.toHaveBeenCalled();
    });

    it('runs one follow-up for triggers during a run', async () => {
      const h = createHarness();
      const first = h.purchases.recover();
      const second = h.purchases.recover();
      const third = h.purchases.recover();
      expect(second).toBe(first);
      expect(third).toBe(first);
      await first;
      expect(h.store.init).toHaveBeenCalledTimes(2);
    });
  });

  describe('acknowledgement retry', () => {
    let warn: jest.SpyInstance;
    beforeEach(() => {
      warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => warn.mockRestore());

    it('Android: acknowledges again when the next query still reports it unacknowledged', async () => {
      setOS('android');
      const h = createHarness({records: [record('active')]});
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [androidTx({unfinished: true})],
      });

      await h.purchases.recover();
      await h.purchases.recover();

      expect(h.store.finish).toHaveBeenCalledTimes(2);
    });

    it('Android: retries an acknowledgement that failed on the next query', async () => {
      setOS('android');
      const h = createHarness({records: [record('active')]});
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [androidTx({unfinished: true})],
      });
      h.store.finish.mockRejectedValueOnce(new Error('billing'));

      await h.purchases.recover();
      await h.purchases.recover();

      expect(h.store.finish).toHaveBeenCalledTimes(2);
      await expect(h.store.finish.mock.results[1].value).resolves.toBe(
        undefined,
      );
    });

    it('Android: retries on the query restore makes', async () => {
      setOS('android');
      const h = createHarness({records: [record('active')]});
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [androidTx({unfinished: true})],
      });

      await h.purchases.recover();
      await h.purchases.restore();

      expect(h.store.finish).toHaveBeenCalledTimes(2);
    });

    it('Android: never acknowledges a purchase the query reports acknowledged', async () => {
      setOS('android');
      const h = createHarness({records: [record('active')]});
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [androidTx()],
      });

      await h.purchases.recover();
      await h.purchases.recover();

      expect(h.store.finish).not.toHaveBeenCalled();
    });

    it('iOS: finishes a transaction once across recoveries', async () => {
      setOS('ios');
      const h = createHarness({records: [record('active')]});
      h.store.unfinished.mockResolvedValue([tx()]);

      await h.purchases.recover();
      await h.purchases.recover();

      expect(h.store.finish).toHaveBeenCalledTimes(1);
    });

    it('iOS: finishes again on the next recovery after a failed finish', async () => {
      setOS('ios');
      const h = createHarness({records: [record('active')]});
      h.store.unfinished.mockResolvedValue([tx()]);
      h.store.finish.mockRejectedValueOnce(new Error('storekit'));

      await h.purchases.recover();
      await h.purchases.recover();

      expect(h.store.finish).toHaveBeenCalledTimes(2);
    });
  });

  describe('refresh', () => {
    it('sends proofs and known versions of active records', async () => {
      setOS('ios');
      const h = createHarness({records: [record('active')]});
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [tx({unfinished: false})],
      });

      await h.purchases.recover();

      expect(h.api.refresh).toHaveBeenCalledWith(
        'ios',
        [{platform: 'ios', jws: 'jws-1'}],
        {[PAL_ID]: {contentVersion: version(3), purchaseRef: 'SUP-0'}},
      );
    });

    it('knows only active records that carry a support code', async () => {
      setOS('ios');
      const h = createHarness({
        records: [
          record('active', {
            palId: 'P1',
            supportCode: 'S1',
            contentVersion: version(2),
          }),
          record('active', {
            palId: 'P2',
            productId: 'pal.p2',
            supportCode: undefined,
          }),
          record('granted', {
            palId: 'P3',
            productId: 'pal.p3',
            supportCode: 'S3',
            grant: undefined,
          }),
        ],
      });
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [tx({unfinished: false})],
      });

      await h.purchases.recover();

      const [platform, proofs, known] = h.api.refresh.mock.calls[0];
      expect(known).toEqual({
        P1: {contentVersion: version(2), purchaseRef: 'S1'},
      });
      const body = JSON.stringify(refreshBody(platform, proofs, known).known);
      expect(body).not.toContain('jws-1');
      expect(body).not.toContain('tx-');
    });

    it('offers changed content to an installed active Pal without applying it', async () => {
      const h = createHarness({records: [record('active')]});
      h.palStore.pals.push(localPal());
      h.api.refresh.mockResolvedValue({
        changed: [changedPal({updated_at: version(4), title: 'Edited'})],
        revoked: [],
        removed: [],
        unchanged: [],
      });

      await h.purchases.recover();

      expect(h.palStore.applyCreatorUpdate).not.toHaveBeenCalled();
      expect(h.purchases.recordFor(PAL_ID)).toMatchObject({
        contentVersion: version(3),
        pendingUpdate: {contentVersion: version(4), pal: {title: 'Edited'}},
      });
    });

    it('does not install a changed Pal the user deleted', async () => {
      const h = createHarness({records: [record('active')]});
      h.api.refresh.mockResolvedValue({
        changed: [changedPal({updated_at: version(4)})],
        revoked: [],
        removed: [],
        unchanged: [],
      });

      await h.purchases.recover();

      expect(h.palStore.applyCreatorUpdate).not.toHaveBeenCalled();
      expect(h.palStore.installOwnedPal).not.toHaveBeenCalled();
      expect(h.purchases.recordFor(PAL_ID)?.pendingUpdate).toBeUndefined();
    });

    it.each([
      ['revoked', 'removed'],
      ['removed', 'unfulfillable'],
    ] as const)(
      'removes a %s Pal as %s and deletes the local copy',
      async (list, status) => {
        const h = createHarness({records: [record('active')]});
        h.palStore.pals.push(localPal());
        h.api.refresh.mockResolvedValue({
          changed: [],
          revoked: list === 'revoked' ? [PAL_ID] : [],
          removed: list === 'removed' ? [PAL_ID] : [],
          unchanged: [],
        });

        await h.purchases.recover();

        expect(h.purchases.recordFor(PAL_ID)).toMatchObject({
          status,
          supportCode: 'SUP-0',
        });
        expect(h.palStore.deletePal).toHaveBeenCalledWith('local-pal-1');
      },
    );

    it('keeps the local Pal when the signed-in library lists it', async () => {
      const h = createHarness({records: [record('active')], signedIn: true});
      h.palStore.pals.push(localPal());
      h.palStore.userLibrary.push(hubPal());
      h.api.refresh.mockResolvedValue({
        changed: [],
        revoked: [PAL_ID],
        removed: [],
        unchanged: [],
      });

      await h.purchases.recover();

      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('removed');
      expect(h.palStore.deletePal).not.toHaveBeenCalled();
    });

    it('removes nothing when refresh fails', async () => {
      const h = createHarness({records: [record('active')]});
      h.palStore.pals.push(localPal());
      h.api.refresh.mockRejectedValue(new Error('offline'));

      await h.purchases.recover();

      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('active');
      expect(h.palStore.deletePal).not.toHaveBeenCalled();
    });

    it('removes nothing when the store stops listing a Pal', async () => {
      const h = createHarness({records: [record('active')]});
      h.palStore.pals.push(localPal());
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [],
      });

      await h.purchases.recover();

      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('active');
    });

    it('leaves an unchanged Pal as it is', async () => {
      const h = createHarness({records: [record('active')]});
      h.palStore.pals.push(localPal());
      h.api.refresh.mockResolvedValue({
        changed: [],
        revoked: [],
        removed: [],
        unchanged: [PAL_ID],
      });

      await h.purchases.recover();

      expect(h.purchases.recordFor(PAL_ID)).toEqual(
        expect.objectContaining({status: 'active', contentVersion: version(3)}),
      );
      expect(h.palStore.deletePal).not.toHaveBeenCalled();
      expect(h.palStore.applyCreatorUpdate).not.toHaveBeenCalled();
    });

    it('never touches a legacy install without a record', async () => {
      const h = createHarness();
      const legacy = localPal('web-pal');
      h.palStore.pals.push(legacy);
      h.api.refresh.mockResolvedValue({
        changed: [changedPal({id: 'web-pal'})],
        revoked: ['web-pal'],
        removed: [],
        unchanged: [],
      });
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [tx({unfinished: false})],
      });
      h.api.verify.mockResolvedValue([result('pending')]);

      await h.purchases.recover();

      expect(h.palStore.deletePal).not.toHaveBeenCalled();
      expect(h.palStore.applyCreatorUpdate).not.toHaveBeenCalled();
      expect(h.purchases.isOwned('web-pal')).toBe(true);
    });

    it('iOS: keeps an active Pal when a refund update arrives offline, then revokes online', async () => {
      setOS('ios');
      const h = createHarness({records: [record('active')]});
      h.palStore.pals.push(localPal());
      h.api.verify.mockRejectedValueOnce(new Error('offline'));

      h.store.emit(tx());
      await flush();
      await flush();
      expect(h.store.finish).toHaveBeenCalledTimes(1);
      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('active');

      h.api.refresh.mockResolvedValue({
        changed: [],
        revoked: [PAL_ID],
        removed: [],
        unchanged: [],
      });
      await h.purchases.recover();
      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('removed');
    });
  });

  describe('failed store query', () => {
    const failQuery = (h: ReturnType<typeof createHarness>) =>
      h.store.currentEntitlements.mockResolvedValue({
        ok: false,
        transactions: [],
      });

    it('skips refresh and leaves the record as it is', async () => {
      const h = createHarness({records: [record('active')]});
      h.palStore.pals.push(localPal());
      failQuery(h);

      await h.purchases.recover();

      expect(h.api.refresh).not.toHaveBeenCalled();
      expect(h.purchases.recordFor(PAL_ID)).toEqual(record('active'));
    });

    it.each([
      [false, 'keeps an unreadable ledger read-only'],
      [true, 'marks an unreadable ledger writable after a refresh'],
    ])('queryOk %p: %s', async (ok, _name) => {
      const log: string[] = [];
      const storage = new MemoryStorage(log);
      const raw = JSON.stringify({version: 2, records: {}});
      storage.values.set(LEDGER_KEY, raw);
      const h = createHarness({storage, log});
      if (!ok) {
        failQuery(h);
      }

      await h.purchases.recover();
      await h.purchases.processTransaction(tx({state: 'pending'}), {});

      expect(storage.values.get(LEDGER_KEY) === raw).toBe(!ok);
    });

    it.each([true, false])(
      'Android: acts on its own query ok %p, not an overlapping query',
      async ok => {
        setOS('android');
        const h = createHarness({
          records: [
            record('active'),
            record('pending_payment', {palId: 'P2', productId: 'pal.p2'}),
          ],
        });
        let releaseUnfinished: ((txs: StoreTransaction[]) => void) | undefined;
        h.store.unfinished.mockImplementationOnce(
          () =>
            new Promise<StoreTransaction[]>(resolve => {
              releaseUnfinished = resolve;
            }),
        );
        h.store.currentEntitlements
          .mockResolvedValueOnce({ok, transactions: []})
          .mockResolvedValueOnce({ok: !ok, transactions: []});

        const recovering = h.purchases.recover();
        while (!releaseUnfinished) {
          await flush();
        }
        await h.purchases.installOwned(hubPal());
        releaseUnfinished([]);
        await recovering;

        expect(h.store.currentEntitlements).toHaveBeenCalledTimes(2);
        expect(h.api.refresh).toHaveBeenCalledTimes(ok ? 1 : 0);
        expect(h.purchases.recordFor('P2') === undefined).toBe(ok);
      },
    );

    it('iOS: still processes an unfinished transaction', async () => {
      setOS('ios');
      const h = createHarness({records: [record('unlocking')]});
      h.store.unfinished.mockResolvedValue([tx()]);
      failQuery(h);

      await h.purchases.recover();
      await h.purchases.drainQueue();

      expect(h.api.verify).toHaveBeenCalled();
      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('active');
      expect(h.api.refresh).not.toHaveBeenCalled();
    });
  });

  describe('stale pending payment', () => {
    it('Android: drops a pending record the store no longer lists', async () => {
      setOS('android');
      const h = createHarness({records: [record('pending_payment')]});
      await h.purchases.recover();
      expect(h.purchases.recordFor(PAL_ID)).toBeUndefined();
    });

    it('Android: keeps it while the store still lists the pending purchase', async () => {
      setOS('android');
      const h = createHarness({records: [record('pending_payment')]});
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [androidTx({state: 'pending', transactionId: undefined})],
      });
      await h.purchases.recover();
      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('pending_payment');
    });

    it('Android: judges the query by its own result, not a later one', async () => {
      setOS('android');
      const h = createHarness({
        records: [
          record('pending_payment', {palId: 'P2', productId: 'pal.p2'}),
        ],
      });
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [androidTx()],
      });
      h.api.verify.mockImplementation(async () => {
        h.store.currentEntitlements.mockResolvedValue({
          ok: false,
          transactions: [],
        });
        return [result('active')];
      });

      await h.purchases.recover();

      expect(h.api.verify).toHaveBeenCalled();
      expect(h.purchases.recordFor('P2')).toBeUndefined();
      expect(h.api.refresh).toHaveBeenCalled();
    });

    it('Android: keeps it when the store query failed', async () => {
      setOS('android');
      const h = createHarness({records: [record('pending_payment')]});
      h.store.currentEntitlements.mockResolvedValue({
        ok: false,
        transactions: [],
      });
      await h.purchases.recover();
      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('pending_payment');
    });

    it('iOS: keeps a declined Ask to Buy until it is 72 hours old', async () => {
      setOS('ios');
      const h = createHarness({
        records: [record('pending_payment', {pendingSince: 1_000})],
      });
      await h.purchases.recover();
      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('pending_payment');

      h.advance(STALE_PENDING_MS + 1);
      await h.purchases.recover();
      expect(h.purchases.recordFor(PAL_ID)).toBeUndefined();
    });

    it('iOS: an approval after pending moves the Pal to installed', async () => {
      setOS('ios');
      const h = createHarness({records: [record('pending_payment')]});
      h.store.emit(tx());
      await flush();
      await h.purchases.drainQueue();
      await flush();
      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('active');
    });
  });

  describe('held purchase', () => {
    const held = () => record('held_invalid', {supportCode: 'SUP-H'});
    const buyable = (h: ReturnType<typeof createHarness>) => {
      runInAction(() => {
        h.purchases.products.set(PRODUCT, {
          productId: PRODUCT,
          displayPrice: '$4.99',
        });
      });
      return h.purchases.canBuy(hubPal());
    };
    const refreshLists = (lists: {revoked?: string[]; removed?: string[]}) => ({
      changed: [],
      revoked: lists.revoked ?? [],
      removed: lists.removed ?? [],
      unchanged: [],
    });

    it('Android: clears it when a successful query no longer lists the product', async () => {
      setOS('android');
      const h = createHarness({records: [held()]});

      await h.purchases.recover();

      expect(h.purchases.recordFor(PAL_ID)).toBeUndefined();
      expect(h.storage.ledger()[PAL_ID]).toBeUndefined();
      expect(buyable(h)).toBe(true);
    });

    it('Android: keeps it when the store query failed', async () => {
      setOS('android');
      const h = createHarness({records: [held()]});
      h.store.currentEntitlements.mockResolvedValue({
        ok: false,
        transactions: [],
      });

      await h.purchases.recover();

      expect(h.purchases.recordFor(PAL_ID)).toEqual(held());
      expect(buyable(h)).toBe(false);
    });

    it('Android: keeps it while the query lists the purchase, without finishing or verifying', async () => {
      setOS('android');
      const h = createHarness({records: [held()]});
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [androidTx({unfinished: true})],
      });

      await h.purchases.recover();

      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('held_invalid');
      expect(h.store.finish).not.toHaveBeenCalled();
      expect(h.api.verify).not.toHaveBeenCalled();
    });

    it('iOS: keeps it when a successful query no longer lists the product', async () => {
      setOS('ios');
      const h = createHarness({records: [held()]});

      await h.purchases.recover();

      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('held_invalid');
    });

    it('Android: keeps a hold written after the query started', async () => {
      setOS('android');
      const h = createHarness({records: [held()]});
      h.api.verify.mockResolvedValueOnce([
        result('invalid', {palId: 'P2', supportCode: 'SUP-2'}),
      ]);
      h.store.currentEntitlements.mockImplementation(async () => {
        await h.purchases.processTransaction(
          androidTx({productId: 'pal.p2', transactionId: 'tx-2'}),
          {},
        );
        return {ok: true, transactions: []};
      });

      await h.purchases.recover();

      expect(h.purchases.recordFor('P2')?.status).toBe('held_invalid');
      expect(h.purchases.recordFor(PAL_ID)).toBeUndefined();
    });

    it.each(['revoked', 'removed'] as const)(
      'Android: leaves it as it is on a refresh %s',
      async list => {
        setOS('android');
        const h = createHarness({records: [held()]});
        h.store.currentEntitlements.mockResolvedValue({
          ok: true,
          transactions: [androidTx({unfinished: true})],
        });
        h.api.refresh.mockResolvedValue(refreshLists({[list]: [PAL_ID]}));

        await h.purchases.recover();

        expect(h.api.refresh).toHaveBeenCalled();
        expect(h.purchases.recordFor(PAL_ID)).toEqual(held());
      },
    );

    it.each([
      ['revoked', 'removed'],
      ['removed', 'unfulfillable'],
    ] as const)(
      'iOS: a refresh %s still moves it to %s',
      async (list, status) => {
        setOS('ios');
        const h = createHarness({records: [held()]});
        h.store.currentEntitlements.mockResolvedValue({
          ok: true,
          transactions: [tx({unfinished: false})],
        });
        h.api.refresh.mockResolvedValue(refreshLists({[list]: [PAL_ID]}));

        await h.purchases.recover();

        expect(h.purchases.recordFor(PAL_ID)?.status).toBe(status);
      },
    );
  });

  describe('backoff and retry', () => {
    it('retries a failed verify at 2, 4, 8, 16, 32 seconds, then every minute', async () => {
      jest.useFakeTimers();
      const h = createHarness();
      h.api.verify.mockRejectedValue(new Error('offline'));

      await h.purchases.processTransaction(tx(), {});
      expect(h.api.verify).toHaveBeenCalledTimes(1);

      for (const delay of [
        ...RETRY_DELAYS_MS,
        RETRY_STEADY_MS,
        RETRY_STEADY_MS,
      ]) {
        await jest.advanceTimersByTimeAsync(delay - 1);
        const before = h.api.verify.mock.calls.length;
        await jest.advanceTimersByTimeAsync(1);
        expect(h.api.verify.mock.calls.length).toBe(before + 1);
      }
      expect(h.purchases.recordFor(PRODUCT)?.status).toBe('unlocking');
    });

    it('stops retrying once verify succeeds', async () => {
      jest.useFakeTimers();
      const h = createHarness();
      h.api.verify.mockRejectedValueOnce(new Error('offline'));

      await h.purchases.processTransaction(tx(), {});
      await jest.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);
      const calls = h.api.verify.mock.calls.length;
      await jest.advanceTimersByTimeAsync(RETRY_STEADY_MS * 3);

      expect(h.api.verify.mock.calls.length).toBe(calls);
    });

    it('retries at once from the Retry button', async () => {
      const h = createHarness();
      runInAction(() => {
        h.palStore.cachedPalsHubPals.push(hubPal());
      });
      h.api.verify.mockRejectedValueOnce(new Error('offline'));
      await h.purchases.processTransaction(tx(), {});
      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('unlocking');

      await h.purchases.retry(PAL_ID);
      await h.purchases.drainQueue();

      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('active');
    });

    it('retries from the store list after a restart', async () => {
      setOS('android');
      const h = createHarness({records: [record('unlocking')]});
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [androidTx()],
      });

      await h.purchases.retry(PAL_ID);
      await h.purchases.drainQueue();

      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('active');
    });

    it('survives a restart with the network down, then unlocks when it returns', async () => {
      setOS('ios');
      const first = createHarness();
      runInAction(() => {
        first.palStore.cachedPalsHubPals.push(hubPal());
      });
      first.api.verify.mockRejectedValue(new Error('offline'));
      await first.purchases.processTransaction(tx(), {});
      first.purchases.stop();

      const relaunched = createHarness({storage: first.storage});
      relaunched.store.unfinished.mockResolvedValue([tx()]);
      relaunched.api.verify.mockRejectedValueOnce(new Error('offline'));
      await relaunched.purchases.recover();
      expect(relaunched.purchases.recordFor(PAL_ID)?.status).toBe('unlocking');

      await relaunched.purchases.recover();
      await relaunched.purchases.drainQueue();
      expect(relaunched.purchases.recordFor(PAL_ID)?.status).toBe('active');
    });
  });

  describe('unavailable verify result', () => {
    it('keeps an open record unlocking and retries it', async () => {
      jest.useFakeTimers();
      const h = createHarness({records: [record('unlocking')]});
      h.api.verify.mockResolvedValueOnce([result('unavailable')]);

      await h.purchases.processTransaction(tx(), {});
      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('unlocking');
      expect(h.store.finish).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);
      expect(h.api.verify).toHaveBeenCalledTimes(2);
      await h.purchases.drainQueue();
      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('active');
    });

    it.each(['active', 'granted', 'unfulfillable', 'removed'] as const)(
      'leaves a settled %s record unchanged',
      async status => {
        const h = createHarness({records: [record(status)]});
        h.palStore.pals.push(localPal());
        h.api.verify.mockResolvedValue([result('unavailable')]);

        await h.purchases.processTransaction(tx(), {settledVerify: true});

        expect(h.purchases.recordFor(PAL_ID)?.status).toBe(status);
        expect(h.palStore.deletePal).not.toHaveBeenCalled();
      },
    );
  });

  describe('start', () => {
    it('restores before init, subscribes, and recovers on foreground', async () => {
      const order: string[] = [];
      let onChange: ((state: string) => void) | undefined;
      const spy = jest
        .spyOn(AppState, 'addEventListener')
        .mockImplementation((_event, handler: any) => {
          onChange = handler;
          return {remove: jest.fn()} as any;
        });
      const h = createHarness();
      h.store.init.mockImplementation(async () => {
        order.push('init');
        return true;
      });

      await h.purchases.start({
        store: h.store,
        beforeInit: async () => {
          order.push('restore');
        },
      });
      expect(order).toEqual(['restore', 'init']);

      onChange?.('active');
      await flush();
      expect(h.store.init).toHaveBeenCalledTimes(2);

      await h.purchases.start();
      expect(h.store.init).toHaveBeenCalledTimes(2);
      spy.mockRestore();
    });

    it('waits for the Pal store before the first recovery', async () => {
      const h = createHarness();
      let release!: () => void;
      (h.palStore as any).ready = new Promise<void>(resolve => {
        release = resolve;
      });
      const started = h.purchases.start();
      await flush();
      expect(h.store.init).not.toHaveBeenCalled();
      release();
      await started;
      expect(h.store.init).toHaveBeenCalledTimes(1);
    });
  });
});
