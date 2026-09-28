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

const v1 = () => hubPal({content_version: 3});
const v2 = (overrides: Partial<PalsHubPal> = {}) =>
  hubPal({
    content_version: 4,
    title: 'Story Pal 2',
    system_prompt: 'You tell tales.',
    ...overrides,
  });

const pending = (pal: PalsHubPal, changeNote?: string): PendingUpdate => ({
  pal,
  content: contentOf(pal),
  contentVersion: pal.content_version ?? 0,
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
        contentVersion: 3,
        title: 'Story Pal',
        pendingUpdate: {contentVersion: 4, changeNote: 'Typo fixed'},
      });
      expect(h.purchases.recordFor(PAL_ID)?.applied).toEqual(contentOf(v1()));
      expect(h.purchases.updateAvailable(PAL_ID)).toBe(true);
    });

    it('stores a newer settled verify version as pending', async () => {
      const h = installed();
      h.api.verify.mockResolvedValueOnce([
        result('active', {contentVersion: 4, pal: v2(), changeNote: 'Fix'}),
      ]);

      await h.purchases.processTransaction(tx(), {settledVerify: true});

      expect(h.palStore.applyCreatorUpdate).not.toHaveBeenCalled();
      expect(h.purchases.recordFor(PAL_ID)?.pendingUpdate).toMatchObject({
        contentVersion: 4,
        changeNote: 'Fix',
      });
    });

    it.each([
      ['an equal version', v2({content_version: 3})],
      ['a missing version', v2({content_version: undefined})],
      ['an older version', v2({content_version: 2})],
      ['a version without a prompt', v2({system_prompt: undefined})],
    ])('ignores %s', async (_label, pal) => {
      const h = installed();

      await refreshWith(h, [pal]);

      expect(h.purchases.recordFor(PAL_ID)).toMatchObject({contentVersion: 3});
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

      await refreshWith(h, [v2({content_version: 5, description: 'Tales'})]);

      expect(h.purchases.recordFor(PAL_ID)?.pendingUpdate?.contentVersion).toBe(
        5,
      );
      expect(h.purchases.recordFor(PAL_ID)?.applied).toEqual(contentOf(v1()));
    });

    it('does not rewrite the same pending version offered again', async () => {
      const h = installed({pendingUpdate: pending(v2())});
      const writes = h.storage.writes.length;

      await refreshWith(h, [v2()]);

      expect(h.storage.writes).toHaveLength(writes);
      expect(h.purchases.recordFor(PAL_ID)?.pendingUpdate?.contentVersion).toBe(
        4,
      );
    });

    it('does not take an older version over a pending one', async () => {
      const h = installed({pendingUpdate: pending(v2({content_version: 5}))});

      await refreshWith(h, [v2()]);

      expect(h.purchases.recordFor(PAL_ID)?.pendingUpdate?.contentVersion).toBe(
        5,
      );
    });

    it('advances silently and clears pending when nothing changed', async () => {
      const h = installed({pendingUpdate: pending(v2())});

      await refreshWith(h, [hubPal({content_version: 5})]);

      const rec = h.purchases.recordFor(PAL_ID);
      expect(rec?.contentVersion).toBe(5);
      expect(rec?.pendingUpdate).toBeUndefined();
      expect(h.purchases.updateAvailable(PAL_ID)).toBe(false);
      expect(h.palStore.applyCreatorUpdate).not.toHaveBeenCalled();
    });

    it('keeps sending the applied version while an update is pending', async () => {
      const h = installed({pendingUpdate: pending(v2())});

      await refreshWith(h, [v2()]);

      const [, known] = h.api.refresh.mock.calls[0];
      expect(known[PAL_ID].contentVersion).toBe(3);
    });
  });

  describe('apply', () => {
    it('writes only the changed fields and advances the applied snapshot', async () => {
      const h = installed({pendingUpdate: pending(v2())});

      await h.purchases.applyUpdate(PAL_ID, 4);

      expect(h.palStore.applyCreatorUpdate).toHaveBeenCalledTimes(1);
      const [localId, pal, fields] =
        h.palStore.applyCreatorUpdate.mock.calls[0];
      expect(localId).toBe('local-pal-1');
      expect(pal).toMatchObject({title: 'Story Pal 2'});
      expect([...fields]).toEqual(['title', 'system_prompt']);
      const rec = h.purchases.recordFor(PAL_ID);
      expect(rec).toMatchObject({contentVersion: 4, title: 'Story Pal 2'});
      expect(rec?.applied).toEqual(contentOf(v2()));
      expect(rec?.pendingUpdate).toBeUndefined();
      expect(h.purchases.updateAvailable(PAL_ID)).toBe(false);
    });

    it('treats every field as changed without an applied snapshot', async () => {
      const h = installed({applied: undefined, pendingUpdate: pending(v2())});

      await h.purchases.applyUpdate(PAL_ID, 4);

      const fields = h.palStore.applyCreatorUpdate.mock.calls[0][2];
      expect(fields.size).toBe(12);
    });

    it('applies once for two concurrent confirms', async () => {
      const h = installed({pendingUpdate: pending(v2())});

      await Promise.all([
        h.purchases.applyUpdate(PAL_ID, 4),
        h.purchases.applyUpdate(PAL_ID, 4),
      ]);

      expect(h.palStore.applyCreatorUpdate).toHaveBeenCalledTimes(1);
    });

    it('does nothing for a version the user did not see', async () => {
      const h = installed({pendingUpdate: pending(v2({content_version: 5}))});

      await h.purchases.applyUpdate(PAL_ID, 4);

      expect(h.palStore.applyCreatorUpdate).not.toHaveBeenCalled();
      expect(h.purchases.recordFor(PAL_ID)?.pendingUpdate?.contentVersion).toBe(
        5,
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

      await h.purchases.applyUpdate(PAL_ID, 4);

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

      await h.purchases.applyUpdate(PAL_ID, 4);

      expect(h.palStore.applyCreatorUpdate).not.toHaveBeenCalled();
    });

    it('re-applies the same fields after a crash before the ledger write', async () => {
      const h = installed({pendingUpdate: pending(v2())});
      h.storage.failOnWrite = 1;

      await expect(h.purchases.applyUpdate(PAL_ID, 4)).rejects.toThrow();

      const relaunched = createHarness({storage: h.storage});
      relaunched.palStore.pals.push(localPal());
      await relaunched.purchases.applyUpdate(PAL_ID, 4);

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
        grant: v2(),
        grantContent: contentOf(v2()),
        grantVersion: 4,
      });

    it('installs a new Pal with the full version as the applied snapshot', async () => {
      const h = createHarness({
        records: [
          {...grantV2(), applied: undefined, contentVersion: undefined},
        ],
      });

      await h.purchases.drainQueue();

      const rec = h.purchases.recordFor(PAL_ID);
      expect(rec).toMatchObject({status: 'active', contentVersion: 4});
      expect(rec?.applied).toEqual(contentOf(v2()));
      expect(rec?.pendingUpdate).toBeUndefined();
      expect(rec?.grantContent).toBeUndefined();
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
      expect(rec).toMatchObject({status: 'active', contentVersion: 4});
      expect(rec?.applied).toEqual(contentOf(v2()));
      expect(h.purchases.updateAvailable(PAL_ID)).toBe(false);
      expect(h.palStore.applyCreatorUpdate).not.toHaveBeenCalled();
    });

    it('offers a differing grant for an existing row and keeps its snapshot', async () => {
      const h = createHarness({records: [grantV2()]});
      h.palStore.pals.push(localPal());

      await h.purchases.drainQueue();

      const rec = h.purchases.recordFor(PAL_ID);
      expect(rec).toMatchObject({status: 'active', contentVersion: 3});
      expect(rec?.applied).toEqual(contentOf(v1()));
      expect(rec?.pendingUpdate?.contentVersion).toBe(4);
      expect(h.purchases.updateAvailable(PAL_ID)).toBe(true);
      expect(h.palStore.applyCreatorUpdate).not.toHaveBeenCalled();
    });

    it('advances the version for an equal grant on an existing row', async () => {
      const h = createHarness({
        records: [
          record('granted', {
            grant: hubPal(),
            grantContent: contentOf(hubPal()),
            grantVersion: 4,
          }),
        ],
      });
      h.palStore.pals.push(localPal());

      await h.purchases.drainQueue();

      const rec = h.purchases.recordFor(PAL_ID);
      expect(rec).toMatchObject({status: 'active', contentVersion: 4});
      expect(rec?.pendingUpdate).toBeUndefined();
    });

    it('clears a pending update when the user deleted the Pal and reinstalls', async () => {
      const h = createHarness({
        records: [record('active', {pendingUpdate: pending(v2())})],
      });
      expect(h.purchases.updateAvailable(PAL_ID)).toBe(false);
      h.store.currentEntitlements.mockResolvedValue([tx()]);
      h.api.verify.mockResolvedValueOnce([
        result('active', {contentVersion: 4, pal: v2()}),
      ]);

      await h.purchases.installOwned(v2());
      await flush();
      await h.purchases.drainQueue();

      const rec = h.purchases.recordFor(PAL_ID);
      expect(rec).toMatchObject({status: 'active', contentVersion: 4});
      expect(rec?.pendingUpdate).toBeUndefined();
      expect(h.palStore.installOwnedPal).toHaveBeenCalledTimes(1);
    });
  });

  describe('refund', () => {
    it('clears the pending update and keeps the applied snapshot', async () => {
      const h = installed({pendingUpdate: pending(v2())});
      h.api.refresh.mockResolvedValue({
        changed: [],
        revoked: [PAL_ID],
        removed: [],
        unchanged: [],
      });

      await h.purchases.recover();

      const rec = h.purchases.recordFor(PAL_ID);
      expect(rec?.status).toBe('removed');
      expect(rec?.pendingUpdate).toBeUndefined();
      expect(rec?.applied).toEqual(contentOf(v1()));
    });
  });
});
