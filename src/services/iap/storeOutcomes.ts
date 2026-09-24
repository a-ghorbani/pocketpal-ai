import type {PurchaseOutcome} from './StorePort';

const PENDING_CODES = new Set(['deferred-payment', 'pending']);
const OWNED_CODES = new Set(['already-owned', 'duplicate-purchase']);
const DOWNGRADE_CODES = new Set([
  'billing-unavailable',
  'iap-not-available',
  'developer-error',
  'feature-not-supported',
  'item-unavailable',
  'sku-not-found',
]);

export const outcomeForErrorCode = (
  code: string | undefined,
): PurchaseOutcome => {
  const normalized = code ?? 'unknown';
  if (normalized === 'user-cancelled') {
    return {kind: 'cancelled'};
  }
  if (PENDING_CODES.has(normalized)) {
    return {kind: 'pending'};
  }
  if (OWNED_CODES.has(normalized)) {
    return {kind: 'already_owned'};
  }
  return {
    kind: 'error',
    code: normalized,
    downgrade: DOWNGRADE_CODES.has(normalized),
  };
};
