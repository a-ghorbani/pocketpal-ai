/**
 * Shared transport helpers for provider adapters. Each network call is bounded
 * by a per-call timeout AND a response-body size cap, and throws on
 * transport / auth / non-2xx — adapters never return a silent empty on failure
 * (the talent maps the throw to an error result). The body cap keeps a hostile
 * or oversized page (chosen indirectly by the model) from buffering into JS
 * memory and OOMing a device already holding a multi-GB model.
 */

const DEFAULT_TIMEOUT_MS = 12000;

/** Reject/clamp bodies above this size before they buffer into a JS string. */
const MAX_BODY_BYTES = 2 * 1024 * 1024;

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

/**
 * Reject up-front when the server declares a body larger than the cap. Covers
 * every provider path (JSON search results and full-page text reads) before any
 * body is buffered into a JS string.
 */
const assertWithinDeclaredSize = (res: Response): void => {
  const declared = res.headers?.get?.('content-length');
  if (declared) {
    const bytes = Number(declared);
    if (Number.isFinite(bytes) && bytes > MAX_BODY_BYTES) {
      throw new Error('response too large');
    }
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
  assertWithinDeclaredSize(res);
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
  assertWithinDeclaredSize(res);
  // Full-page reads are the model-driven OOM vector: clamp the buffered body to
  // the byte cap so an unsized/chunked page can't grow without bound.
  const text = await res.text();
  return text.length > MAX_BODY_BYTES ? text.slice(0, MAX_BODY_BYTES) : text;
};
