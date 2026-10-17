import {Platform} from 'react-native';

import {createHarness, flush, stopAll} from './purchaseTestHarness';

jest.mock('../PalStore', () => ({
  palStore: {
    ready: Promise.resolve(),
    pals: [],
    userLibrary: [],
    cachedPalsHubPals: [],
  },
}));

const originalOS = Platform.OS;
const setOS = (os: 'ios' | 'android') => {
  (Platform as any).OS = os;
};

const recoverWithStorefront = async (code: string | undefined) => {
  const h = createHarness();
  h.store.storefront.mockResolvedValue(code);
  await h.purchases.recover();
  await flush();
  return h;
};

describe('PurchaseStore licence notice', () => {
  afterEach(() => {
    stopAll();
    setOS(originalOS as 'ios' | 'android');
  });

  it('iOS: shows on the US storefront', async () => {
    setOS('ios');
    const h = await recoverWithStorefront('USA');
    expect(h.purchases.storefront).toBe('USA');
    expect(h.purchases.showsLicenseNotice).toBe(true);
  });

  it('iOS: shows when the storefront is unknown', async () => {
    setOS('ios');
    const h = await recoverWithStorefront(undefined);
    expect(h.purchases.showsLicenseNotice).toBe(true);
  });

  it('iOS: shows before the storefront is read', () => {
    setOS('ios');
    const h = createHarness();
    expect(h.purchases.showsLicenseNotice).toBe(true);
  });

  it('iOS: hides on another storefront', async () => {
    setOS('ios');
    const h = await recoverWithStorefront('DEU');
    expect(h.purchases.showsLicenseNotice).toBe(false);
  });

  it('iOS: a failed read reads as unknown', async () => {
    setOS('ios');
    const h = createHarness();
    h.store.storefront.mockRejectedValue(new Error('boom'));
    await h.purchases.recover();
    await flush();
    expect(h.purchases.showsLicenseNotice).toBe(true);
  });

  it('Android: never shows', async () => {
    setOS('android');
    const h = await recoverWithStorefront('USA');
    expect(h.purchases.showsLicenseNotice).toBe(false);
  });

  it('reads the storefront once, not on every recovery', async () => {
    setOS('ios');
    const h = await recoverWithStorefront('DEU');
    await h.purchases.recover();
    await h.purchases.recover();
    expect(h.store.storefront).toHaveBeenCalledTimes(1);
  });

  it('does not read the storefront while billing is unavailable', async () => {
    setOS('ios');
    const h = createHarness();
    h.store.init.mockResolvedValue(false);
    await h.purchases.recover();
    expect(h.store.storefront).not.toHaveBeenCalled();
  });
});
