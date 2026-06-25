/**
 * Shared transport helpers for provider adapters. Each network call is bounded
 * by a per-call timeout and throws on transport / auth / non-2xx — adapters
 * never return a silent empty on failure (the talent maps the throw to an
 * error result).
 */

const DEFAULT_TIMEOUT_MS = 12000;

/** Throw a clear "<provider> key not set" error when the BYOK key is missing. */
export const requireKey = (key: string, providerLabel: string): string => {
  if (!key || key.trim().length === 0) {
    throw new Error(`${providerLabel} key not set`);
  }
  return key.trim();
};

const withTimeout = async (
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {...init, signal: controller.signal});
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('timed out');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
};

export const fetchJson = async <T>(
  input: string,
  init: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> => {
  const res = await withTimeout(input, init, timeoutMs);
  if (!res.ok) {
    throw new Error(`request failed (${res.status})`);
  }
  return (await res.json()) as T;
};

export const fetchText = async (
  input: string,
  init: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<string> => {
  const res = await withTimeout(input, init, timeoutMs);
  if (!res.ok) {
    throw new Error(`request failed (${res.status})`);
  }
  return res.text();
};
