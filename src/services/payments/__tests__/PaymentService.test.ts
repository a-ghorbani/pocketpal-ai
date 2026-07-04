import {Platform} from 'react-native';
import {PaymentService, getPaymentService} from '../PaymentService';
import {getAndroidIAPService} from '../AndroidIAPService';
import {getMockPaymentService} from '../MockPaymentService';
import {IPaymentService, PurchaseType} from '../IPaymentService';

jest.mock('react-native-iap', () => ({
  initConnection: jest.fn().mockResolvedValue(undefined),
  endConnection: jest.fn().mockResolvedValue(undefined),
  flushFailedPurchasesCachedAsPending: jest.fn().mockResolvedValue([]),
  getProducts: jest.fn().mockResolvedValue([]),
  getSubscriptions: jest.fn().mockResolvedValue([]),
  requestPurchase: jest.fn().mockResolvedValue({}),
  requestSubscription: jest.fn().mockResolvedValue({}),
  getAvailablePurchases: jest.fn().mockResolvedValue([]),
  finishTransaction: jest.fn().mockResolvedValue(true),
  purchaseUpdatedListener: jest.fn().mockReturnValue({remove: jest.fn()}),
  purchaseErrorListener: jest.fn().mockReturnValue({remove: jest.fn()}),
}));

describe('PaymentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Platform Routing', () => {
    it('should use AndroidIAPService on Android platform', () => {
      const originalOS = Platform.OS;
      Object.defineProperty(Platform, 'OS', {value: 'android', writable: true});

      const service = new PaymentService();

      expect(service.isReady).toBe(false);

      Object.defineProperty(Platform, 'OS', {value: originalOS, writable: true});
    });

    it('should use IOSIAPService on iOS platform', () => {
      const originalOS = Platform.OS;
      Object.defineProperty(Platform, 'OS', {value: 'ios', writable: true});

      const service = new PaymentService();

      expect(service.isReady).toBe(false);

      Object.defineProperty(Platform, 'OS', {value: originalOS, writable: true});
    });

    it('should use MockPaymentService on web platform', () => {
      const originalOS = Platform.OS;
      Object.defineProperty(Platform, 'OS', {value: 'web', writable: true});

      const service = new PaymentService();

      expect(service.isReady).toBe(false);

      Object.defineProperty(Platform, 'OS', {value: originalOS, writable: true});
    });

    it('should respect explicit platform config', () => {
      const androidService = new PaymentService({platform: 'android'});
      const iosService = new PaymentService({platform: 'ios'});
      const webService = new PaymentService({platform: 'web'});

      expect(androidService.isReady).toBe(false);
      expect(iosService.isReady).toBe(false);
      expect(webService.isReady).toBe(false);
    });
  });

  describe('Initialization', () => {
    it('should initialize inner service', async () => {
      const service = new PaymentService({platform: 'web'});

      const result = await service.initialize();

      expect(result).toBe(true);
      expect(service.isReady).toBe(true);
    });

    it('should initialize AndroidIAPService on Android', async () => {
      const originalOS = Platform.OS;
      Object.defineProperty(Platform, 'OS', {value: 'android', writable: true});

      const service = new PaymentService();

      const result = await service.initialize();

      expect(result).toBe(true);

      Object.defineProperty(Platform, 'OS', {value: originalOS, writable: true});
    });
  });

  describe('Product Operations', () => {
    it('should get products through inner service', async () => {
      const service = new PaymentService({platform: 'web'});
      await service.initialize();

      const products = await service.getProducts(['product-1', 'product-2'], 'non_consumable');

      expect(products).toBeDefined();
      expect(Array.isArray(products)).toBe(true);
    });
  });

  describe('Purchase Flow', () => {
    it('should purchase product and validate receipt', async () => {
      const service = new PaymentService({platform: 'web'});
      await service.initialize();

      const result = await service.purchaseProduct('test-product');

      expect(result.success).toBe(true);
      expect(result.purchase).toBeDefined();
    });

    it('should handle purchase failure', async () => {
      const mockPayment = getMockPaymentService();
      jest.spyOn(mockPayment, 'purchaseProduct').mockResolvedValue({
        success: false,
        error: {code: 'PURCHASE_ERROR', message: 'Purchase failed'},
      });

      const service = new PaymentService({platform: 'web'});

      const result = await service.purchaseProduct('test-product');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Purchase Management', () => {
    it('should get purchases', async () => {
      const service = new PaymentService({platform: 'web'});
      await service.initialize();

      const purchases = await service.getPurchases();

      expect(Array.isArray(purchases)).toBe(true);
    });

    it('should restore purchases', async () => {
      const service = new PaymentService({platform: 'web'});
      await service.initialize();

      const purchases = await service.restorePurchases();

      expect(Array.isArray(purchases)).toBe(true);
    });

    it('should finish transaction', async () => {
      const service = new PaymentService({platform: 'web'});
      await service.initialize();

      const mockPurchase = {
        productId: 'test-product',
        purchaseToken: 'token-123',
        transactionId: 'tx-123',
        transactionDate: Date.now(),
        platform: 'android' as const,
        isAcknowledged: false,
        isConsumed: false,
      };

      const result = await service.finishTransaction(mockPurchase);

      expect(result).toBe(true);
    });
  });

  describe('Receipt Validation', () => {
    it('should validate receipt', async () => {
      const service = new PaymentService({platform: 'web'});
      await service.initialize();

      const mockPurchase = {
        productId: 'test-product',
        purchaseToken: 'token-123',
        transactionId: 'tx-123',
        transactionDate: Date.now(),
        platform: 'android' as const,
        isAcknowledged: false,
        isConsumed: false,
      };

      const result = await service.validateReceipt(mockPurchase);

      expect(result.valid).toBe(true);
      expect(result.productId).toBe('test-product');
    });
  });

  describe('Singleton', () => {
    it('should return same instance on multiple calls', () => {
      const service1 = getPaymentService();
      const service2 = getPaymentService();

      expect(service1).toBe(service2);
    });

    it('should create new instance with new PaymentService constructor', () => {
      const service1 = getPaymentService();
      const service2 = new PaymentService({platform: 'web'});

      expect(service2).not.toBe(service1);
    });
  });

  describe('Shutdown', () => {
    it('should shutdown inner service', () => {
      const service = new PaymentService({platform: 'web'});

      service.shutdown();

      expect(service.isReady).toBe(false);
    });
  });
});