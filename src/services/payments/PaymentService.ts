import { Platform } from 'react-native';
import {
  IPaymentService,
  Product,
  Purchase,
  PurchaseResult,
  ReceiptValidationResult,
  PurchaseType,
} from './IPaymentService';
import { AndroidIAPService, getAndroidIAPService } from './AndroidIAPService';
import { getMockPaymentService } from './MockPaymentService';
import { PALSHUB_API_BASE_URL } from '@env';

export type PaymentPlatform = 'auto' | 'ios' | 'android' | 'web';

export interface PaymentServiceConfig {
  platform?: PaymentPlatform;
  apiBaseUrl?: string;
}

export class PaymentService implements IPaymentService {
  private innerService: IPaymentService;
  private config: PaymentServiceConfig;

  constructor(config: PaymentServiceConfig = {}) {
    this.config = config;
    this.innerService = this.createInnerService();
  }

  private createInnerService(): IPaymentService {
    const platform = this.config.platform || 'auto';

    if (platform === 'android' || (platform === 'auto' && Platform.OS === 'android')) {
      return getAndroidIAPService();
    }

    return getMockPaymentService();
  }

  get isReady(): boolean {
    return this.innerService.isReady;
  }

  async initialize(): Promise<boolean> {
    return this.innerService.initialize();
  }

  async getProducts(productIds: string[], type: PurchaseType): Promise<Product[]> {
    return this.innerService.getProducts(productIds, type);
  }

  async purchaseProduct(productId: string): Promise<PurchaseResult> {
    const result = await this.innerService.purchaseProduct(productId);

    if (result.success && result.purchase) {
      try {
        const validation = await this.validateReceipt(result.purchase);
        if (validation.valid) {
          await this.finishTransaction(result.purchase);
        }
      } catch (error) {
        console.warn('[PaymentService] Post-purchase processing failed:', error);
      }
    }

    return result;
  }

  async getPurchases(): Promise<Purchase[]> {
    return this.innerService.getPurchases();
  }

  async finishTransaction(purchase: Purchase): Promise<boolean> {
    return this.innerService.finishTransaction(purchase);
  }

  async restorePurchases(): Promise<Purchase[]> {
    return this.innerService.restorePurchases();
  }

  async validateReceipt(purchase: Purchase): Promise<ReceiptValidationResult> {
    return this.innerService.validateReceipt(purchase);
  }

  async validateReceiptOnServer(
    purchase: Purchase,
    userId: string
  ): Promise<ReceiptValidationResult> {
    try {
      const response = await fetch(`${PALSHUB_API_BASE_URL}/api/payments/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          platform: purchase.platform,
          productId: purchase.productId,
          purchaseToken: purchase.purchaseToken,
          transactionId: purchase.transactionId,
          receiptData: purchase.verificationData?.verificationData,
        }),
      });

      if (!response.ok) {
        return {
          valid: false,
          error: `Server validation failed: ${response.status}`,
        };
      }

      const data = await response.json();
      return {
        valid: data.valid || false,
        productId: data.productId,
        purchaseTime: data.purchaseTime,
        expirationTime: data.expirationTime,
        autoRenewing: data.autoRenewing,
        error: data.error,
      };
    } catch (error) {
      console.error('[PaymentService] Server validation failed:', error);
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  shutdown(): void {
    this.innerService.shutdown();
  }
}

let paymentServiceInstance: PaymentService | null = null;

export function getPaymentService(config?: PaymentServiceConfig): PaymentService {
  if (!paymentServiceInstance) {
    paymentServiceInstance = new PaymentService(config);
  }
  return paymentServiceInstance;
}

export default PaymentService;
