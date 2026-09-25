export enum ErrorCode {
  AlreadyOwned = 'already-owned',
  BillingUnavailable = 'billing-unavailable',
  DeferredPayment = 'deferred-payment',
  DeveloperError = 'developer-error',
  DuplicatePurchase = 'duplicate-purchase',
  FeatureNotSupported = 'feature-not-supported',
  IapNotAvailable = 'iap-not-available',
  ItemUnavailable = 'item-unavailable',
  NetworkError = 'network-error',
  Pending = 'pending',
  ServiceError = 'service-error',
  SkuNotFound = 'sku-not-found',
  Unknown = 'unknown',
  UserCancelled = 'user-cancelled',
}

export const initConnection = jest.fn(async () => true);
export const endConnection = jest.fn(async () => true);
export const fetchProducts = jest.fn(async () => []);
export const requestPurchase = jest.fn(async () => null);
export const getAvailablePurchases = jest.fn(async () => []);
export const getPendingTransactionsIOS = jest.fn(async () => []);
export const finishTransaction = jest.fn(async () => undefined);
export const acknowledgePurchaseAndroid = jest.fn(async () => true);
export const consumePurchaseAndroid = jest.fn(async () => true);
export const syncIOS = jest.fn(async () => true);
export const purchaseUpdatedListener = jest.fn(() => ({remove: jest.fn()}));
export const purchaseErrorListener = jest.fn(() => ({remove: jest.fn()}));
