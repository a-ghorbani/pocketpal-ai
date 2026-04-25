import NativeStorefront from '../specs/NativeStorefront';

let cachedCountryCode: string | null | undefined; // undefined = not yet fetched

/**
 * Get the storefront/locale country code from the native module.
 * iOS 16+: StoreKit 2 returns ISO 3166-1 alpha-2 (e.g., 'US', 'GB').
 * iOS 15: SK1 returns ISO 3166-1 alpha-3 (e.g., 'USA', 'GBR').
 * Android: Locale returns ISO 3166-1 alpha-2 (e.g., 'US', 'GB').
 * Returns null if unavailable.
 */
export async function getStorefrontCountryCode(): Promise<string | null> {
  if (cachedCountryCode !== undefined) {
    return cachedCountryCode;
  }

  try {
    if (!NativeStorefront) {
      cachedCountryCode = null;
      return null;
    }
    const code = await NativeStorefront.getCountryCode();
    cachedCountryCode = code ?? null;
    return cachedCountryCode;
  } catch {
    cachedCountryCode = null;
    return null;
  }
}

/**
 * Check if the user is in the US storefront/region.
 * Handles both alpha-2 ('US') from StoreKit 2 / Android
 * and alpha-3 ('USA') from StoreKit 1 (iOS 15).
 */
export async function isUSStorefront(): Promise<boolean> {
  const code = await getStorefrontCountryCode();
  if (!code) {
    return false;
  }
  return code === 'USA' || code === 'US';
}
