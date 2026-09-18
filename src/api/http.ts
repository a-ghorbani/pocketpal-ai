export const CONNECTION_TIMEOUT_MS = 30000;
export const IDLE_TIMEOUT_MS = 60000;

/**
 * Single normalization site for a per-server timeout. An undefined, NaN,
 * non-finite, or non-positive value falls back to the supplied default.
 * Callers (stores, engine, sheets) forward raw values; only this layer
 * enforces the floor.
 */
export function resolveTimeout(
  timeoutMs: number | undefined,
  fallback: number,
): number {
  if (timeoutMs == null || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return fallback;
  }
  return timeoutMs;
}

/**
 * Build headers for OpenAI-compatible API requests.
 */
export function buildHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

/**
 * Normalize server URL: remove trailing slash.
 */
export function normalizeUrl(serverUrl: string): string {
  return serverUrl.replace(/\/+$/, '');
}
