import {getAuthHeaders} from '../palshub/supabase';
import {clientHeaders, getApiBase} from '../palshub/apiBase';
import {
  linkBody,
  parseBinding,
  parseRefresh,
  parseVerify,
  refreshBody,
  verifyBody,
} from './iapWire';
import type {
  Binding,
  RefreshResult,
  StorePlatform,
  StoreProof,
  VerifyResult,
} from './iapWire';

export const VERIFY_MAX_TRANSACTIONS: Record<StorePlatform, number> = {
  ios: 50,
  android: 10,
};
export const REFRESH_MAX_KNOWN = 200;
export const REQUEST_TIMEOUT_MS = 15000;

export class IapHttpError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`);
    this.name = 'IapHttpError';
  }
}

export type LinkOutcome = 'linked' | 'conflict';

const chunk = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const request = async (
  path: string,
  {method, body, auth}: {method: 'GET' | 'POST'; body?: unknown; auth: boolean},
): Promise<unknown> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...clientHeaders(),
    };
    if (auth) {
      const {Authorization} = (await getAuthHeaders()) as {
        Authorization?: string;
      };
      if (Authorization) {
        headers.Authorization = Authorization;
      }
    }
    const response = await fetch(`${getApiBase()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new IapHttpError(response.status);
    }
    return await response.json().catch(() => null);
  } finally {
    clearTimeout(timer);
  }
};

const verify = async (
  platform: StorePlatform,
  proofs: StoreProof[],
): Promise<VerifyResult[]> => {
  const results: VerifyResult[] = [];
  for (const batch of chunk(proofs, VERIFY_MAX_TRANSACTIONS[platform])) {
    const json = await request('/api/mobile/iap/verify', {
      method: 'POST',
      body: verifyBody(platform, batch),
      auth: false,
    });
    results.push(...parseVerify(json));
  }
  return results;
};

const refresh = async (
  proofs: StoreProof[],
  known: Record<string, number>,
): Promise<RefreshResult> => {
  const knownEntries = Object.entries(known);
  const knownBatches =
    knownEntries.length > 0 ? chunk(knownEntries, REFRESH_MAX_KNOWN) : [[]];
  const changed = new Map<string, RefreshResult['changed'][number]>();
  const revoked = new Set<string>();
  const removed = new Set<string>();
  const unchanged = new Set<string>();
  for (const batch of knownBatches) {
    const json = await request('/api/mobile/iap/entitlements/refresh', {
      method: 'POST',
      body: refreshBody(proofs, Object.fromEntries(batch)),
      auth: false,
    });
    const result = parseRefresh(json);
    result.changed.forEach(pal => changed.set(pal.id, pal));
    result.revoked.forEach(id => revoked.add(id));
    result.removed.forEach(id => removed.add(id));
    result.unchanged.forEach(id => unchanged.add(id));
  }
  return {
    changed: [...changed.values()],
    revoked: [...revoked],
    removed: [...removed],
    unchanged: [...unchanged],
  };
};

const link = async (
  platform: StorePlatform,
  proofs: StoreProof[],
): Promise<LinkOutcome> => {
  try {
    await request('/api/mobile/iap/link', {
      method: 'POST',
      body: linkBody(platform, proofs),
      auth: true,
    });
    return 'linked';
  } catch (error) {
    if (error instanceof IapHttpError && error.status === 409) {
      return 'conflict';
    }
    throw error;
  }
};

const binding = async (): Promise<Binding> =>
  parseBinding(
    await request('/api/mobile/iap/binding', {method: 'GET', auth: true}),
  );

export const iapApi = {verify, refresh, link, binding};
export type IapApi = typeof iapApi;
