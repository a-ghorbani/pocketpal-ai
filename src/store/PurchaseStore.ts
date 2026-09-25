import {makeAutoObservable, reaction, runInAction, toJS} from 'mobx';
import {AppState, Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {authService} from '../services';
import {iapApi} from '../services/iap/iapApi';
import type {IapApi} from '../services/iap/iapApi';
import {bindingSource} from '../services/iap/bindingSource';
import type {BindingSource} from '../services/iap/bindingSource';
import {NativeStore} from '../services/iap/NativeStore';
import {palEvents} from '../services/palshub/palEvents';
import type {PalEvents} from '../services/palshub/palEvents';
import type {
  StorePort,
  StoreProduct,
  StoreTransaction,
} from '../services/iap/StorePort';
import type {StorePlatform, VerifyResult} from '../services/iap/iapWire';
import type {LinkOutcome} from '../services/iap/iapApi';
import {palStore as defaultPalStore} from './PalStore';
import type {AppliedContent} from './PalStore';

import type {PalsHubPal} from '../types/palshub';

export const LEDGER_KEY = 'purchase-ledger';
export const RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 16_000, 32_000];
export const RETRY_STEADY_MS = 60_000;
export const STALE_PENDING_MS = 72 * 60 * 60 * 1000;

export type LedgerStatus =
  | 'pending_payment'
  | 'unlocking'
  | 'granted'
  | 'active'
  | 'unfulfillable'
  | 'removed';

export interface LedgerRecord {
  palId: string;
  source: 'store';
  productId: string;
  transactionIds: string[];
  status: LedgerStatus;
  pendingSince?: number;
  contentVersion?: number;
  appliedPromptHash?: string;
  appliedModelKey?: string;
  appliedSettingsHash?: string;
  supportCode?: string;
  grant?: PalsHubPal;
  title: string;
  thumbnailUrl?: string;
  linkedUserId?: string;
  updatedAt: number;
}

interface Ledger {
  version: 1;
  records: Record<string, LedgerRecord>;
}

export type Availability = 'initializing' | 'ready' | 'unavailable';

export type FlowPhase =
  | 'idle'
  | 'paying'
  | 'pending_payment'
  | 'unlocking'
  | 'granted'
  | 'active'
  | 'unfulfillable'
  | 'ready'
  | 'invalid'
  | 'restore_needed';

export type BuyResult = 'close' | 'stay';

export interface StartOptions {
  store?: StorePort;
  beforeInit?: () => Promise<void>;
}

export interface ProcessOptions {
  settledVerify?: boolean;
  install?: boolean;
}

type TransientPhase = 'paying' | 'ready' | 'invalid' | 'restore_needed';

type PalStoreDep = Pick<
  typeof defaultPalStore,
  | 'ready'
  | 'pals'
  | 'userLibrary'
  | 'cachedPalsHubPals'
  | 'installOwnedPal'
  | 'applyOwnedPalContent'
  | 'deletePal'
>;

export interface PurchaseStoreDeps {
  api: IapApi;
  binding: BindingSource;
  palStore: PalStoreDep;
  auth: {readonly isAuthenticated: boolean; readonly user: {id: string} | null};
  storage: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
  };
  now: () => number;
  events: PalEvents;
}

const SETTLED: ReadonlySet<LedgerStatus> = new Set([
  'granted',
  'active',
  'unfulfillable',
  'removed',
]);

export const isSettled = (status: LedgerStatus | undefined): boolean =>
  status !== undefined && SETTLED.has(status);

const RETRYABLE_RESULTS: ReadonlySet<VerifyResult['status']> = new Set([
  'failed',
  'unavailable',
]);

const platform = (): StorePlatform =>
  Platform.OS === 'ios' ? 'ios' : 'android';

const txKey = (tx: StoreTransaction): string =>
  tx.transactionId ?? `${tx.productId}:${tx.state}`;

const appliedOf = (rec: LedgerRecord): AppliedContent => ({
  promptHash: rec.appliedPromptHash,
  modelKey: rec.appliedModelKey,
  settingsHash: rec.appliedSettingsHash,
});

