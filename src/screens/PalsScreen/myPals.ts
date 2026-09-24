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
  notInstalled: PalsHubPal[];
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

  const notInstalled: PalsHubPal[] = [];
  const add = (card: PalsHubPal) => {
    if (!seen.has(card.id)) {
      seen.add(card.id);
      notInstalled.push(card);
    }
  };
  const hubById = new Map(
    [...hub, ...library, ...created].map(pal => [pal.id, pal]),
  );

  library.forEach(add);
  created.forEach(add);
  records
    .filter(listed)
    .forEach(rec => add(hubById.get(rec.palId) ?? snapshotCard(rec)));

  return {installed, notInstalled};
};
