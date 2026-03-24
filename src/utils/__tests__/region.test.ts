function setupRegion(
  nativeStorefrontDefault: {getCountryCode: jest.Mock} | null = {
    getCountryCode: jest.fn(),
  },
) {
  jest.resetModules();
  jest.doMock('../../specs/NativeStorefront', () => ({
    __esModule: true,
    default: nativeStorefrontDefault,
  }));
  const region = require('../region') as typeof import('../region');
  return {
    region,
    mockGetCountryCode: nativeStorefrontDefault?.getCountryCode ?? null,
  };
}

describe('region', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('isUSStorefront', () => {
    it('returns true for USA (iOS SK1 format)', async () => {
      const {region, mockGetCountryCode} = setupRegion();
      mockGetCountryCode!.mockResolvedValue('USA');
      expect(await region.isUSStorefront()).toBe(true);
    });

    it('returns true for US (iOS SK2 / Android Locale format)', async () => {
      const {region, mockGetCountryCode} = setupRegion();
      mockGetCountryCode!.mockResolvedValue('US');
      expect(await region.isUSStorefront()).toBe(true);
    });

    it('returns false for GBR', async () => {
      const {region, mockGetCountryCode} = setupRegion();
      mockGetCountryCode!.mockResolvedValue('GBR');
      expect(await region.isUSStorefront()).toBe(false);
    });

    it('returns false for DE', async () => {
      const {region, mockGetCountryCode} = setupRegion();
      mockGetCountryCode!.mockResolvedValue('DE');
      expect(await region.isUSStorefront()).toBe(false);
    });

    it('returns false for null country code', async () => {
      const {region, mockGetCountryCode} = setupRegion();
      mockGetCountryCode!.mockResolvedValue(null);
      expect(await region.isUSStorefront()).toBe(false);
    });
  });

  describe('graceful fallback', () => {
    it('returns false when NativeStorefront is null', async () => {
      const {region} = setupRegion(null);
      expect(await region.isUSStorefront()).toBe(false);
    });

    it('returns false when getCountryCode rejects', async () => {
      const {region, mockGetCountryCode} = setupRegion();
      mockGetCountryCode!.mockRejectedValue(new Error('Native module error'));
      expect(await region.isUSStorefront()).toBe(false);
    });
  });

  describe('caching', () => {
    it('caches the result and does not call native module again', async () => {
      const {region, mockGetCountryCode} = setupRegion();
      mockGetCountryCode!.mockResolvedValue('USA');

      const result1 = await region.getStorefrontCountryCode();
      const result2 = await region.getStorefrontCountryCode();

      expect(result1).toBe('USA');
      expect(result2).toBe('USA');
      expect(mockGetCountryCode).toHaveBeenCalledTimes(1);
    });

    it('caches null result from error and does not retry', async () => {
      const {region, mockGetCountryCode} = setupRegion();
      mockGetCountryCode!.mockRejectedValue(new Error('fail'));

      const result1 = await region.getStorefrontCountryCode();
      const result2 = await region.getStorefrontCountryCode();

      expect(result1).toBeNull();
      expect(result2).toBeNull();
      expect(mockGetCountryCode).toHaveBeenCalledTimes(1);
    });
  });
});
