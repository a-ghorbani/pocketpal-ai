import {Platform} from 'react-native';

import type {PendingUpdate} from '../PurchaseStore';
import {
  PAL_ID,
  changedPal,
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
import type {PalsHubPal} from '../../types/palshub';

jest.mock('../PalStore', () => ({
  palStore: {
    ready: Promise.resolve(),
    pals: [],
    userLibrary: [],
    cachedPalsHubPals: [],
  },
}));

const originalOS = Platform.OS;

const v1 = () => hubPal({updated_at: version(3)});
const v2 = (overrides: Partial<PalsHubPal> = {}) =>
  hubPal({
    updated_at: version(4),
    title: 'Story Pal 2',
    system_prompt: 'You tell tales.',
    ...overrides,
  });

const pending = (pal: PalsHubPal, changeNote?: string): PendingUpdate => ({
  pal,
  content: contentOf(pal),
  contentVersion: pal.updated_at!,
  ...(changeNote ? {changeNote} : {}),
});

const installed = (overrides: Parameters<typeof record>[1] = {}) => {
  const h = createHarness({records: [record('active', overrides)]});
  h.palStore.pals.push(localPal());
  return h;
};

const refreshWith = async (
  h: ReturnType<typeof createHarness>,
  pals: PalsHubPal[],
  note?: string,
) => {
  h.api.refresh.mockResolvedValue({
    changed: pals.map(pal => ({...changedPal(pal), changeNote: note})),
    revoked: [],
    removed: [],
    unchanged: [],
  });
  await h.purchases.recover();
};

describe('PurchaseStore creator updates', () => {
  beforeEach(() => {
    (Platform as any).OS = 'ios';
  });

  afterEach(() => {
    stopAll();
  });

  afterAll(() => {
    (Platform as any).OS = originalOS;
  });

  describe('offer', () => {
    it('stores a newer refresh version as pending and writes no Pal', async () => {
      const h = installed();

      await refreshWith(h, [v2()], 'Typo fixed');

      expect(h.palStore.applyCreatorUpdate).not.toHaveBeenCalled();
      expect(h.purchases.recordFor(PAL_ID)).toMatchObject({
        contentVersion: version(3),
        title: 'Story Pal',
        pendingUpdate: {contentVersion: version(4), changeNote: 'Typo fixed'},
      });
      expect(h.purchases.recordFor(PAL_ID)?.applied).toEqual(contentOf(v1()));
      expect(h.purchases.updateAvailable(PAL_ID)).toBe(true);
    });

    it('stores a newer settled verify version as pending', async () => {
      const h = installed();
      h.api.verify.mockResolvedValueOnce([
        result('active', {
          contentVersion: version(4),
          pal: v2(),
          changeNote: 'Fix',
        }),
      ]);

      await h.purchases.processTransaction(tx(), {settledVerify: true});

      expect(h.palStore.applyCreatorUpdate).not.toHaveBeenCalled();
      expect(h.purchases.recordFor(PAL_ID)?.pendingUpdate).toMatchObject({
        contentVersion: version(4),
        changeNote: 'Fix',
      });
    });

    it.each([
      ['an equal version', v2({updated_at: version(3)})],
      ['a version without a prompt', v2({system_prompt: undefined})],
    ])('ignores %s', async (_label, pal) => {
      const h = installed();

      await refreshWith(h, [pal]);

      expect(h.purchases.recordFor(PAL_ID)).toMatchObject({
        contentVersion: version(3),
      });
      expect(h.purchases.recordFor(PAL_ID)?.pendingUpdate).toBeUndefined();
    });

    it('ignores a Pal that is not installed', async () => {
      const h = createHarness({records: [record('active')]});

      await refreshWith(h, [v2()]);

      expect(h.purchases.recordFor(PAL_ID)?.pendingUpdate).toBeUndefined();
      expect(h.purchases.updateAvailable(PAL_ID)).toBe(false);
    });

    it('replaces a pending version with a newer one and keeps the applied base', async () => {
      const h = installed({pendingUpdate: pending(v2())});

      await refreshWith(h, [
        v2({updated_at: version(5), description: 'Tales'}),
      ]);

      expect(h.purchases.recordFor(PAL_ID)?.pendingUpdate?.contentVersion).toBe(
        version(5),
      );
      expect(h.purchases.recordFor(PAL_ID)?.applied).toEqual(contentOf(v1()));
    });

    it('does not rewrite the same pending version offered again', async () => {
      const h = installed({pendingUpdate: pending(v2())});
      const writes = h.storage.writes.length;

      await refreshWith(h, [v2()]);

      expect(h.storage.writes).toHaveLength(writes);
      expect(h.purchases.recordFor(PAL_ID)?.pendingUpdate?.contentVersion).toBe(
        version(4),
      );
    });

    it('advances silently and clears pending when nothing changed', async () => {
      const h = installed({pendingUpdate: pending(v2())});

      await refreshWith(h, [hubPal({updated_at: version(5)})]);

      const rec = h.purchases.recordFor(PAL_ID);
      expect(rec?.contentVersion).toBe(version(5));
      expect(rec?.pendingUpdate).toBeUndefined();
      expect(h.purchases.updateAvailable(PAL_ID)).toBe(false);
      expect(h.palStore.applyCreatorUpdate).not.toHaveBeenCalled();
    });

    it('offers a second creator update after the first one is applied', async () => {
      const h = installed();
      await refreshWith(h, [v2()]);
      await h.purchases.applyUpdate(PAL_ID, version(4));

      await refreshWith(h, [
        v2({updated_at: version(5), description: 'Tales'}),
      ]);

      const [, , known] = h.api.refresh.mock.calls[1];
      expect(known[PAL_ID].contentVersion).toBe(version(4));
      expect(h.purchases.recordFor(PAL_ID)).toMatchObject({
        contentVersion: version(4),
        pendingUpdate: {contentVersion: version(5)},
      });
      expect(h.purchases.updateAvailable(PAL_ID)).toBe(true);
    });

    it('records the version of an unchanged Pal it had no version for', async () => {
      const h = installed({contentVersion: undefined});

      await refreshWith(h, [hubPal({updated_at: version(5)})]);

      const [, , known] = h.api.refresh.mock.calls[0];
      expect(known[PAL_ID].contentVersion).toBeUndefined();
      const rec = h.purchases.recordFor(PAL_ID);
      expect(rec?.contentVersion).toBe(version(5));
      expect(rec?.pendingUpdate).toBeUndefined();
      expect(h.purchases.updateAvailable(PAL_ID)).toBe(false);
      expect(h.palStore.applyCreatorUpdate).not.toHaveBeenCalled();
    });

    it('sends the pending version while a declined update is pending', async () => {
      const h = installed({
        contentVersion: version(2),
        pendingUpdate: pending(v2({updated_at: version(3)})),
      });

      await refreshWith(h, []);

      const [, , known] = h.api.refresh.mock.calls[0];
      expect(known[PAL_ID].contentVersion).toBe(version(3));
      expect(h.purchases.recordFor(PAL_ID)?.contentVersion).toBe(version(2));
    });

    it('sends the applied version without a pending update', async () => {
      const h = installed({contentVersion: version(2)});

      await refreshWith(h, []);

      const [, , known] = h.api.refresh.mock.calls[0];
      expect(known[PAL_ID].contentVersion).toBe(version(2));
    });
  });

  describe('apply', () => {
    it('writes only the changed fields and advances the applied snapshot', async () => {
      const h = installed({pendingUpdate: pending(v2())});

      await h.purchases.applyUpdate(PAL_ID, version(4));

      expect(h.palStore.applyCreatorUpdate).toHaveBeenCalledTimes(1);
      const [localId, pal, fields] =
        h.palStore.applyCreatorUpdate.mock.calls[0];
      expect(localId).toBe('local-pal-1');
      expect(pal).toMatchObject({title: 'Story Pal 2'});
      expect([...fields]).toEqual(['title', 'system_prompt']);
      const rec = h.purchases.recordFor(PAL_ID);
      expect(rec).toMatchObject({
        contentVersion: version(4),
        title: 'Story Pal 2',
      });
      expect(rec?.applied).toEqual(contentOf(v2()));
      expect(rec?.pendingUpdate).toBeUndefined();
      expect(h.purchases.updateAvailable(PAL_ID)).toBe(false);
    });

    it('keeps the old thumbnail as applied when its download fails', async () => {
      const oldThumb = 'https://example.com/v1.png';
      const newThumb = 'https://example.com/v2.png';
      const h = installed({
        applied: contentOf(hubPal({thumbnail_url: oldThumb})),
        thumbnailUrl: oldThumb,
        pendingUpdate: pending(v2({thumbnail_url: newThumb})),
      });
      h.palStore.applyCreatorUpdate.mockResolvedValueOnce({
        thumbnailFailed: true,
      });

      await h.purchases.applyUpdate(PAL_ID, version(4));

      const rec = h.purchases.recordFor(PAL_ID);
      expect(rec?.contentVersion).toBe(version(4));
      expect(rec?.applied?.title).toBe('Story Pal 2');
      expect(rec?.applied?.thumbnail_url).toBe(oldThumb);
      expect(rec?.thumbnailUrl).toBe(oldThumb);

      await refreshWith(h, [
        v2({updated_at: version(5), thumbnail_url: newThumb}),
      ]);
      await h.purchases.applyUpdate(PAL_ID, version(5));

      expect([...h.palStore.applyCreatorUpdate.mock.calls[1][2]]).toEqual([
        'thumbnail_url',
      ]);
      expect(h.purchases.recordFor(PAL_ID)?.applied?.thumbnail_url).toBe(
        newThumb,
      );
    });

    it('treats every field as changed without an applied snapshot', async () => {
      const h = installed({applied: undefined, pendingUpdate: pending(v2())});

      await h.purchases.applyUpdate(PAL_ID, version(4));

      const fields = h.palStore.applyCreatorUpdate.mock.calls[0][2];
      expect(fields.size).toBe(12);
    });

    it('applies once for two concurrent confirms', async () => {
      const h = installed({pendingUpdate: pending(v2())});

      await Promise.all([
        h.purchases.applyUpdate(PAL_ID, version(4)),
        h.purchases.applyUpdate(PAL_ID, version(4)),
      ]);

      expect(h.palStore.applyCreatorUpdate).toHaveBeenCalledTimes(1);
    });

    it('does nothing for a version the user did not see', async () => {
      const h = installed({
        pendingUpdate: pending(v2({updated_at: version(5)})),
      });

      await h.purchases.applyUpdate(PAL_ID, version(4));

      expect(h.palStore.applyCreatorUpdate).not.toHaveBeenCalled();
      expect(h.purchases.recordFor(PAL_ID)?.pendingUpdate?.contentVersion).toBe(
        version(5),
      );
    });

    it.each([
      ['no pending update', {}],
      [
        'a removed record',
        {status: 'removed' as const, pendingUpdate: pending(v2())},
      ],
    ])('does nothing with %s', async (_label, overrides) => {
      const h = installed(overrides);

      await h.purchases.applyUpdate(PAL_ID, version(4));

      expect(h.palStore.applyCreatorUpdate).not.toHaveBeenCalled();
    });

    it('does nothing after a refund arrives', async () => {
      const h = installed({pendingUpdate: pending(v2())});
      h.api.refresh.mockResolvedValue({
        changed: [],
        revoked: [PAL_ID],
        removed: [],
        unchanged: [],
      });
      await h.purchases.recover();

      await h.purchases.applyUpdate(PAL_ID, version(4));

      expect(h.palStore.applyCreatorUpdate).not.toHaveBeenCalled();
    });

    it('re-applies the same fields after a crash before the ledger write', async () => {
      const h = installed({pendingUpdate: pending(v2())});
      h.storage.failOnWrite = 1;

      await expect(
        h.purchases.applyUpdate(PAL_ID, version(4)),
      ).rejects.toThrow();

      const relaunched = createHarness({storage: h.storage});
      relaunched.palStore.pals.push(localPal());
      await relaunched.purchases.applyUpdate(PAL_ID, version(4));

      expect(relaunched.palStore.applyCreatorUpdate.mock.calls[0][2]).toEqual(
        h.palStore.applyCreatorUpdate.mock.calls[0][2],
      );
      expect(relaunched.storage.ledger()[PAL_ID].pendingUpdate).toBeUndefined();
    });

    it('keeps the pending update when the user declines', async () => {
      const h = installed({pendingUpdate: pending(v2())});

      await refreshWith(h, [v2()]);

      expect(h.palStore.applyCreatorUpdate).not.toHaveBeenCalled();
      expect(h.purchases.updateAvailable(PAL_ID)).toBe(true);
      expect(h.purchases.isOwned(PAL_ID)).toBe(true);
    });
  });

  describe('grant', () => {
    const grantV2 = () =>
      record('granted', {
        grant: {
          pal: v2(),
          content: contentOf(v2()),
          contentVersion: version(4),
        },
      });

    it('installs a new Pal with the full version as the applied snapshot', async () => {
      const h = createHarness({
        records: [
          {...grantV2(), applied: undefined, contentVersion: undefined},
        ],
      });

      await h.purchases.drainQueue();

      const rec = h.purchases.recordFor(PAL_ID);
      expect(rec).toMatchObject({status: 'active', contentVersion: version(4)});
      expect(rec?.applied).toEqual(contentOf(v2()));
      expect(rec?.pendingUpdate).toBeUndefined();
      expect(rec?.grant).toBeUndefined();
    });

    it('adopts an existing row without a snapshot as the grant version', async () => {
      const h = createHarness({
        records: [
          {...grantV2(), applied: undefined, contentVersion: undefined},
        ],
      });
      h.palStore.pals.push(localPal());

      await h.purchases.drainQueue();

      const rec = h.purchases.recordFor(PAL_ID);
      expect(rec).toMatchObject({status: 'active', contentVersion: version(4)});
      expect(rec?.applied).toEqual(contentOf(v2()));
      expect(h.purchases.updateAvailable(PAL_ID)).toBe(false);
      expect(h.palStore.applyCreatorUpdate).not.toHaveBeenCalled();
    });

    it('offers a differing grant for an existing row and keeps its snapshot', async () => {
      const h = createHarness({records: [grantV2()]});
      h.palStore.pals.push(localPal());

      await h.purchases.drainQueue();

      const rec = h.purchases.recordFor(PAL_ID);
      expect(rec).toMatchObject({status: 'active', contentVersion: version(3)});
      expect(rec?.applied).toEqual(contentOf(v1()));
      expect(rec?.pendingUpdate?.contentVersion).toBe(version(4));
      expect(h.purchases.updateAvailable(PAL_ID)).toBe(true);
      expect(h.palStore.applyCreatorUpdate).not.toHaveBeenCalled();
    });

    it('keeps the change note when a grant becomes the pending update', async () => {
      const h = createHarness({
        records: [
          record('granted', {
            grant: {
              pal: v2(),
              content: contentOf(v2()),
              contentVersion: version(4),
              changeNote: 'Fixed the greeting',
            },
          }),
        ],
      });
      h.palStore.pals.push({...localPal(), name: 'My edit'});

      await h.purchases.drainQueue();

      const rec = h.purchases.recordFor(PAL_ID);
      expect(rec?.pendingUpdate).toMatchObject({
        contentVersion: version(4),
        changeNote: 'Fixed the greeting',
      });
      expect(rec?.grant).toBeUndefined();
    });

    it('stores the verify change note with the grant', async () => {
      const h = createHarness();
      h.api.verify.mockResolvedValue([
        result('active', {changeNote: 'Fixed the greeting'}),
      ]);
      h.palStore.installOwnedPal.mockRejectedValueOnce(new Error('db'));

      await h.purchases.processTransaction(tx(), {});
      await flush();

      expect(h.purchases.recordFor(PAL_ID)?.grant).toMatchObject({
        contentVersion: version(3),
        changeNote: 'Fixed the greeting',
      });
    });

    it('advances the version for an equal grant on an existing row', async () => {
      const h = createHarness({
        records: [
          record('granted', {
            grant: {
              pal: hubPal(),
              content: contentOf(hubPal()),
              contentVersion: version(4),
            },
          }),
        ],
      });
      h.palStore.pals.push(localPal());

      await h.purchases.drainQueue();

      const rec = h.purchases.recordFor(PAL_ID);
      expect(rec).toMatchObject({status: 'active', contentVersion: version(4)});
      expect(rec?.pendingUpdate).toBeUndefined();
    });

    it('clears a pending update when the user deleted the Pal and reinstalls', async () => {
      const h = createHarness({
        records: [record('active', {pendingUpdate: pending(v2())})],
      });
      expect(h.purchases.updateAvailable(PAL_ID)).toBe(false);
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [tx()],
      });
      h.api.verify.mockResolvedValueOnce([
        result('active', {contentVersion: version(4), pal: v2()}),
      ]);

      await h.purchases.installOwned(v2());
      await flush();
      await h.purchases.drainQueue();

      const rec = h.purchases.recordFor(PAL_ID);
      expect(rec).toMatchObject({status: 'active', contentVersion: version(4)});
      expect(rec?.pendingUpdate).toBeUndefined();
      expect(h.palStore.installOwnedPal).toHaveBeenCalledTimes(1);
    });
  });

  describe('refund', () => {
    const refundOnRefresh = (h: ReturnType<typeof createHarness>) =>
      h.api.refresh.mockResolvedValue({
        changed: [],
        revoked: [PAL_ID],
        removed: [],
        unchanged: [],
      });

    it('keeps the applied snapshot when the signed-in library keeps the Pal', async () => {
      const h = createHarness({
        records: [record('active', {pendingUpdate: pending(v2())})],
        signedIn: true,
      });
      h.palStore.pals.push(localPal());
      h.palStore.userLibrary.push(hubPal());
      refundOnRefresh(h);

      await h.purchases.recover();

      const rec = h.purchases.recordFor(PAL_ID);
      expect(rec?.status).toBe('removed');
      expect(rec?.pendingUpdate).toBeUndefined();
      expect(rec?.applied).toEqual(contentOf(v1()));
      expect(h.palStore.deletePal).not.toHaveBeenCalled();
    });

    it('clears the applied snapshot when signed out', async () => {
      const h = installed({pendingUpdate: pending(v2())});
      refundOnRefresh(h);

      await h.purchases.recover();

      const rec = h.purchases.recordFor(PAL_ID);
      expect(rec?.status).toBe('removed');
      expect(rec?.pendingUpdate).toBeUndefined();
      expect(rec?.applied).toBeUndefined();
      expect(h.storage.ledger()[PAL_ID].applied).toBeUndefined();
    });

    it('clears the applied snapshot when no local Pal exists', async () => {
      const h = createHarness({records: [record('active')], signedIn: true});
      h.palStore.userLibrary.push(hubPal());
      refundOnRefresh(h);

      await h.purchases.recover();

      expect(h.purchases.recordFor(PAL_ID)?.applied).toBeUndefined();
    });

    it('installs the full version when a cleared tombstone is revived', async () => {
      const h = createHarness({
        records: [record('removed', {applied: undefined})],
      });
      h.palStore.pals.push(localPal());
      h.api.verify.mockResolvedValueOnce([
        result('active', {contentVersion: version(4), pal: v2()}),
      ]);

      await h.purchases.processTransaction(tx(), {settledVerify: true});
      await h.purchases.drainQueue();

      const rec = h.purchases.recordFor(PAL_ID);
      expect(rec).toMatchObject({status: 'active', contentVersion: version(4)});
      expect(rec?.applied).toEqual(contentOf(v2()));
      expect(rec?.pendingUpdate).toBeUndefined();
    });
  });

  describe('removal', () => {
    const refreshLists = (lists: {revoked?: string[]; removed?: string[]}) => ({
      changed: [],
      revoked: lists.revoked ?? [],
      removed: lists.removed ?? [],
      unchanged: [],
    });

    it('withdraws an iOS purchase whose verify says removed and finishes it', async () => {
      const h = createHarness({records: [record('unlocking')]});
      h.api.verify.mockResolvedValueOnce([result('removed')]);

      await h.purchases.processTransaction(tx(), {});

      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('unfulfillable');
      expect(h.store.finish).toHaveBeenCalledTimes(1);
    });

    it.each(['revoked', 'removed'] as const)(
      'keeps an unfulfillable record on a later %s',
      async list => {
        const h = createHarness({
          records: [record('unfulfillable', {supportCode: 'SUP-7'})],
        });
        h.api.refresh.mockResolvedValue(refreshLists({[list]: [PAL_ID]}));
        h.store.currentEntitlements.mockResolvedValue({
          ok: true,
          transactions: [tx({unfinished: false})],
        });

        await h.purchases.recover();

        expect(h.purchases.recordFor(PAL_ID)).toMatchObject({
          status: 'unfulfillable',
          supportCode: 'SUP-7',
        });
      },
    );

    it.each([
      ['an open', 'unlocking', undefined],
      ['a delivered', 'active', true],
      ['a granted', 'granted', true],
    ] as const)(
      'marks whether %s record was withdrawn after delivery',
      async (_label, status, delivered) => {
        const h = createHarness({records: [record(status)]});
        h.api.verify.mockResolvedValueOnce([result('removed')]);

        await h.purchases.processTransaction(tx(), {settledVerify: true});

        const rec = h.purchases.recordFor(PAL_ID);
        expect(rec?.status).toBe('unfulfillable');
        expect(rec?.withdrawnAfterDelivery).toBe(delivered);
      },
    );

    it('leaves a verify-time unfulfillable unmarked', async () => {
      const h = createHarness({records: [record('unlocking')]});
      h.api.verify.mockResolvedValueOnce([result('unfulfillable')]);

      await h.purchases.processTransaction(tx(), {});

      expect(h.purchases.recordFor(PAL_ID)?.withdrawnAfterDelivery).toBe(
        undefined,
      );
    });

    it('never verifies an unfulfillable record', async () => {
      const h = createHarness({records: [record('unfulfillable')]});

      await h.purchases.processTransaction(tx(), {settledVerify: true});

      expect(h.api.verify).not.toHaveBeenCalled();
      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('unfulfillable');
    });

    it.each(['revoked', 'removed'] as const)(
      'leaves a refund tombstone as it is on a verify %s',
      async status => {
        const h = createHarness({records: [record('removed')]});
        h.api.verify.mockResolvedValueOnce([result(status)]);

        await h.purchases.processTransaction(tx(), {settledVerify: true});

        expect(h.purchases.recordFor(PAL_ID)?.status).toBe('removed');
      },
    );

    it('leaves a refund tombstone as it is on a refresh removed', async () => {
      const h = createHarness({records: [record('removed')]});
      h.api.refresh.mockResolvedValue(refreshLists({removed: [PAL_ID]}));
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [tx({unfinished: false})],
      });

      await h.purchases.recover();

      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('removed');
    });

    it('Android: withdraws an installed Pal without finishing', async () => {
      (Platform as any).OS = 'android';
      const h = installed({pendingUpdate: pending(v2())});
      h.api.refresh.mockResolvedValue(refreshLists({removed: [PAL_ID]}));

      await h.purchases.recover();

      const rec = h.purchases.recordFor(PAL_ID);
      expect(rec).toMatchObject({
        status: 'unfulfillable',
        supportCode: 'SUP-0',
        withdrawnAfterDelivery: true,
      });
      expect(rec?.pendingUpdate).toBeUndefined();
      expect(rec?.applied).toBeUndefined();
      expect(h.palStore.deletePal).toHaveBeenCalledWith('local-pal-1');
      expect(h.store.finish).not.toHaveBeenCalled();
      expect(h.purchases.storeOwnedRecords).toHaveLength(1);
    });

    it('keeps the local copy of a withdrawn Pal the signed-in library lists', async () => {
      const h = createHarness({records: [record('active')], signedIn: true});
      h.palStore.pals.push(localPal());
      h.palStore.userLibrary.push(hubPal());
      h.api.refresh.mockResolvedValue(refreshLists({removed: [PAL_ID]}));

      await h.purchases.recover();

      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('unfulfillable');
      expect(h.purchases.recordFor(PAL_ID)?.applied).toBeUndefined();
      expect(h.palStore.deletePal).not.toHaveBeenCalled();
    });

    it('keeps a Pal the store still verifies and the listing no longer shows', async () => {
      const h = installed();
      h.store.currentEntitlements.mockResolvedValue({
        ok: true,
        transactions: [tx({unfinished: false})],
      });
      h.api.refresh.mockResolvedValue(refreshLists({}));

      await h.purchases.recover();
      await h.purchases.processTransaction(tx(), {settledVerify: true});

      expect(h.purchases.recordFor(PAL_ID)?.status).toBe('active');
      expect(h.palStore.deletePal).not.toHaveBeenCalled();
      expect(h.purchases.isOwned(PAL_ID)).toBe(true);
    });
  });
});
