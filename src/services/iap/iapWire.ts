import {palsHubApiService} from '../palshub/PalsHubApiService';
import type {ApiPalResponse} from '../palshub/PalsHubApiService';
import type {PalsHubPal} from '../../types/palshub';

export type StorePlatform = 'ios' | 'android';

export type StoreProof =
  | {platform: 'ios'; jws: string}
  | {platform: 'android'; productId: string; purchaseToken: string};

export type VerifyStatus =
  | 'active'
  | 'pending'
  | 'revoked'
  | 'removed'
  | 'unfulfillable'
  | 'invalid'
  | 'unavailable'
  | 'failed';

export interface VerifyResult {
  palId: string;
  status: VerifyStatus;
  contentVersion?: number;
  pal?: PalsHubPal;
  supportCode?: string;
}

export interface RefreshResult {
  changed: PalsHubPal[];
  revoked: string[];
  removed: string[];
  unchanged: string[];
}

export interface KnownEntry {
  contentVersion: number;
  purchaseRef: string;
}

export interface Binding {
  appAccountToken?: string;
  obfuscatedAccountId?: string;
}

export class IapWireError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IapWireError';
  }
}

const SERVER_STATUSES: ReadonlyArray<VerifyStatus> = [
  'active',
  'pending',
  'revoked',
  'removed',
  'unfulfillable',
  'invalid',
  'unavailable',
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const optionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const optionalNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const stringList = (value: unknown, field: string): string[] => {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value) || value.some(id => typeof id !== 'string')) {
    throw new IapWireError(`${field} is not a list of ids`);
  }
  return value;
};

const parsePal = (value: unknown): PalsHubPal => {
  if (!isRecord(value) || typeof value.id !== 'string') {
    throw new IapWireError('pal is malformed');
  }
  try {
    return palsHubApiService.transformApiPal(
      value as unknown as ApiPalResponse,
    );
  } catch {
    throw new IapWireError('pal is malformed');
  }
};

const proofToWire = (proof: StoreProof) =>
  proof.platform === 'ios'
    ? proof.jws
    : {productId: proof.productId, purchaseToken: proof.purchaseToken};

export const verifyBody = (platform: StorePlatform, proofs: StoreProof[]) => ({
  platform,
  transactions: proofs.map(proofToWire),
});

export const linkBody = verifyBody;

export const refreshBody = (
  proofs: StoreProof[],
  known: Record<string, KnownEntry>,
) => ({
  transactions: proofs.map(proofToWire),
  known: Object.fromEntries(
    Object.entries(known).map(([palId, entry]) => [
      palId,
      {content_version: entry.contentVersion, purchase_ref: entry.purchaseRef},
    ]),
  ),
});

const parseVerifyResult = (value: unknown): VerifyResult => {
  if (!isRecord(value) || typeof value.pal_id !== 'string') {
    throw new IapWireError('verify result is malformed');
  }
  const status = value.status as VerifyStatus;
  if (!SERVER_STATUSES.includes(status)) {
    throw new IapWireError('verify status is unknown');
  }
  const pal =
    value.pal === undefined || value.pal === null
      ? undefined
      : parsePal(value.pal);
  const result: VerifyResult = {
    palId: value.pal_id,
    status,
    contentVersion: optionalNumber(value.content_version),
    pal,
    supportCode: optionalString(value.support_code),
  };
  if (status === 'active' && !pal?.system_prompt) {
    return {...result, status: 'failed'};
  }
  return result;
};

export const parseVerify = (json: unknown): VerifyResult[] => {
  if (!isRecord(json) || !Array.isArray(json.results)) {
    throw new IapWireError('verify response is malformed');
  }
  return json.results.map(parseVerifyResult);
};

export const parseRefresh = (json: unknown): RefreshResult => {
  if (!isRecord(json)) {
    throw new IapWireError('refresh response is malformed');
  }
  const changed = json.changed ?? [];
  if (!Array.isArray(changed)) {
    throw new IapWireError('changed is not a list');
  }
  return {
    changed: changed.map(parsePal),
    revoked: stringList(json.revoked, 'revoked'),
    removed: stringList(json.removed, 'removed'),
    unchanged: stringList(json.unchanged, 'unchanged'),
  };
};

export const parseBinding = (json: unknown): Binding => {
  if (!isRecord(json)) {
    throw new IapWireError('binding response is malformed');
  }
  return {
    appAccountToken: optionalString(json.apple_app_account_token),
    obfuscatedAccountId: optionalString(json.google_obfuscated_account_id),
  };
};