const appliedFields = (applied: AppliedContent) => ({
  appliedPromptHash: applied.promptHash,
  appliedModelKey: applied.modelKey,
  appliedSettingsHash: applied.settingsHash,
});

export class PurchaseStore {
  records: Record<string, LedgerRecord> = {};
  availability: Availability = 'initializing';
  products = new Map<string, StoreProduct>();
  transient = new Map<string, TransientPhase>();
  linkPending = false;
  linkConflict = false;
  isRestoring = false;

  private store: StorePort | null = null;
  private unsubscribeStore: (() => void) | null = null;
  private deps: PurchaseStoreDeps;
  private loaded: Promise<void> | null = null;
  private ledgerWritable = true;
  private writeChain: Promise<void> = Promise.resolve();
  private productChains = new Map<string, Promise<unknown>>();
  private draining: Promise<void> | null = null;
  private drainAgain = false;
  private palByProduct = new Map<string, PalsHubPal>();
  private requestedProducts = new Set<string>();
  private watching = new Set<string>();
  private started = false;
  private downgraded = false;
  private recovering: Promise<void> | null = null;
  private recoverAgain = false;
  private appStateSubscription: {remove: () => void} | null = null;
  private retries = new Map<
    string,
    {
      attempt: number;
      tx: StoreTransaction;
      timer?: ReturnType<typeof setTimeout>;
    }
  >();
  readonly invalidTxIds = new Set<string>();

  constructor(deps: PurchaseStoreDeps) {
    this.deps = deps;
    makeAutoObservable<
      PurchaseStore,
      | 'store'
      | 'unsubscribeStore'
      | 'deps'
      | 'loaded'
      | 'ledgerWritable'
      | 'writeChain'
      | 'productChains'
      | 'draining'
      | 'drainAgain'
      | 'palByProduct'
      | 'requestedProducts'
      | 'watching'
      | 'started'
      | 'downgraded'
      | 'recovering'
      | 'recoverAgain'
      | 'appStateSubscription'
      | 'retries'
    >(this, {
      store: false,
      unsubscribeStore: false,
      deps: false,
      loaded: false,
      ledgerWritable: false,
      writeChain: false,
      productChains: false,
      draining: false,
      drainAgain: false,
      palByProduct: false,
      requestedProducts: false,
      watching: false,
      started: false,
      downgraded: false,
      recovering: false,
      recoverAgain: false,
      appStateSubscription: false,
      retries: false,
      invalidTxIds: false,
      storePort: false,
    });
    reaction(
      () => [
        this.availability,
        this.deps.palStore.cachedPalsHubPals.map(pal => pal.store_product_id),
      ],
      () => {
        this.syncProducts();
      },
    );
    reaction(
      () => this.deps.auth.isAuthenticated,
      signedIn => {
        if (signedIn && this.linkPending) {
          this.cancelLinkRequest();
          this.link().catch(() => {});
        }
      },
    );
  }

  get storePort(): StorePort {
    if (!this.store) {
      this.setStore(new NativeStore());
    }
    return this.store!;
  }

  setStore(store: StorePort): void {
    this.unsubscribeStore?.();
    this.store = store;
    this.unsubscribeStore = store.onTransaction(tx => {
      this.processTransaction(tx, {settledVerify: true}).catch(() => {});
    });
  }

  productFor(productId: string | undefined): StoreProduct | undefined {
    return productId ? this.products.get(productId) : undefined;
  }

  recordFor(palId: string): LedgerRecord | undefined {
    return this.records[palId];
  }

  recordForProduct(productId: string): LedgerRecord | undefined {
    return Object.values(this.records).find(rec => rec.productId === productId);
  }

  isLegacyInstall(palId: string): boolean {
    return (
      !this.records[palId] &&
      this.deps.palStore.pals.some(
        pal =>
          pal.palshub_id === palId &&
          (pal.price_cents ?? 0) > 0 &&
          pal.is_owned === true,
      )
    );
  }

  isOwned(palId: string): boolean {
    const status = this.records[palId]?.status;
    if (status === 'active' || status === 'granted') {
      return true;
    }
    if (
      this.deps.auth.isAuthenticated &&
      this.deps.palStore.userLibrary.some(pal => pal.id === palId)
    ) {
      return true;
    }
    return this.isLegacyInstall(palId);
  }

