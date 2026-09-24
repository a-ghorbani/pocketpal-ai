import {makeAutoObservable, reaction, runInAction, toJS} from 'mobx';
import {Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {authService} from '../services';
import {iapApi} from '../services/iap/iapApi';
import type {IapApi} from '../services/iap/iapApi';
import {bindingSource} from '../services/iap/bindingSource';
import type {BindingSource} from '../services/iap/bindingSource';
import {NativeStore} from '../services/iap/NativeStore';
import type {
  StorePort,
  StoreProduct,
  StoreTransaction,
} from '../services/iap/StorePort';
import type {StorePlatform, VerifyResult} from '../services/iap/iapWire';
import {palStore as defaultPalStore} from './PalStore';

import type {PalsHubPal} from '../types/palshub';

export const LEDGER_KEY = 'purchase-ledger';

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

export class PurchaseStore {
  records: Record<string, LedgerRecord> = {};
  availability: Availability = 'initializing';
  products = new Map<string, StoreProduct>();
  transient = new Map<string, TransientPhase>();

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
    if (transient === 'restore_needed' && !this.isStoreOwned(palId)) {
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
      await this.runSettled(rec, tx, opts);
      return;
    }

    const palId = rec?.palId ?? this.palIdForProduct(tx.productId);

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
      return;
    }
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
    const hash = await this.deps.palStore.applyOwnedPalContent(
      localPalId,
      pal,
      rec.appliedPromptHash,
    );
    await this.putRecord(rec.palId, {
      productId: rec.productId,
      contentVersion: contentVersion ?? rec.contentVersion,
      appliedPromptHash: hash,
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
        const {appliedPromptHash} = await this.deps.palStore.installOwnedPal(
          rec.grant!,
          rec.appliedPromptHash,
        );
        await this.putRecord(rec.palId, {
          productId: rec.productId,
          status: 'active',
          grant: undefined,
          appliedPromptHash,
        });
        if (this.watching.has(rec.palId)) {
          this.setTransient(rec.palId, 'ready');
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
          return 'close';
        default:
          if (outcome.downgrade) {
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
});
