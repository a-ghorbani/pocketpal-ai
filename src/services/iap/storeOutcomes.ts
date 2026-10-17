import type {PurchaseOutcome} from './StorePort';

const PENDING_CODES = new Set(['deferred-payment', 'pending']);
const OWNED_CODES = new Set(['already-owned', 'duplicate-purchase']);

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
  return {kind: 'error', code: normalized};
};
