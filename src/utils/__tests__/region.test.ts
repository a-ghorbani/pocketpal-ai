import {isUSStorefront, getStorefrontCountryCode, _resetCache} from '../region';
import NativeStorefront from '../../specs/NativeStorefront';

jest.mock('../../specs/NativeStorefront', () => ({
  __esModule: true,
  default: {
    getCountryCode: jest.fn(),
  },
}));

describe('region', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _resetCache();
  });

  describe('isUSStorefront', () => {
    it('returns true for USA (iOS SKStorefront format)', async () => {
      (NativeStorefront!.getCountryCode as jest.Mock).mockResolvedValue('USA');
      const result = await isUSStorefront();
      expect(result).toBe(true);
    });

    it('returns true for US (Android Locale format)', async () => {
      (NativeStorefront!.getCountryCode as jest.Mock).mockResolvedValue('US');
      const result = await isUSStorefront();
      expect(result).toBe(true);
    });

    it('returns false for GBR', async () => {
      (NativeStorefront!.getCountryCode as jest.Mock).mockResolvedValue('GBR');
      const result = await isUSStorefront();
      expect(result).toBe(false);
    });

    it('returns false for DE', async () => {
      (NativeStorefront!.getCountryCode as jest.Mock).mockResolvedValue('DE');
      const result = await isUSStorefront();
      expect(result).toBe(false);
    });

    it('returns false for null country code', async () => {
      (NativeStorefront!.getCountryCode as jest.Mock).mockResolvedValue(null);
      const result = await isUSStorefront();
      expect(result).toBe(false);
    });
  });

  describe('graceful fallback', () => {
    it('returns false when NativeStorefront is null', async () => {
      // Temporarily override the module to return null
      jest.resetModules();
      jest.doMock('../../specs/NativeStorefront', () => ({
        __esModule: true,
        default: null,
      }));

      const regionModule = require('../region');
      regionModule._resetCache();
      const result = await regionModule.isUSStorefront();
      expect(result).toBe(false);

      // Restore original mock
      jest.restoreAllMocks();
    });

    it('returns false when getCountryCode rejects', async () => {
      (NativeStorefront!.getCountryCode as jest.Mock).mockRejectedValue(
        new Error('Native module error'),
      );
      const result = await isUSStorefront();
      expect(result).toBe(false);
    });
  });

  describe('caching', () => {
    it('caches the result and does not call native module again', async () => {
      (NativeStorefront!.getCountryCode as jest.Mock).mockResolvedValue('USA');

      const result1 = await getStorefrontCountryCode();
      const result2 = await getStorefrontCountryCode();

      expect(result1).toBe('USA');
      expect(result2).toBe('USA');
      expect(NativeStorefront!.getCountryCode).toHaveBeenCalledTimes(1);
    });

    it('caches null result from error and does not retry', async () => {
      (NativeStorefront!.getCountryCode as jest.Mock).mockRejectedValue(
        new Error('fail'),
      );

      const result1 = await getStorefrontCountryCode();
      const result2 = await getStorefrontCountryCode();

      expect(result1).toBeNull();
      expect(result2).toBeNull();
      expect(NativeStorefront!.getCountryCode).toHaveBeenCalledTimes(1);
    });

    it('_resetCache allows fresh fetch', async () => {
      (NativeStorefront!.getCountryCode as jest.Mock).mockResolvedValue('USA');
      await getStorefrontCountryCode();

      _resetCache();
      (NativeStorefront!.getCountryCode as jest.Mock).mockResolvedValue('GBR');
      const result = await getStorefrontCountryCode();

      expect(result).toBe('GBR');
      expect(NativeStorefront!.getCountryCode).toHaveBeenCalledTimes(2);
    });
  });
});
