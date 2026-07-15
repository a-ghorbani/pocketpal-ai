/**
 * Body-size cap stops a hostile/oversized response from buffering into JS memory
 * and OOMing a device holding a multi-GB model. Calls throw — never silent-empty.
 */

const DEFAULT_TIMEOUT_MS = 12000;

const MAX_BODY_BYTES = 2 * 1024 * 1024;

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
  // RN fetch can't stream-cap; bound the text before JSON.parse so an unsized
  // over-cap body isn't parsed into an even larger object.
  const text = await res.text();
  if (text.length > MAX_BODY_BYTES) {
    throw new Error('response too large');
  }
  return JSON.parse(text) as T;
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
  // RN fetch is XHR-backed (no streaming reader), so the full body is
  // materialized here before this slice — the clamp caps output, not peak memory.
  const text = await res.text();
  return text.length > MAX_BODY_BYTES ? text.slice(0, MAX_BODY_BYTES) : text;
};
