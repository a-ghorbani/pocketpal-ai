type ReactNativeIap = typeof import('react-native-iap');

export const {ErrorCode} = jest.requireActual<
  Pick<ReactNativeIap, 'ErrorCode'>
>('react-native-iap-actual-types');
export const {parseErrorStringToJsonObj} = jest.requireActual<
  Pick<ReactNativeIap, 'parseErrorStringToJsonObj'>
>('react-native-iap-actual-error');

export const initConnection = jest.fn(async () => true);
export const endConnection = jest.fn(async () => true);
export const fetchProducts = jest.fn(async () => []);
export const requestPurchase = jest.fn(async () => null);
export const getAvailablePurchases = jest.fn(async () => []);
export const getPendingTransactionsIOS = jest.fn(async () => []);
export const finishTransaction = jest.fn(async () => undefined);
export const acknowledgePurchaseAndroid = jest.fn(async () => true);
export const consumePurchaseAndroid = jest.fn(async () => true);
export const getStorefront = jest.fn(async () => 'USA');
export const syncIOS = jest.fn(async () => true);
export const purchaseUpdatedListener = jest.fn(() => ({remove: jest.fn()}));
export const purchaseErrorListener = jest.fn(() => ({remove: jest.fn()}));
