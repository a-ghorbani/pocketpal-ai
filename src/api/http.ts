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

export interface FetchTimeoutOptions {
  timeoutMs: number;
  signal?: AbortSignal;
}

function abortError(): Error {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

/**
 * `fetch` bounded by a timer and linked to an optional caller signal. Expiry
 * rejects `Connection timed out`; a caller abort rejects as an abort, so the
 * two stay distinguishable.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  {timeoutMs, signal}: FetchTimeoutOptions,
): Promise<Response> {
  if (signal?.aborted) {
    throw abortError();
  }
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onCallerAbort = () => controller.abort();
  signal?.addEventListener('abort', onCallerAbort, {once: true});

  try {
    return await fetch(url, {...init, signal: controller.signal});
  } catch (error) {
    if (timedOut) {
      throw new Error('Connection timed out');
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onCallerAbort);
  }
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
