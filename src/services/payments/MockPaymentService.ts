import {
  IPaymentService,
  Product,
  Purchase,
  PurchaseResult,
  ReceiptValidationResult,
  PurchaseType,
} from './IPaymentService';

export class MockPaymentService implements IPaymentService {
  private _isReady: boolean = false;
  private mockPurchases: Purchase[] = [];

  get isReady(): boolean {
    return this._isReady;
  }

  async initialize(): Promise<boolean> {
    this._isReady = true;
    console.log('[MockPayment] Initialized');
    return true;
  }

  async getProducts(productIds: string[], type: PurchaseType): Promise<Product[]> {
    await this.delay(300);

    return productIds.map(id => ({
      id,
      title: `Product ${id}`,
      description: `Mock product ${id}`,
      price: '$4.99',
      priceAmountMicros: 4990000,
      priceCurrencyCode: 'USD',
      type,
      localizedPrice: '$4.99',
    }));
  }

  async purchaseProduct(productId: string): Promise<PurchaseResult> {
    await this.delay(1000);

    const purchase: Purchase = {
      productId,
      purchaseToken: `mock_token_${Date.now()}`,
      transactionId: `mock_tx_${Date.now()}`,
      transactionDate: Date.now(),
      platform: 'android',
      isAcknowledged: false,
      isConsumed: false,
    };

    this.mockPurchases.push(purchase);

    return { success: true, purchase };
  }

  async getPurchases(): Promise<Purchase[]> {
    return [...this.mockPurchases];
  }

  async finishTransaction(purchase: Purchase): Promise<boolean> {
    const index = this.mockPurchases.findIndex(
      p => p.purchaseToken === purchase.purchaseToken
    );
    if (index >= 0) {
      this.mockPurchases[index].isAcknowledged = true;
    }
    return true;
  }

  async restorePurchases(): Promise<Purchase[]> {
    await this.delay(500);
    return [...this.mockPurchases];
  }

  async validateReceipt(purchase: Purchase): Promise<ReceiptValidationResult> {
    await this.delay(300);
    return {
      valid: true,
      productId: purchase.productId,
      purchaseTime: purchase.transactionDate,
    };
  }

  shutdown(): void {
    this._isReady = false;
    console.log('[MockPayment] Shut down');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

let mockPaymentInstance: MockPaymentService | null = null;

export function getMockPaymentService(): MockPaymentService {
  if (!mockPaymentInstance) {
    mockPaymentInstance = new MockPaymentService();
  }
  return mockPaymentInstance;
}

export default MockPaymentService;
