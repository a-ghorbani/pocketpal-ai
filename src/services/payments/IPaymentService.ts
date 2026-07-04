export type PurchasePlatform = 'ios' | 'android' | 'web';
export type PurchaseType = 'consumable' | 'non_consumable' | 'subscription';

export interface Product {
  id: string;
  title: string;
  description: string;
  price: string;
  priceAmountMicros: number;
  priceCurrencyCode: string;
  type: PurchaseType;
  localizedPrice: string;
}

export interface Purchase {
  productId: string;
  purchaseToken: string;
  transactionId: string;
  transactionDate: number;
  platform: PurchasePlatform;
  isAcknowledged: boolean;
  isConsumed: boolean;
  verificationData?: {
    source: string;
    verificationData: string;
  };
}

export interface PurchaseResult {
  success: boolean;
  purchase?: Purchase;
  error?: PurchaseError;
}

export type PurchaseErrorCode =
  | 'NOT_READY'
  | 'NOT_AVAILABLE'
  | 'PURCHASE_ERROR'
  | 'PURCHASE_TIMEOUT'
  | 'USER_CANCELLED'
  | 'ALREADY_OWNED';

export interface PurchaseError {
  code: PurchaseErrorCode;
  message: string;
  domain?: string;
}

export interface ReceiptValidationResult {
  valid: boolean;
  productId?: string;
  purchaseTime?: number;
  expirationTime?: number;
  autoRenewing?: boolean;
  error?: string;
}

export interface IPaymentService {
  isReady: boolean;

  initialize(): Promise<boolean>;

  getProducts(productIds: string[], type: PurchaseType): Promise<Product[]>;

  purchaseProduct(productId: string): Promise<PurchaseResult>;

  getPurchases(): Promise<Purchase[]>;

  finishTransaction(purchase: Purchase): Promise<boolean>;

  restorePurchases(): Promise<Purchase[]>;

  validateReceipt(purchase: Purchase): Promise<ReceiptValidationResult>;

  shutdown(): void;
}
