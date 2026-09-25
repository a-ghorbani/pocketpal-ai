import {observable} from 'mobx';

import {PurchaseStore, LEDGER_KEY} from '../PurchaseStore';
import type {LedgerRecord, PurchaseStoreDeps} from '../PurchaseStore';
import type {AppliedContent} from '../PalStore';
import type {
  PurchaseOutcome,
  StorePort,
  StoreTransaction,
} from '../../services/iap/StorePort';
import type {
  Binding,
  KnownEntry,
  RefreshResult,
  StorePlatform,
  StoreProof,
  VerifyResult,
} from '../../services/iap/iapWire';
import type {Pal} from '../../types/pal';
import type {PalsHubPal} from '../../types/palshub';

export const PRODUCT = 'pal.0123456789abcdef0123456789abcdef';
export const PAL_ID = 'pal-1';

export const hubPal = (overrides: Partial<PalsHubPal> = {}): PalsHubPal => ({
  type: 'palshub',
  id: PAL_ID,
  creator_id: 'creator',
  title: 'Story Pal',
  protection_level: 'reveal_on_purchase',
  price_cents: 499,
  allow_fork: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  system_prompt: 'You tell stories.',
  store_product_id: PRODUCT,
  iap_enabled: {ios: true, android: true},
  ...overrides,
});

export const tx = (
  overrides: Partial<StoreTransaction> = {},
): StoreTransaction => ({
  productId: PRODUCT,
  transactionId: 'tx-1',
  state: 'purchased',
  unfinished: true,
  proof: {platform: 'ios', jws: 'jws-1'},
  handle: 'tx-1',
  ...overrides,
});

export const result = (
  status: VerifyResult['status'],
  overrides: Partial<VerifyResult> = {},
): VerifyResult => ({
  palId: PAL_ID,
  status,
  contentVersion: 3,
  supportCode: 'SUP-1',
  pal: status === 'active' ? hubPal({content_version: 3}) : undefined,
  ...overrides,
});

export const record = (
  status: LedgerRecord['status'],
  overrides: Partial<LedgerRecord> = {},
): LedgerRecord => ({
  palId: PAL_ID,
  source: 'store',
  productId: PRODUCT,
  transactionIds: ['tx-0'],
  status,
  contentVersion: 3,
  appliedPromptHash: 'hash-3',
  supportCode: 'SUP-0',
  title: 'Story Pal',
  updatedAt: 1,
  ...(status === 'granted' ? {grant: hubPal()} : {}),
  ...(status === 'pending_payment' ? {pendingSince: 1} : {}),
  ...overrides,
});

export const localPal = (palshubId = PAL_ID): Pal =>
  ({
    type: 'local',
    id: `local-${palshubId}`,
    name: 'Story Pal',
    systemPrompt: 'You tell stories.',
    isSystemPromptChanged: false,
    useAIPrompt: false,
    parameters: {},
    parameterSchema: [],
    source: 'palshub',
    palshub_id: palshubId,
    price_cents: 499,
    is_owned: true,
  }) as Pal;

export class StubStore implements StorePort {
  queryOk = true;
  private listeners = new Set<(tx: StoreTransaction) => void>();
  constructor(private log: string[]) {}

  init = jest.fn(async () => true);
  fetchProducts = jest.fn(async (ids: string[]) =>
    ids.map(productId => ({productId, displayPrice: '4,99 €'})),
  );
  purchase = jest.fn(
    async (): Promise<PurchaseOutcome> => ({kind: 'purchased', tx: tx()}),
  );
  unfinished = jest.fn(async (): Promise<StoreTransaction[]> => []);
  currentEntitlements = jest.fn(async (): Promise<StoreTransaction[]> => []);
  sync = jest.fn(async () => {
    this.log.push('sync');
  });
  finish = jest.fn(async (finished: StoreTransaction) => {
    this.log.push(`finish:${finished.transactionId}`);
  });
  onTransaction(listener: (t: StoreTransaction) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit(t: StoreTransaction) {
    this.listeners.forEach(listener => listener(t));
  }
}

export class MemoryStorage {
  values = new Map<string, string>();
  writes: string[] = [];
  failOnWrite?: number;
  private count = 0;
  constructor(private log: string[]) {}

