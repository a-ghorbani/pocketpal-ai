import type {LedgerRecord} from '../../store/PurchaseStore';
import type {Pal} from '../../types/pal';
import type {PalsHubPal} from '../../types/palshub';

const snapshotCard = (rec: LedgerRecord): PalsHubPal => ({
  type: 'palshub',
  id: rec.palId,
  creator_id: '',
  title: rec.title,
  thumbnail_url: rec.thumbnailUrl,
  protection_level: 'reveal_on_purchase',
  price_cents: 1,
  allow_fork: false,
  created_at: '',
  updated_at: '',
  is_owned: rec.status === 'active' || rec.status === 'granted',
});

const listed = (rec: LedgerRecord) =>
  rec.status !== 'unfulfillable' && rec.status !== 'removed';

export interface MyPals {
  installed: Pal[];
  purchased: PalsHubPal[];
  library: PalsHubPal[];
}

export const myPals = (
  local: Pal[],
  downloaded: Pal[],
  library: PalsHubPal[],
  created: PalsHubPal[],
  hub: PalsHubPal[],
  records: LedgerRecord[],
): MyPals => {
  const seen = new Set<string>();
  const installed = [...local, ...downloaded].filter(pal => {
    if (!pal.palshub_id) {
      return true;
    }
    if (seen.has(pal.palshub_id)) {
      return false;
    }
    seen.add(pal.palshub_id);
    return true;
  });

  const collect = (cards: PalsHubPal[]) =>
    cards.filter(card => {
      if (seen.has(card.id)) {
        return false;
      }
      seen.add(card.id);
      return true;
    });
  const hubById = new Map(
    [...hub, ...library, ...created].map(pal => [pal.id, pal]),
  );

  const accountCards = collect([...library, ...created]);
  const purchased = collect(
    records
      .filter(listed)
      .map(rec => hubById.get(rec.palId) ?? snapshotCard(rec)),
  );

  return {installed, purchased, library: accountCards};
};
