import {Platform} from 'react-native';
import {
  IPaymentService,
  Product,
  Purchase,
  PurchaseResult,
  PurchaseError,
  ReceiptValidationResult,
  PurchaseType,
} from './IPaymentService';

export class IOSIAPService implements IPaymentService {
  private _isReady: boolean = false;
  private purchaseUpdatedListener: any = null;
  private purchaseErrorListener: any = null;
  private pendingPurchaseResolvers: Map<
    string,
    (result: PurchaseResult) => void
  > = new Map();

  get isReady(): boolean {
    return this._isReady;
  }

  async initialize(): Promise<boolean> {
    if (Platform.OS !== 'ios') {
      console.warn('[iOSIAP] Not on iOS, skipping init');
      return false;
    }

    try {
      const RNIap = this.getRNIapModule();
      if (!RNIap) {
        console.warn('[iOSIAP] react-native-iap not available');
        return false;
      }

      await RNIap.initConnection();

      this.setupPurchaseListeners(RNIap);

      this._isReady = true;
      console.log('[iOSIAP] Initialized successfully');
      return true;
    } catch (error) {
      console.error('[iOSIAP] Init failed:', error);
      return false;
    }
  }

  private setupPurchaseListeners(RNIap: any): void {
    this.removePurchaseListeners();

    this.purchaseUpdatedListener = RNIap.purchaseUpdatedListener(
      (purchase: any) => {
        const productId =
          purchase.productId || purchase.skus?.[0] || '';
        const resolver = this.pendingPurchaseResolvers.get(productId);
        if (resolver) {
          resolver({success: true, purchase: this.mapPurchase(purchase)});
          this.pendingPurchaseResolvers.delete(productId);
        }
      },
    );

    this.purchaseErrorListener = RNIap.purchaseErrorListener(
      (error: any) => {
        for (const [, resolver] of this.pendingPurchaseResolvers) {
          resolver({
            success: false,
            error: {
              code: error.code || 'PURCHASE_ERROR',
              message: error.message || 'Purchase failed',
              domain: error.domain,
            },
          });
        }
        this.pendingPurchaseResolvers.clear();
      },
    );
  }

  private removePurchaseListeners(): void {
    if (this.purchaseUpdatedListener) {
      this.purchaseUpdatedListener.remove();
      this.purchaseUpdatedListener = null;
    }
    if (this.purchaseErrorListener) {
      this.purchaseErrorListener.remove();
      this.purchaseErrorListener = null;
    }
  }

  private getRNIapModule(): any {
    try {
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
        products = await RNIap.getSubscriptions({skus: productIds});
      } else {
        products = await RNIap.getProducts({skus: productIds});
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
      console.error('[iOSIAP] Failed to get products:', error);
      return [];
    }
  }

  async purchaseProduct(productId: string, isSubscription: boolean = false): Promise<PurchaseResult> {
    if (!this._isReady) {
      return {
        success: false,
        error: {code: 'NOT_READY', message: 'Payment service not initialized'},
      };
    }

    try {
      const RNIap = this.getRNIapModule();
      if (!RNIap) {
        return {
          success: false,
          error: {code: 'NOT_AVAILABLE', message: 'IAP module not available'},
        };
      }

      const purchasePromise = new Promise<PurchaseResult>((resolve) => {
        this.pendingPurchaseResolvers.set(productId, resolve);
        setTimeout(() => {
          if (this.pendingPurchaseResolvers.has(productId)) {
            this.pendingPurchaseResolvers.delete(productId);
            resolve({
              success: false,
              error: {code: 'PURCHASE_TIMEOUT', message: 'Purchase timed out'},
            });
          }
        }, 60000);
      });

      const requestFn = isSubscription
        ? RNIap.requestSubscription({skus: [productId]})
        : RNIap.requestPurchase({skus: [productId]});

      requestFn
        .then((result: any) => {
          if (result && !this.pendingPurchaseResolvers.has(productId)) {
            return;
          }
          if (result) {
            const resolver = this.pendingPurchaseResolvers.get(productId);
            if (resolver) {
              resolver({success: true, purchase: this.mapPurchase(result)});
              this.pendingPurchaseResolvers.delete(productId);
            }
          }
        })
        .catch((error: any) => {
          const resolver = this.pendingPurchaseResolvers.get(productId);
          if (resolver) {
            if (error?.code === 'E_USER_CANCELLED') {
              resolver({
                success: false,
                error: {code: 'USER_CANCELLED', message: 'User cancelled purchase'},
              });
            } else {
              resolver({
                success: false,
                error: {
                  code: error?.code || 'PURCHASE_ERROR',
                  message: error?.message || 'Purchase failed',
                },
              });
            }
            this.pendingPurchaseResolvers.delete(productId);
          }
        });

      return purchasePromise;
    } catch (error: any) {
      this.pendingPurchaseResolvers.delete(productId);
      console.error('[iOSIAP] Purchase error:', error);

      if (error.code === 'E_USER_CANCELLED') {
        return {
          success: false,
          error: {code: 'USER_CANCELLED', message: 'User cancelled purchase'},
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
      console.error('[iOSIAP] Failed to get purchases:', error);
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
      console.error('[iOSIAP] Failed to finish transaction:', error);
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
      console.error('[iOSIAP] Failed to restore purchases:', error);
      return [];
    }
  }

  async validateReceipt(purchase: Purchase): Promise<ReceiptValidationResult> {
    try {
      return {
        valid: true,
        productId: purchase.productId,
        purchaseTime: purchase.transactionDate,
      };
    } catch (error) {
      console.error('[iOSIAP] Receipt validation failed:', error);
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Validation error',
      };
    }
  }

  private mapPurchase(raw: any): Purchase {
    return {
      productId: raw.productId || raw.skus?.[0] || '',
      purchaseToken: raw.purchaseToken || raw.transactionReceipt || '',
      transactionId: raw.orderId || raw.transactionId || raw.transactionIdentifier || '',
      transactionDate: raw.transactionDate || raw.transactionTimestamp || Date.now(),
      platform: 'ios',
      isAcknowledged: raw.isAcknowledged ?? false,
      isConsumed: false,
      verificationData: raw.transactionReceipt
        ? {
            source: 'app_store',
            verificationData: raw.transactionReceipt,
          }
        : undefined,
    };
  }

  shutdown(): void {
    this.removePurchaseListeners();
    this.pendingPurchaseResolvers.clear();
    try {
      const RNIap = this.getRNIapModule();
      if (RNIap) {
        RNIap.endConnection();
      }
      this._isReady = false;
      console.log('[iOSIAP] Shut down');
    } catch (error) {
      console.error('[iOSIAP] Shutdown error:', error);
    }
  }
}

let iosIapInstance: IOSIAPService | null = null;

export function getIOSIAPService(): IOSIAPService {
  if (!iosIapInstance) {
    iosIapInstance = new IOSIAPService();
  }
  return iosIapInstance;
}

export default IOSIAPService;