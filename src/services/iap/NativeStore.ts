import {Platform} from 'react-native';
import {
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  getPendingTransactionsIOS,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  syncIOS,
} from 'react-native-iap';
import type {Purchase, PurchaseError} from 'react-native-iap';

import {outcomeForErrorCode} from './storeOutcomes';
import type {Binding} from './iapWire';
import type {
  PurchaseOutcome,
  StorePort,
  StoreProduct,
  StoreTransaction,
} from './StorePort';

export const EARLIER_TRANSACTION_MS = 60_000;
export const PURCHASE_SETTLE_GRACE_MS = 5_000;

const toTransaction = (
  purchase: Purchase,
  unfinished: boolean,
): StoreTransaction | null => {
  const token = purchase.purchaseToken ?? undefined;
  if (!token) {
    return null;
  }
  const state =
    purchase.purchaseState === 'purchased' ? 'purchased' : 'pending';
  if (Platform.OS === 'ios') {
    return {
      productId: purchase.productId,
      transactionId: purchase.id,
      state,
      unfinished,
      proof: {platform: 'ios', jws: token},
      handle: purchase,
    };
  }
  return {
    productId: purchase.productId,
    transactionId:
      'transactionId' in purchase && purchase.transactionId
        ? purchase.transactionId
        : undefined,
    state,
    unfinished: false,
    proof: {
      platform: 'android',
      productId: purchase.productId,
      purchaseToken: token,
    },
    handle: purchase,
  };
};

const outcomeForPurchase = (
  purchase: Purchase,
  unfinished: boolean,
  startedAt: number,
): PurchaseOutcome | null => {
  const tx = toTransaction(purchase, unfinished);
  if (!tx) {
    return null;
  }
  if (tx.state === 'pending') {
    return {kind: 'pending'};
  }
  if (
    Platform.OS === 'ios' &&
    purchase.transactionDate < startedAt - EARLIER_TRANSACTION_MS
  ) {
    return {kind: 'already_owned'};
  }
  return {kind: 'purchased', tx};
};

const UNSETTLED_PURCHASE: PurchaseOutcome = {
  kind: 'error',
  code: 'unknown',
  downgrade: false,
};

const outcomeFromStoreIOS = async (
  productId: string,
  startedAt: number,
): Promise<PurchaseOutcome> => {
  let unfinished: Purchase[];
  let entitled: Purchase[];
  try {
    [unfinished, entitled] = await Promise.all([
      getPendingTransactionsIOS(),
      getAvailablePurchases({onlyIncludeActiveItemsIOS: true}),
    ]);
  } catch {
    return UNSETTLED_PURCHASE;
  }
  const candidates = [
    ...unfinished.map(purchase => ({purchase, unfinished: true})),
    ...entitled.map(purchase => ({purchase, unfinished: false})),
  ].filter(({purchase}) => purchase.productId === productId);
  for (const candidate of candidates) {
    const outcome = outcomeForPurchase(
      candidate.purchase,
      candidate.unfinished,
      startedAt,
    );
    if (outcome) {
      return outcome;
    }
  }
  return UNSETTLED_PURCHASE;
};

const errorCode = (error: unknown): string | undefined =>
  (error as Partial<PurchaseError> | undefined)?.code;

export class NativeStore implements StorePort {
  queryOk = false;

  async init(): Promise<boolean> {
    try {
      return (await initConnection()) === true;
    } catch {
      return false;
    }
  }

  async fetchProducts(productIds: string[]): Promise<StoreProduct[]> {
    if (productIds.length === 0) {
      return [];
    }
    const products = await fetchProducts({skus: productIds, type: 'in-app'});
    return (products ?? []).map(product => ({
      productId: product.id,
      displayPrice: product.displayPrice,
    }));
  }

  purchase(
    productId: string,
    binding: Binding | null,
  ): Promise<PurchaseOutcome> {
    const startedAt = Date.now();
    return new Promise(resolve => {
      let settled = false;
      let graceTimer: ReturnType<typeof setTimeout> | undefined;
      const subscriptions: Array<{remove: () => void}> = [];
      const settle = (outcome: PurchaseOutcome) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(graceTimer);
        subscriptions.forEach(subscription => subscription.remove());
        resolve(outcome);
      };
      subscriptions.push(
        purchaseUpdatedListener(
          purchase => {
            if (purchase.productId !== productId) {
              return;
            }
            const outcome = outcomeForPurchase(
              purchase,
              Platform.OS === 'ios',
              startedAt,
            );
            if (outcome) {
              settle(outcome);
            }
          },
          {dedupeTransactionIOS: false},
        ),
        purchaseErrorListener(error => {
          if (error.productId && error.productId !== productId) {
            return;
          }
          settle(outcomeForErrorCode(error.code));
        }),
      );
      requestPurchase({
        request: {
          apple: {
            sku: productId,
            ...(binding?.appAccountToken
              ? {appAccountToken: binding.appAccountToken}
              : {}),
          },
          google: {
            skus: [productId],
            ...(binding?.obfuscatedAccountId
              ? {obfuscatedAccountId: binding.obfuscatedAccountId}
              : {}),
          },
        },
        type: 'in-app',
      }).then(
        () => {
          if (settled || Platform.OS !== 'ios') {
            return;
          }
          graceTimer = setTimeout(() => {
            outcomeFromStoreIOS(productId, startedAt).then(settle);
          }, PURCHASE_SETTLE_GRACE_MS);
        },
        error => settle(outcomeForErrorCode(errorCode(error))),
      );
    });
  }

  async unfinished(): Promise<StoreTransaction[]> {
    if (Platform.OS !== 'ios') {
      return [];
    }
    const purchases = await getPendingTransactionsIOS();
    return purchases
      .map(purchase => toTransaction(purchase, true))
      .filter((tx): tx is StoreTransaction => tx !== null);
  }

  async currentEntitlements(): Promise<StoreTransaction[]> {
    try {
      const purchases = await getAvailablePurchases({
        onlyIncludeActiveItemsIOS: true,
      });
      this.queryOk = true;
      return purchases
        .map(purchase => toTransaction(purchase, false))
        .filter((tx): tx is StoreTransaction => tx !== null);
    } catch {
      this.queryOk = false;
      return [];
    }
  }

  async sync(): Promise<void> {
    if (Platform.OS === 'ios') {
      await syncIOS();
    }
  }

  async finish(tx: StoreTransaction): Promise<void> {
    if (Platform.OS !== 'ios') {
      return;
    }
    await finishTransaction({
      purchase: tx.handle as Purchase,
      isConsumable: false,
    });
  }

  onTransaction(listener: (tx: StoreTransaction) => void): () => void {
    const subscription = purchaseUpdatedListener(purchase => {
      const tx = toTransaction(purchase, Platform.OS === 'ios');
      if (tx) {
        listener(tx);
      }
    });
    return () => subscription.remove();
  }
}
