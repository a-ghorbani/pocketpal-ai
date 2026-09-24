import {myPals} from '../myPals';
import type {LedgerRecord} from '../../../store/PurchaseStore';
import type {Pal} from '../../../types/pal';
import type {PalsHubPal} from '../../../types/palshub';

const hub = (id: string, title = `Hub ${id}`): PalsHubPal => ({
  type: 'palshub',
  id,
  creator_id: 'c',
  title,
  protection_level: 'reveal_on_purchase',
  price_cents: 499,
  allow_fork: true,
  created_at: '',
  updated_at: '',
});

const installed = (palshubId?: string, id = `local-${palshubId}`): Pal =>
  ({
    type: 'local',
    id,
    name: `Local ${id}`,
    palshub_id: palshubId,
    source: palshubId ? 'palshub' : 'local',
  }) as Pal;

const rec = (
  palId: string,
  status: LedgerRecord['status'] = 'active',
): LedgerRecord => ({
  palId,
  source: 'store',
  productId: `pal.${palId}`,
  transactionIds: [],
  status,
  title: `Snapshot ${palId}`,
  thumbnailUrl: `https://example.com/${palId}.png`,
  updatedAt: 1,
});

describe('myPals', () => {
  it('prefers the installed local card', () => {
    const result = myPals(
      [],
      [installed('p1')],
      [hub('p1')],
      [],
      [hub('p1')],
      [rec('p1')],
    );
    expect(result.installed.map(p => p.id)).toEqual(['local-p1']);
    expect(result.notInstalled).toEqual([]);
  });

  it('uses the listing card before the record snapshot', () => {
    const result = myPals([], [], [], [], [hub('p1', 'Listed')], [rec('p1')]);
    expect(result.notInstalled).toEqual([
      expect.objectContaining({id: 'p1', title: 'Listed'}),
    ]);
  });

  it('builds an owned snapshot card when nothing else lists the Pal', () => {
    const [card] = myPals(
      [],
      [],
      [],
      [],
      [],
      [rec('p1', 'granted')],
    ).notInstalled;
    expect(card).toMatchObject({
      type: 'palshub',
      id: 'p1',
      title: 'Snapshot p1',
      thumbnail_url: 'https://example.com/p1.png',
      price_cents: 1,
      is_owned: true,
    });
  });

  it('lists pending records but not as owned', () => {
    const [card] = myPals(
      [],
      [],
      [],
      [],
      [],
      [rec('p1', 'pending_payment')],
    ).notInstalled;
    expect(card.is_owned).toBe(false);
  });

  it.each(['unfulfillable', 'removed'] as const)(
    'excludes %s records',
    status => {
      expect(
        myPals([], [], [], [], [], [rec('p1', status)]).notInstalled,
      ).toEqual([]);
    },
  );

  it('shows one card for a store purchase also in the signed-in library', () => {
    const result = myPals([], [], [hub('p1')], [], [], [rec('p1')]);
    expect(result.notInstalled.map(p => p.id)).toEqual(['p1']);
  });

  it('dedupes library and created Pals', () => {
    const result = myPals([], [], [hub('p1')], [hub('p1'), hub('p2')], [], []);
    expect(result.notInstalled.map(p => p.id)).toEqual(['p1', 'p2']);
  });

  it('keeps store-owned Pals when signed out', () => {
    const result = myPals(
      [installed(undefined, 'mine')],
      [],
      [],
      [],
      [],
      [rec('p1')],
    );
    expect(result.installed.map(p => p.id)).toEqual(['mine']);
    expect(result.notInstalled.map(p => p.id)).toEqual(['p1']);
  });
});
