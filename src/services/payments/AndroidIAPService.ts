import { Platform } from 'react-native';
import {
  IPaymentService,
  Product,
  Purchase,
  PurchaseResult,
  PurchaseError,
  ReceiptValidationResult,
  PurchaseType,
} from './IPaymentService';
import { PALSHUB_API_BASE_URL } from '@env';

export class AndroidIAPService implements IPaymentService {
  private _isReady: boolean = false;
  private purchaseUpdatedListener: any = null;
  private purchaseErrorListener: any = null;

  get isReady(): boolean {
    return this._isReady;
  }

  async initialize(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      console.warn('[AndroidIAP] Not on Android, skipping init');
      return false;
    }

    try {
      const RNIap = this.getRNIapModule();
      if (!RNIap) {
        console.warn('[AndroidIAP] react-native-iap not available');
        return false;
      }

      await RNIap.initConnection();
      this._isReady = true;
      console.log('[AndroidIAP] Initialized successfully');
      return true;
    } catch (error) {
      console.error('[AndroidIAP] Init failed:', error);
      return false;
    }
  }

  private getRNIapModule(): any {
    try {
      // Dynamic import so the app doesn't crash if the library isn't installed
      // @ts-ignore
      return require('react-native-iap');
    } catch (e) {
      return null;
    }
  }

  async getProducts(productIds: string[], type: PurchaseType): Promise<Product[]> {
    if (!this._isReady) {
      return [];
    }

    try {
      const RNIap = this.getRNIapModule();
      if (!RNIap) return [];

      let products: any[] = [];

      if (type === 'subscription') {
        products = await RNIap.getSubscriptions({ skus: productIds });
      } else {
        products = await RNIap.getProducts({ skus: productIds });
      }

      return products.map(p => ({
        id: p.productId || p.skus?.[0] || p.productIds?.[0] || p.id,
        title: p.title || p.name || '',
        description: p.description || p.localizedDescription || '',
        price: p.price || p.localizedPrice || '',
        priceAmountMicros: p.priceAmountMicros || 0,
        priceCurrencyCode: p.currency || p.priceCurrencyCode || 'USD',
        type,
        localizedPrice: p.localizedPrice || p.price || '',
      }));
    } catch (error) {
      console.error('[AndroidIAP] Failed to get products:', error);
      return [];
    }
  }

  async purchaseProduct(productId: string): Promise<PurchaseResult> {
    if (!this._isReady) {
      return {
        success: false,
        error: { code: 'NOT_READY', message: 'Payment service not initialized' },
      };
    }

    try {
      const RNIap = this.getRNIapModule();
      if (!RNIap) {
        return {
          success: false,
          error: { code: 'NOT_AVAILABLE', message: 'IAP module not available' },
        };
      }

      const result = await RNIap.requestPurchase({ sku: productId });

      if (result) {
        const purchase = this.mapPurchase(result);
        return { success: true, purchase };
      }

      return {
        success: false,
        error: { code: 'PURCHASE_FAILED', message: 'Purchase failed' },
      };
    } catch (error: any) {
      console.error('[AndroidIAP] Purchase error:', error);

      if (error.code === 'E_USER_CANCELLED') {
        return {
          success: false,
          error: { code: 'USER_CANCELLED', message: 'User cancelled purchase' },
        };
      }

      return {
        success: false,
        error: {
          code: error.code || 'PURCHASE_ERROR',
          message: error.message || 'Purchase failed',
        },
      };
    }
  }

  async getPurchases(): Promise<Purchase[]> {
    if (!this._isReady) return [];

    try {
      const RNIap = this.getRNIapModule();
      if (!RNIap) return [];

      const purchases = await RNIap.getAvailablePurchases();
      return purchases.map((p: any) => this.mapPurchase(p));
    } catch (error) {
      console.error('[AndroidIAP] Failed to get purchases:', error);
      return [];
    }
  }

  async finishTransaction(purchase: Purchase): Promise<boolean> {
    if (!this._isReady) return false;

    try {
      const RNIap = this.getRNIapModule();
      if (!RNIap) return false;

      if (!purchase.isAcknowledged) {
        await RNIap.finishTransaction({
          purchase,
          isConsumable: false,
        });
      }

      return true;
    } catch (error) {
      console.error('[AndroidIAP] Failed to finish transaction:', error);
      return false;
    }
  }

  async restorePurchases(): Promise<Purchase[]> {
    if (!this._isReady) return [];

    try {
      const RNIap = this.getRNIapModule();
      if (!RNIap) return [];

      const purchases = await RNIap.getAvailablePurchases();
      return purchases.map((p: any) => this.mapPurchase(p));
    } catch (error) {
      console.error('[AndroidIAP] Failed to restore purchases:', error);
      return [];
    }
  }

  async validateReceipt(purchase: Purchase): Promise<ReceiptValidationResult> {
    try {
      const response = await fetch(`${PALSHUB_API_BASE_URL}/api/payments/validate-android`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId: purchase.productId,
          purchaseToken: purchase.purchaseToken,
          receipt: purchase.verificationData?.verificationData,
        }),
      });

      if (!response.ok) {
        return {
          valid: false,
          error: `Validation failed: ${response.status}`,
        };
      }

      const data = await response.json();
      return {
        valid: data.valid || false,
        productId: data.productId,
        purchaseTime: data.purchaseTime,
        expirationTime: data.expirationTime,
        autoRenewing: data.autoRenewing,
      };
    } catch (error) {
      console.error('[AndroidIAP] Receipt validation failed:', error);
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  private mapPurchase(raw: any): Purchase {
    return {
      productId: raw.productId || raw.skus?.[0] || '',
      purchaseToken: raw.purchaseToken || raw.transactionReceipt || '',
      transactionId: raw.orderId || raw.transactionId || raw.transactionIdentifier || '',
      transactionDate: raw.transactionDate || raw.transactionTimestamp || Date.now(),
      platform: 'android',
      isAcknowledged: raw.isAcknowledged ?? false,
      isConsumed: false,
      verificationData: raw.transactionReceipt
        ? {
            source: 'google_play',
            verificationData: raw.transactionReceipt,
          }
        : undefined,
    };
  }

  shutdown(): void {
    try {
      const RNIap = this.getRNIapModule();
      if (RNIap) {
        RNIap.endConnection();
      }
      this._isReady = false;
      console.log('[AndroidIAP] Shut down');
    } catch (error) {
      console.error('[AndroidIAP] Shutdown error:', error);
    }
  }
}

let androidIapInstance: AndroidIAPService | null = null;

export function getAndroidIAPService(): AndroidIAPService {
  if (!androidIapInstance) {
    androidIapInstance = new AndroidIAPService();
  }
  return androidIapInstance;
}

export default AndroidIAPService;