  get storeOwnedRecords(): LedgerRecord[] {
    return Object.values(this.records).filter(
      rec =>
        rec.status === 'active' ||
        rec.status === 'granted' ||
        rec.status === 'unfulfillable',
    );
  }

  get needsLink(): boolean {
    const userId = this.deps.auth.isAuthenticated
      ? this.deps.auth.user?.id
      : undefined;
    return Object.values(this.records).some(
      rec =>
        rec.status === 'active' &&
        (userId ? rec.linkedUserId !== userId : !rec.linkedUserId),
    );
  }

  isStoreOwned(palId: string): boolean {
    const status = this.records[palId]?.status;
    return status === 'active' || status === 'granted';
  }

  canBuy(pal: PalsHubPal): boolean {
    return (
      this.availability === 'ready' &&
      pal.iap_enabled?.[platform()] === true &&
      this.productFor(pal.store_product_id) !== undefined &&
      !this.isOwned(pal.id) &&
      !pal.is_owned &&
      !this.records[pal.id] &&
      !(pal.store_product_id && this.recordForProduct(pal.store_product_id))
    );
  }

  flowFor(palId: string): FlowPhase {
    const transient = this.transient.get(palId);
    const rec = this.records[palId];
    if (transient === 'paying') {
      return 'paying';
    }
    if (transient === 'ready' && rec?.status === 'active') {
      return 'ready';
    }
    if (transient === 'invalid' && !rec) {
      return 'invalid';
    }
    if (transient === 'restore_needed' && !this.localPalFor(palId)) {
      return 'restore_needed';
    }
    if (!rec || rec.status === 'removed') {
      return 'idle';
    }
    return rec.status;
  }

  endSession(palId: string): void {
    const transient = this.transient.get(palId);
    if (transient && transient !== 'paying') {
      this.transient.delete(palId);
    }
    this.watching.delete(palId);
  }

  private setTransient(palId: string, phase: TransientPhase | undefined) {
    runInAction(() => {
      if (phase) {
        this.transient.set(palId, phase);
      } else {
        this.transient.delete(palId);
      }
    });
  }

  async syncProducts(): Promise<void> {
    if (this.availability !== 'ready') {
      return;
    }
    const wanted = this.deps.palStore.cachedPalsHubPals
      .filter(pal => pal.store_product_id && pal.iap_enabled?.[platform()])
      .map(pal => pal.store_product_id!)
      .filter(id => !this.requestedProducts.has(id));
    if (wanted.length === 0) {
      return;
    }
    wanted.forEach(id => this.requestedProducts.add(id));
    try {
      const products = await this.storePort.fetchProducts(wanted);
      runInAction(() => {
        products.forEach(product =>
          this.products.set(product.productId, product),
        );
      });
    } catch {
      wanted.forEach(id => this.requestedProducts.delete(id));
    }
  }

  load(): Promise<void> {
    if (!this.loaded) {
      this.loaded = this.loadLedger();
    }
    return this.loaded;
  }

  private async loadLedger(): Promise<void> {
    let raw: string | null = null;
    try {
      raw = await this.deps.storage.getItem(LEDGER_KEY);
    } catch {
      raw = null;
    }
    if (raw === null) {
      return;
    }
    try {
      const ledger = JSON.parse(raw) as Ledger;
      if (ledger?.version !== 1 || typeof ledger.records !== 'object') {
        throw new Error('unknown ledger version');
      }
      runInAction(() => {
        this.records = {...ledger.records, ...this.records};
      });
    } catch {
      this.ledgerWritable = false;
    }
  }

  markLedgerWritable(): void {
    this.ledgerWritable = true;
  }

  private persist(force = false): Promise<void> {
    if (!this.ledgerWritable && !force) {
      return this.writeChain;
    }
    if (force) {
      this.ledgerWritable = true;
    }
    const write = this.writeChain.then(() =>
      this.deps.storage.setItem(
        LEDGER_KEY,
        JSON.stringify({version: 1, records: toJS(this.records)}),
      ),
    );
    this.writeChain = write.catch(() => undefined);
    return write;
  }

