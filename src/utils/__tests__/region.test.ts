describe('region', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('returns null when the native storefront module is unavailable', async () => {
    jest.doMock('../../specs/NativeStorefront', () => ({
      __esModule: true,
      default: null,
    }));

    const {getStorefrontCountryCode, isUSStorefront} = require('../region');

    await expect(getStorefrontCountryCode()).resolves.toBeNull();
    await expect(isUSStorefront()).resolves.toBe(false);
  });

  it('returns and caches the fetched storefront country code', async () => {
    const getCountryCode = jest.fn().mockResolvedValue('US');
    jest.doMock('../../specs/NativeStorefront', () => ({
      __esModule: true,
      default: {getCountryCode},
    }));

    const {getStorefrontCountryCode, isUSStorefront} = require('../region');

    await expect(getStorefrontCountryCode()).resolves.toBe('US');
    await expect(getStorefrontCountryCode()).resolves.toBe('US');
    await expect(isUSStorefront()).resolves.toBe(true);
    expect(getCountryCode).toHaveBeenCalledTimes(1);
  });

  it('handles alpha-3 US codes and native errors', async () => {
    const getCountryCode = jest.fn().mockResolvedValue('USA');
    jest.doMock('../../specs/NativeStorefront', () => ({
      __esModule: true,
      default: {getCountryCode},
    }));

    const {isUSStorefront} = require('../region');

    await expect(isUSStorefront()).resolves.toBe(true);

    jest.resetModules();

    const failingGetter = jest.fn().mockRejectedValue(new Error('boom'));
    jest.doMock('../../specs/NativeStorefront', () => ({
      __esModule: true,
      default: {getCountryCode: failingGetter},
    }));

    const regionAfterFailure = require('../region');

    await expect(
      regionAfterFailure.getStorefrontCountryCode(),
    ).resolves.toBeNull();
    await expect(regionAfterFailure.isUSStorefront()).resolves.toBe(false);
  });
});