  getItem = jest.fn(async (key: string) => this.values.get(key) ?? null);
  setItem = jest.fn(async (key: string, value: string) => {
    this.count += 1;
    if (this.failOnWrite === this.count) {
      throw new Error('crash');
    }
    this.values.set(key, value);
    this.writes.push(value);
    const status = Object.values(
      JSON.parse(value).records as Record<string, LedgerRecord>,
    )
      .map(rec => rec.status)
      .join(',');
    this.log.push(`write:${status}`);
  });

  ledger(): Record<string, LedgerRecord> {
    const raw = this.values.get(LEDGER_KEY);
    return raw ? JSON.parse(raw).records : {};
  }

  seed(records: LedgerRecord[]) {
    this.values.set(
      LEDGER_KEY,
      JSON.stringify({
        version: 1,
        records: Object.fromEntries(records.map(rec => [rec.palId, rec])),
      }),
    );
  }
}

const created: PurchaseStore[] = [];

export const stopAll = () => {
  created.splice(0).forEach(store => store.stop());
};

export const createHarness = (
  options: {
    records?: LedgerRecord[];
    storage?: MemoryStorage;
    log?: string[];
    signedIn?: boolean;
  } = {},
) => {
  const log = options.log ?? [];
  const storage = options.storage ?? new MemoryStorage(log);
  if (options.records) {
    storage.seed(options.records);
  }
  const pals: Pal[] = [];
  const palStore = {
    ready: Promise.resolve(),
    pals,
    userLibrary: [] as PalsHubPal[],
    cachedPalsHubPals: [] as PalsHubPal[],
    installOwnedPal: jest.fn(async (pal: PalsHubPal) => {
      log.push(`install:${pal.id}`);
      let local = pals.find(p => p.palshub_id === pal.id);
      if (!local) {
        local = localPal(pal.id);
        pals.push(local);
      }
      return {localPal: local, applied: {promptHash: `hash-${pal.id}`}};
    }),
    applyOwnedPalContent: jest.fn(
      async (): Promise<AppliedContent> => ({promptHash: 'hash-new'}),
    ),
    deletePal: jest.fn(async (id: string) => {
      log.push(`delete:${id}`);
      const index = pals.findIndex(p => p.id === id);
      if (index >= 0) {
        pals.splice(index, 1);
      }
    }),
  };
  const auth = observable({
    isAuthenticated: options.signedIn ?? false,
    user: (options.signedIn ? {id: 'user-1'} : null) as {id: string} | null,
  });
  const api = {
    verify: jest.fn(
      async (
        _platform: StorePlatform,
        _proofs: StoreProof[],
      ): Promise<VerifyResult[]> => [result('active')],
    ),
    refresh: jest.fn(
      async (
        _proofs: StoreProof[],
        _known: Record<string, KnownEntry>,
      ): Promise<RefreshResult> => ({
        changed: [],
        revoked: [],
        removed: [],
        unchanged: [],
      }),
    ),
    link: jest.fn(
      async (
        _platform: StorePlatform,
        _proofs: StoreProof[],
      ): Promise<'linked' | 'conflict'> => 'linked',
    ),
    binding: jest.fn(async () => ({})),
  };
  const binding = {
    getBinding: jest.fn(async (): Promise<Binding | null> => null),
  };
  const events = {
    send: jest.fn((palId: string, type: string) => {
      log.push(`event:${type}`);
    }),
  };
  let clock = 1_000;
  const deps: PurchaseStoreDeps = {
    api: api as unknown as PurchaseStoreDeps['api'],
    binding,
    palStore: palStore as unknown as PurchaseStoreDeps['palStore'],
    auth,
    storage,
    now: () => clock,
    events,
  };
  const store = new StubStore(log);
  const purchases = new PurchaseStore(deps);
  purchases.setStore(store);
  created.push(purchases);
  return {
    purchases,
    store,
    storage,
    palStore,
    auth,
    api,
    binding,
    events,
    log,
    deps,
    advance: (ms: number) => {
      clock += ms;
    },
  };
};

export const flush = () => new Promise(resolve => setTimeout(resolve, 0));