  private async putRecord(
    palId: string,
    changes: Partial<LedgerRecord> & {productId: string},
    force = false,
  ): Promise<LedgerRecord> {
    const meta = this.palByProduct.get(changes.productId);
    runInAction(() => {
      const base: LedgerRecord = this.records[palId] ?? {
        palId,
        source: 'store',
        productId: changes.productId,
        transactionIds: [],
        status: 'unlocking',
        title: meta?.title ?? '',
        thumbnailUrl: meta?.thumbnail_url,
        updatedAt: 0,
      };
      this.records[palId] = {
        ...base,
        ...changes,
        palId,
        title: changes.title ?? (base.title || meta?.title || ''),
        thumbnailUrl:
          changes.thumbnailUrl ?? base.thumbnailUrl ?? meta?.thumbnail_url,
        updatedAt: this.deps.now(),
      };
    });
    await this.persist(force);
    return this.records[palId];
  }

  private async deleteRecord(palId: string, force = false): Promise<void> {
    runInAction(() => {
      delete this.records[palId];
    });
    await this.persist(force);
  }

  private palIdForProduct(productId: string): string {
    return (
      this.recordForProduct(productId)?.palId ??
      this.palByProduct.get(productId)?.id ??
      this.deps.palStore.cachedPalsHubPals.find(
        pal => pal.store_product_id === productId,
      )?.id ??
      this.deps.palStore.userLibrary.find(
        pal => pal.store_product_id === productId,
      )?.id ??
      productId
    );
  }

  private withTransactionId(
    rec: LedgerRecord | undefined,
    tx: StoreTransaction,
  ): string[] {
    const ids = rec?.transactionIds ?? [];
    return tx.transactionId && !ids.includes(tx.transactionId)
      ? [...ids, tx.transactionId]
      : ids;
  }

  private serialize<T>(productId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.productChains.get(productId) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(task);
    this.productChains.set(productId, run);
    run
      .finally(() => {
        if (this.productChains.get(productId) === run) {
          this.productChains.delete(productId);
        }
      })
      .catch(() => undefined);
    return run;
  }

  processTransaction(
    tx: StoreTransaction,
    opts: ProcessOptions = {},
  ): Promise<void> {
    return this.serialize(tx.productId, () => this.runTransaction(tx, opts));
  }

  private async finishOnIOS(tx: StoreTransaction): Promise<void> {
    if (Platform.OS !== 'ios') {
      return;
    }
    try {
      await this.storePort.finish(tx);
    } catch (error) {
      console.warn('Finishing the transaction failed:', error);
    }
  }

  private async verify(tx: StoreTransaction): Promise<VerifyResult | null> {
    try {
      const [result] = await this.deps.api.verify(platform(), [tx.proof]);
      return result && !RETRYABLE_RESULTS.has(result.status) ? result : null;
    } catch {
      return null;
    }
  }

  private async runTransaction(
    tx: StoreTransaction,
    opts: ProcessOptions,
  ): Promise<void> {
    await this.deps.palStore.ready;
    await this.load();
    const rec = this.recordForProduct(tx.productId);

    if (rec && isSettled(rec.status)) {
      this.clearRetry(tx.productId);
      await this.runSettled(rec, tx, opts);
      return;
    }

    const palId = rec?.palId ?? this.palIdForProduct(tx.productId);

    if (!opts.install && this.invalidTxIds.has(txKey(tx))) {
      return;
    }

    if (tx.state === 'pending') {
      if (!rec) {
        await this.putRecord(palId, {
          productId: tx.productId,
          status: 'pending_payment',
          pendingSince: this.deps.now(),
        });
      }
      return;
    }

    await this.putRecord(palId, {
      productId: tx.productId,
      status: 'unlocking',
      pendingSince: undefined,
      transactionIds: this.withTransactionId(rec, tx),
    });

    const result = await this.verify(tx);
    if (!result) {
      this.scheduleRetry(tx);
      return;
    }
    this.clearRetry(tx.productId);
    const key = this.rekey(palId, result.palId);

    switch (result.status) {
      case 'active':
        await this.writeGrant(key, tx, result);
        await this.finishOnIOS(tx);
        this.drainQueue().catch(() => {});
        return;
      case 'pending':
        await this.putRecord(key, {
          productId: tx.productId,
          status: 'pending_payment',
          pendingSince: this.deps.now(),
        });
        return;
      case 'unfulfillable':
        await this.putRecord(
          key,
          {
            productId: tx.productId,
            status: 'unfulfillable',
            supportCode: result.supportCode,
            ...(result.pal ? {title: result.pal.title} : {}),
          },
          true,
        );
        await this.finishOnIOS(tx);
        return;
      case 'revoked':
      case 'removed':
        await this.removeOwnership(key);
        await this.finishOnIOS(tx);
        return;
      case 'invalid':
        await this.deleteRecord(key, true);
        await this.finishOnIOS(tx);
        this.invalidTxIds.add(txKey(tx));
        this.setTransient(key, 'invalid');
        this.deps.events.send(key, 'purchase_error');
        return;
    }
  }

