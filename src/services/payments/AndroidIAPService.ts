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
import { GOOGLE_PLAY_PUBLIC_KEY } from '@env';

const RSA_SHA256_ALGORITHM = 'RSA-SHA256';

function verifySignature(
  publicKeyPem: string,
  data: string,
  signature: string,
): boolean {
  try {
    const buffer = Buffer.from(data, 'utf8');
    const signatureBuffer = Buffer.from(signature, 'base64');

    const crypto = require('crypto');
    const verifier = crypto.createVerify(RSA_SHA256_ALGORITHM);
    verifier.update(buffer);

    let formattedKey = publicKeyPem;
    if (!formattedKey.startsWith('-----BEGIN PUBLIC KEY-----')) {
      formattedKey = '-----BEGIN PUBLIC KEY-----\n' + formattedKey + '\n-----END PUBLIC KEY-----';
    }

    return verifier.verify(formattedKey, signatureBuffer);
  } catch {
    return false;
  }
}

export class AndroidIAPService implements IPaymentService {
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

      // Register purchase event listeners so that purchase flows
      // resolve even when the purchase is delivered asynchronously
      // (e.g. pending transactions flushed on app launch).
      this.setupPurchaseListeners(RNIap);

      // Flush any pending transactions from previous sessions.
      try {
        const flushed = await RNIap.flushFailedPurchasesCachedAsPending();
        if (flushed && flushed.length > 0) {
          console.log(
            `[AndroidIAP] Flushed ${flushed.length} pending purchases`,
          );
        }
      } catch (flushError) {
        // Non-fatal: some devices don't have cached pending purchases.
        console.warn('[AndroidIAP] flushFailedPurchases error:', flushError);
      }

      this._isReady = true;
      console.log('[AndroidIAP] Initialized successfully');
      return true;
    } catch (error) {
      console.error('[AndroidIAP] Init failed:', error);
      return false;
    }
  }

  private setupPurchaseListeners(RNIap: any): void {
    // Clean up any existing listeners first.
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
        // Resolve all pending purchase promises with the error.
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

  async purchaseProduct(productId: string, isSubscription: boolean = false): Promise<PurchaseResult> {
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

      const availablePurchases = await this.getPurchases();
      const alreadyPurchased = availablePurchases.find(
        (p) => p.productId === productId && p.isAcknowledged,
      );
      if (alreadyPurchased) {
        return {
          success: true,
          purchase: alreadyPurchased,
        };
      }

      const purchasePromise = new Promise<PurchaseResult>((resolve) => {
        this.pendingPurchaseResolvers.set(productId, resolve);
        setTimeout(() => {
          if (this.pendingPurchaseResolvers.has(productId)) {
            this.pendingPurchaseResolvers.delete(productId);
            resolve({
              success: false,
              error: { code: 'PURCHASE_TIMEOUT', message: 'Purchase timed out' },
            });
          }
        }, 60000);
      });

      const requestFn = isSubscription
        ? RNIap.requestSubscription({ skus: [productId] })
        : RNIap.requestPurchase({ skus: [productId] });

      requestFn
        .then((result: any) => {
          if (result && !this.pendingPurchaseResolvers.has(productId)) {
            return;
          }
          if (result) {
            const resolver = this.pendingPurchaseResolvers.get(productId);
            if (resolver) {
              resolver({ success: true, purchase: this.mapPurchase(result) });
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
                error: { code: 'USER_CANCELLED', message: 'User cancelled purchase' },
              });
            } else if (error?.code === 'E_ALREADY_OWNED') {
              resolver({
                success: false,
                error: { code: 'ALREADY_OWNED', message: 'Product already owned' },
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
      console.error('[AndroidIAP] Purchase error:', error);

      if (error.code === 'E_USER_CANCELLED') {
        return {
          success: false,
          error: { code: 'USER_CANCELLED', message: 'User cancelled purchase' },
        };
      }

      if (error.code === 'E_ALREADY_OWNED') {
        return {
          success: false,
          error: { code: 'ALREADY_OWNED', message: 'Product already owned' },
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
      if (!GOOGLE_PLAY_PUBLIC_KEY) {
        console.warn('[AndroidIAP] GOOGLE_PLAY_PUBLIC_KEY not configured, skipping signature verification');
        return {
          valid: true,
          productId: purchase.productId,
          purchaseTime: purchase.transactionDate,
        };
      }

      const verificationData = purchase.verificationData;
      if (!verificationData || !verificationData.verificationData) {
        console.warn('[AndroidIAP] No verification data available');
        return {
          valid: true,
          productId: purchase.productId,
          purchaseTime: purchase.transactionDate,
        };
      }

      try {
        const parsed = JSON.parse(verificationData.verificationData);
        if (parsed.signedData && parsed.signature) {
          const isValid = verifySignature(
            GOOGLE_PLAY_PUBLIC_KEY,
            parsed.signedData,
            parsed.signature,
          );

          if (!isValid) {
            return {
              valid: false,
              error: 'Signature verification failed',
            };
          }

          const signedData = JSON.parse(parsed.signedData);
          return {
            valid: true,
            productId: signedData.productId || purchase.productId,
            purchaseTime: signedData.purchaseTime || purchase.transactionDate,
            expirationTime: signedData.purchaseTime
              ? signedData.purchaseTime + (signedData.purchaseState === 0 ? 0 : undefined)
              : undefined,
            autoRenewing: signedData.autoRenewing || false,
          };
        }
      } catch {
        console.warn('[AndroidIAP] Failed to parse verification data, skipping signature verification');
      }

      return {
        valid: true,
        productId: purchase.productId,
        purchaseTime: purchase.transactionDate,
      };
    } catch (error) {
      console.error('[AndroidIAP] Receipt validation failed:', error);
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
    this.removePurchaseListeners();
    this.pendingPurchaseResolvers.clear();
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
