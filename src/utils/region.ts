import NativeStorefront from '../specs/NativeStorefront';

let cachedCountryCode: string | null | undefined; // undefined = not yet fetched

/**
 * Get the storefront/locale country code from the native module.
 * iOS returns SKStorefront country codes (e.g., 'USA', 'GBR').
 * Android returns Locale country codes (e.g., 'US', 'GB').
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
 * iOS SKStorefront uses ISO 3166-1 alpha-3 ('USA').
 * Android Locale uses ISO 3166-1 alpha-2 ('US').
 */
export async function isUSStorefront(): Promise<boolean> {
  const code = await getStorefrontCountryCode();
  if (!code) {
    return false;
  }
  return code === 'USA' || code === 'US';
}

// Exported for testing only
export function _resetCache(): void {
  cachedCountryCode = undefined;
}