  private async runSettled(
    rec: LedgerRecord,
    tx: StoreTransaction,
    opts: ProcessOptions,
  ): Promise<void> {
    if (tx.unfinished) {
      await this.finishOnIOS(tx);
    }
    if (rec.status === 'unfulfillable' || rec.status === 'granted') {
      return;
    }
    if (!opts.settledVerify) {
      return;
    }
    const result = await this.verify(tx);
    if (!result) {
      return;
    }
    if (rec.status === 'removed') {
      if (result.status === 'active') {
        await this.writeGrant(rec.palId, tx, result);
        this.drainQueue().catch(() => {});
      }
      return;
    }
    if (result.status === 'revoked' || result.status === 'removed') {
      await this.removeOwnership(rec.palId);
      return;
    }
    if (result.status !== 'active' || !result.pal) {
      return;
    }
    const local = this.localPalFor(rec.palId);
    if (local) {
      if ((result.contentVersion ?? 0) > (rec.contentVersion ?? 0)) {
        await this.applyContent(
          rec,
          local.id,
          result.pal,
          result.contentVersion,
        );
      }
      return;
    }
    if (opts.install) {
      await this.writeGrant(rec.palId, tx, result);
      await this.drainQueue();
    }
  }

  private rekey(from: string, to: string): string {
    if (from !== to && this.records[from]) {
      runInAction(() => {
        const previous = this.records[from];
        delete this.records[from];
        this.records[to] = {...this.records[to], ...previous, palId: to};
      });
    }
    return to;
  }

  private async writeGrant(
    palId: string,
    tx: StoreTransaction,
    result: VerifyResult,
  ): Promise<void> {
    const rec = this.records[palId];
    await this.putRecord(
      palId,
      {
        productId: tx.productId,
        status: 'granted',
        grant: result.pal,
        contentVersion: result.contentVersion,
        supportCode: result.supportCode ?? rec?.supportCode,
        transactionIds: this.withTransactionId(rec, tx),
        title: result.pal?.title ?? rec?.title ?? '',
        thumbnailUrl: result.pal?.thumbnail_url ?? rec?.thumbnailUrl,
        pendingSince: undefined,
      },
      true,
    );
  }

  localPalFor(palId: string) {
    return this.deps.palStore.pals.find(pal => pal.palshub_id === palId);
  }

  private async applyContent(
    rec: LedgerRecord,
    localPalId: string,
    pal: PalsHubPal,
    contentVersion: number | undefined,
  ): Promise<void> {
    const applied = await this.deps.palStore.applyOwnedPalContent(
      localPalId,
      pal,
      appliedOf(rec),
    );
    await this.putRecord(rec.palId, {
      productId: rec.productId,
      contentVersion: contentVersion ?? rec.contentVersion,
      ...appliedFields(applied),
      title: pal.title,
      thumbnailUrl: pal.thumbnail_url ?? rec.thumbnailUrl,
    });
  }

  private async removeOwnership(palId: string): Promise<void> {
    const rec = this.records[palId];
    if (!rec) {
      return;
    }
    await this.putRecord(
      palId,
      {productId: rec.productId, status: 'removed', grant: undefined},
      true,
    );
    const keptByLibrary =
      this.deps.auth.isAuthenticated &&
      this.deps.palStore.userLibrary.some(pal => pal.id === palId);
    const local = this.localPalFor(palId);
    if (local && !keptByLibrary) {
      await this.deps.palStore.deletePal(local.id);
    }
  }

  drainQueue(): Promise<void> {
    if (this.draining) {
      this.drainAgain = true;
      return this.draining;
    }
    const run = (async () => {
      do {
        this.drainAgain = false;
        await this.drainOnce();
      } while (this.drainAgain);
    })();
    this.draining = run.finally(() => {
      this.draining = null;
    });
    return this.draining;
  }

  private async drainOnce(): Promise<void> {
    await this.deps.palStore.ready;
    await this.load();
    const granted = Object.values(this.records).filter(
      rec => rec.status === 'granted' && rec.grant,
    );
    for (const rec of granted) {
      try {
        const {applied} = await this.deps.palStore.installOwnedPal(
          rec.grant!,
          appliedOf(rec),
        );
        await this.putRecord(rec.palId, {
          productId: rec.productId,
          status: 'active',
          grant: undefined,
          ...appliedFields(applied),
        });
        if (this.watching.has(rec.palId)) {
          this.setTransient(rec.palId, 'ready');
        }
        if (this.deps.auth.isAuthenticated) {
          this.link().catch(() => {});
        }
      } catch (error) {
        console.warn('Installing a purchased Pal failed:', error);
      }
    }
  }

  private rememberPal(pal: PalsHubPal) {
    if (pal.store_product_id) {
      this.palByProduct.set(pal.store_product_id, pal);
    }
  }

  async buy(pal: PalsHubPal): Promise<BuyResult> {
    const productId = pal.store_product_id;
    if (!productId || !this.canBuy(pal)) {
      return 'stay';
    }
    this.rememberPal(pal);
    this.watching.add(pal.id);
    this.setTransient(pal.id, 'paying');
    this.deps.events.send(pal.id, 'buy_tap');
    try {
      const binding = this.deps.auth.isAuthenticated
        ? await this.deps.binding.getBinding()
        : null;
      const outcome = await this.storePort.purchase(productId, binding);
      this.setTransient(pal.id, undefined);
      switch (outcome.kind) {
        case 'purchased':
          await this.processTransaction(outcome.tx, {settledVerify: true});
          return 'stay';
        case 'pending':
          await this.recordPending(pal.id, productId);
          return 'stay';
        case 'already_owned':
          await this.installOwned(pal);
          return 'stay';
        case 'cancelled':
          this.deps.events.send(pal.id, 'purchase_cancelled');
          return 'close';
        default:
          this.deps.events.send(pal.id, 'purchase_error');
          if (outcome.downgrade) {
            this.downgraded = true;
            runInAction(() => {
              this.availability = 'unavailable';
            });
          }
          return 'close';
      }
    } finally {
      if (this.transient.get(pal.id) === 'paying') {
        this.setTransient(pal.id, undefined);
      }
    }
  }

  private recordPending(palId: string, productId: string): Promise<void> {
    return this.serialize(productId, async () => {
      await this.load();
      const rec = this.recordForProduct(productId);
      if (rec && rec.status !== 'pending_payment') {
        return;
      }
      await this.putRecord(rec?.palId ?? palId, {
        productId,
        status: 'pending_payment',
        pendingSince: rec?.pendingSince ?? this.deps.now(),
      });
    });
  }

  async start({store, beforeInit}: StartOptions = {}): Promise<void> {
    if (this.started) {
      return;
    }
    this.started = true;
    await beforeInit?.();
    if (store) {
      this.setStore(store);
    }
    this.appStateSubscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        this.recover().catch(() => {});
      } else {
        this.pauseRetries();
      }
    });
    await this.deps.palStore.ready;
    await this.recover();
  }

  stop(): void {
    this.appStateSubscription?.remove();
    this.appStateSubscription = null;
    this.unsubscribeStore?.();
    this.unsubscribeStore = null;
    this.pauseRetries();
    this.started = false;
  }

  recover(): Promise<void> {
    if (this.recovering) {
      this.recoverAgain = true;
      return this.recovering;
    }
    const run = (async () => {
      do {
        this.recoverAgain = false;
        await this.recoverOnce();
      } while (this.recoverAgain);
    })();
    this.recovering = run.finally(() => {
      this.recovering = null;
    });
    return this.recovering;
  }

  private async recoverOnce(): Promise<void> {
    await this.deps.palStore.ready;
    await this.load();
    const available = await this.storePort.init();
    runInAction(() => {
      this.availability =
        available && !this.downgraded ? 'ready' : 'unavailable';
    });
    await this.drainQueue();
    if (!available) {
      return;
    }
    const txs = await this.storeTransactions();
    const queryOk = this.storePort.queryOk;
    for (const tx of txs) {
      if (this.invalidTxIds.has(txKey(tx))) {
        continue;
      }
      const rec = this.recordForProduct(tx.productId);
      if (!isSettled(rec?.status) || (Platform.OS === 'ios' && tx.unfinished)) {
        await this.processTransaction(tx, {});
      }
    }
    await this.dropStalePending(txs, false, queryOk);
    if (!queryOk) {
      return;
    }
    const refreshed = await this.refresh(txs);
    if (refreshed) {
      this.markLedgerWritable();
    }
  }

  private async storeTransactions(): Promise<StoreTransaction[]> {
    const [unfinished, entitled] = await Promise.all([
      this.storePort.unfinished().catch(() => [] as StoreTransaction[]),
      this.storePort.currentEntitlements(),
    ]);
    const merged = new Map<string, StoreTransaction>();
    [...unfinished, ...entitled].forEach(tx => {
      const key = txKey(tx);
      const seen = merged.get(key);
      merged.set(
        key,
        seen ? {...seen, unfinished: seen.unfinished || tx.unfinished} : tx,
      );
    });
    return [...merged.values()];
  }

  private async dropStalePending(
    txs: StoreTransaction[],
    force: boolean,
    queryOk: boolean,
  ): Promise<void> {
    const stale = Object.values(this.records).filter(rec => {
      if (rec.status !== 'pending_payment') {
        return false;
      }
      if (txs.some(tx => tx.productId === rec.productId)) {
        return false;
      }
      if (Platform.OS === 'android') {
        return queryOk;
      }
      return (
        force ||
        this.deps.now() - (rec.pendingSince ?? this.deps.now()) >
          STALE_PENDING_MS
      );
    });
    for (const rec of stale) {
      await this.serialize(rec.productId, async () => {
        if (this.records[rec.palId]?.status === 'pending_payment') {
          await this.deleteRecord(rec.palId);
        }
      });
    }
  }

  private async refresh(txs: StoreTransaction[]): Promise<boolean> {
    const proofs = txs
      .filter(tx => tx.state === 'purchased')
      .map(tx => tx.proof);
    const known = Object.fromEntries(
      Object.values(this.records)
        .filter(rec => rec.status === 'active' && rec.supportCode)
        .map(rec => [
          rec.palId,
          {
            contentVersion: rec.contentVersion ?? 0,
            purchaseRef: rec.supportCode!,
          },
        ]),
    );
    if (proofs.length === 0 && Object.keys(known).length === 0) {
      return true;
    }
    let refreshed;
    try {
      refreshed = await this.deps.api.refresh(proofs, known);
    } catch {
      return false;
    }
    for (const pal of refreshed.changed) {
      const rec = this.records[pal.id];
      const local = this.localPalFor(pal.id);
      if (rec?.status === 'active' && local) {
        await this.serialize(rec.productId, () =>
          this.applyContent(rec, local.id, pal, pal.content_version),
        );
      }
    }
    for (const palId of [...refreshed.revoked, ...refreshed.removed]) {
      const rec = this.records[palId];
      if (rec && rec.status !== 'removed') {
        await this.serialize(rec.productId, () => this.removeOwnership(palId));
      }
    }
    return true;
  }

  private scheduleRetry(tx: StoreTransaction): void {
    const previous = this.retries.get(tx.productId);
    if (previous?.timer) {
      clearTimeout(previous.timer);
    }
    const attempt = previous?.attempt ?? 0;
    const delay = RETRY_DELAYS_MS[attempt] ?? RETRY_STEADY_MS;
    const entry: {
      attempt: number;
      tx: StoreTransaction;
      timer?: ReturnType<typeof setTimeout>;
    } = {attempt: attempt + 1, tx};
    entry.timer = setTimeout(() => {
      entry.timer = undefined;
      this.processTransaction(tx, {}).catch(() => {});
    }, delay);
    this.retries.set(tx.productId, entry);
  }

  private clearRetry(productId: string): void {
    const entry = this.retries.get(productId);
    if (entry?.timer) {
      clearTimeout(entry.timer);
    }
    this.retries.delete(productId);
  }

  private pauseRetries(): void {
    this.retries.forEach(entry => {
      if (entry.timer) {
        clearTimeout(entry.timer);
        entry.timer = undefined;
      }
    });
  }

  async retry(palId: string): Promise<void> {
    await this.load();
    const rec = this.records[palId];
    if (!rec || isSettled(rec.status)) {
      return;
    }
    const pending = this.retries.get(rec.productId);
    const tx =
      pending?.tx ??
      (await this.storeTransactions()).find(
        candidate => candidate.productId === rec.productId,
      );
    if (!tx) {
      return;
    }
    if (pending?.timer) {
      clearTimeout(pending.timer);
    }
    this.retries.set(rec.productId, {attempt: 0, tx});
    await this.processTransaction(tx, {});
  }

  requestLink(): void {
    this.linkPending = true;
  }

  cancelLinkRequest(): void {
    this.linkPending = false;
  }

  async link(): Promise<LinkOutcome | undefined> {
    const userId = this.deps.auth.user?.id;
    if (!this.deps.auth.isAuthenticated || !userId) {
      return undefined;
    }
    await this.load();
    const unlinked = Object.values(this.records).filter(
      rec => rec.status === 'active' && rec.linkedUserId !== userId,
    );
    if (unlinked.length === 0) {
      return undefined;
    }
    const txs = (await this.storePort.currentEntitlements()).filter(
      tx =>
        tx.state === 'purchased' &&
        unlinked.some(rec => rec.productId === tx.productId),
    );
    if (txs.length === 0) {
      return undefined;
    }
    let outcome: LinkOutcome;
    try {
      outcome = await this.deps.api.link(
        platform(),
        txs.map(tx => tx.proof),
      );
    } catch {
      return undefined;
    }
    runInAction(() => {
      this.linkConflict = outcome === 'conflict';
    });
    if (outcome === 'linked') {
      for (const rec of unlinked) {
        if (txs.some(tx => tx.productId === rec.productId)) {
          await this.putRecord(rec.palId, {
            productId: rec.productId,
            linkedUserId: userId,
          });
        }
      }
    }
    return outcome;
  }

  async restore(): Promise<void> {
    runInAction(() => {
      this.isRestoring = true;
    });
    try {
      await this.deps.palStore.ready;
      await this.load();
      try {
        await this.storePort.sync();
      } catch (error) {
        console.warn('Store sync failed:', error);
      }
      await this.drainQueue();
      const txs = await this.storePort.currentEntitlements();
      const queryOk = this.storePort.queryOk;
      for (const tx of txs) {
        await this.processTransaction(tx, {settledVerify: true, install: true});
      }
      await this.dropStalePending(txs, true, queryOk);
    } finally {
      runInAction(() => {
        this.isRestoring = false;
      });
    }
  }

  async installOwned(pal: PalsHubPal): Promise<boolean> {
    this.rememberPal(pal);
    this.watching.add(pal.id);
    const productId = this.records[pal.id]?.productId ?? pal.store_product_id;
    const txs = productId ? await this.storePort.currentEntitlements() : [];
    const tx = txs.find(
      candidate =>
        candidate.productId === productId && candidate.state === 'purchased',
    );
    if (!tx) {
      this.setTransient(pal.id, 'restore_needed');
      return false;
    }
    this.setTransient(pal.id, undefined);
    await this.processTransaction(tx, {settledVerify: true, install: true});
    return true;
  }
}

export const purchaseStore = new PurchaseStore({
  api: iapApi,
  binding: bindingSource,
  palStore: defaultPalStore,
  auth: authService,
  storage: AsyncStorage,
  now: () => Date.now(),
  events: palEvents,
});
