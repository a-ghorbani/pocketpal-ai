import {makeAutoObservable, reaction, runInAction, toJS} from 'mobx';
import {AppState, Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {authService} from '../services';
import {ACCOUNT_LINK_ENABLED} from '../services/iap/accountLink';
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
  StoreQuery,
  StoreTransaction,
} from '../services/iap/StorePort';
import {UNKNOWN_CONTENT_VERSION} from '../services/iap/iapWire';
import type {StorePlatform, VerifyResult} from '../services/iap/iapWire';
import type {LinkOutcome} from '../services/iap/iapApi';
import {changedCreatorFields} from '../services/iap/creatorContent';
import type {CreatorContent} from '../services/iap/creatorContent';
import {palStore as defaultPalStore} from './PalStore';

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
  | 'held_invalid'
  | 'removed';

export interface LedgerRecord {
  palId: string;
  source: 'store';
  productId: string;
  transactionIds: string[];
  status: LedgerStatus;
  pendingSince?: number;
  contentVersion?: string;
  applied?: CreatorContent;
  pendingUpdate?: PendingUpdate;
  supportCode?: string;
  grant?: GrantedVersion;
  withdrawnAfterDelivery?: boolean;
  title: string;
  thumbnailUrl?: string;
  linkedUserId?: string;
  updatedAt: number;
}

export interface PendingUpdate {
  pal: PalsHubPal;
  content: CreatorContent;
  contentVersion: string;
  changeNote?: string;
}

export type GrantedVersion = Omit<PendingUpdate, 'contentVersion'> & {
  contentVersion?: string;
};

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
  | 'held_invalid'
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
  | 'applyCreatorUpdate'
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
  'held_invalid',
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
  linkPending = false;
  linkConflict = false;
  isRestoring = false;
  storefront: string | undefined = undefined;

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
  private storefrontRead = false;
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
  private readonly finishedTxs = new Set<string>();

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
      | 'storefrontRead'
      | 'recovering'
      | 'recoverAgain'
      | 'appStateSubscription'
      | 'retries'
      | 'finishedTxs'
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
      storefrontRead: false,
      recovering: false,
      recoverAgain: false,
      appStateSubscription: false,
      retries: false,
      invalidTxIds: false,
      finishedTxs: false,
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

  get showsLicenseNotice(): boolean {
    return (
      Platform.OS === 'ios' &&
      (this.storefront === undefined || this.storefront === 'USA')
    );
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
        rec.status === 'unfulfillable' ||
        rec.status === 'held_invalid',
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

  updateAvailable(palId: string): boolean {
    const rec = this.records[palId];
    return (
      rec?.status === 'active' &&
      rec.pendingUpdate !== undefined &&
      this.localPalFor(palId) !== undefined
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

  private readStorefront(): void {
    if (this.storefrontRead) {
      return;
    }
    this.storefrontRead = true;
    this.storePort
      .storefront()
      .then(code =>
        runInAction(() => {
          this.storefront = code;
        }),
      )
      .catch(() => {});
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

  private async finish(tx: StoreTransaction): Promise<void> {
    const key = txKey(tx);
    if (this.finishedTxs.has(key)) {
      return;
    }
    try {
      await this.storePort.finish(tx);
      this.finishedTxs.add(key);
    } catch (error) {
      console.warn('Finishing the transaction failed:', error);
    }
  }

  private resetAndroidAckMemo(): void {
    if (Platform.OS === 'android') {
      this.finishedTxs.clear();
    }
  }

  private async finishOnIOS(tx: StoreTransaction): Promise<void> {
    if (Platform.OS === 'ios') {
      await this.finish(tx);
    }
  }

  private async verify(tx: StoreTransaction): Promise<VerifyResult | null> {
    try {
      const results = await this.deps.api.verify(platform(), [tx.proof]);
      const result =
        results.find(candidate => candidate.status === 'active') ?? results[0];
      if (result?.status === 'active' && !result.supportCode) {
        console.warn(
          'Verify returned an active purchase without a support code:',
          result.palId,
        );
      }
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
        if (tx.unfinished || Platform.OS === 'ios') {
          await this.finish(tx);
        }
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
        await this.removeOwnership(key);
        await this.finishOnIOS(tx);
        return;
      case 'removed':
        await this.withdraw(key, result.supportCode);
        await this.finishOnIOS(tx);
        return;
      case 'invalid':
        if (result.supportCode) {
          await this.putRecord(
            key,
            {
              productId: tx.productId,
              status: 'held_invalid',
              supportCode: result.supportCode,
            },
            true,
          );
        } else {
          await this.deleteRecord(key, true);
          this.setTransient(key, 'invalid');
        }
        await this.finishOnIOS(tx);
        this.invalidTxIds.add(txKey(tx));
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
      const delivered =
        tx.state === 'purchased' &&
        (rec.status === 'active' || rec.status === 'granted');
      await (delivered ? this.finish(tx) : this.finishOnIOS(tx));
    }
    if (rec.status === 'held_invalid') {
      if (opts.install) {
        await this.reverifyHeld(rec, tx);
      }
      return;
    }
    if (rec.status === 'unfulfillable' || !opts.settledVerify) {
      return;
    }
    const result = await this.verify(tx);
    if (!result) {
      return;
    }
    if (rec.status === 'removed') {
      if (result.status === 'active') {
        await this.writeGrant(rec.palId, tx, result);
        if (tx.unfinished) {
          await this.finish(tx);
        }
        this.drainQueue().catch(() => {});
      }
      return;
    }
    if (result.status === 'revoked') {
      await this.removeOwnership(rec.palId);
      return;
    }
    if (result.status === 'removed') {
      await this.withdraw(rec.palId, result.supportCode);
      return;
    }
    if (rec.status === 'granted' || result.status !== 'active' || !result.pal) {
      return;
    }
    if (rec.supportCode !== result.supportCode) {
      await this.putRecord(rec.palId, {
        productId: rec.productId,
        supportCode: result.supportCode,
      });
    }
    if (this.localPalFor(rec.palId)) {
      if (result.content) {
        await this.offerUpdate(rec.palId, {
          pal: result.pal,
          content: result.content,
          contentVersion: result.contentVersion ?? UNKNOWN_CONTENT_VERSION,
          changeNote: result.changeNote,
        });
      }
      return;
    }
    if (opts.install) {
      await this.writeGrant(rec.palId, tx, result);
      await this.drainQueue();
    }
  }

  private async reverifyHeld(
    rec: LedgerRecord,
    tx: StoreTransaction,
  ): Promise<void> {
    const result = await this.verify(tx);
    switch (result?.status) {
      case 'active':
        this.invalidTxIds.delete(txKey(tx));
        await this.writeGrant(rec.palId, tx, result);
        if (tx.unfinished) {
          await this.finish(tx);
        }
        await this.drainQueue();
        return;
      case 'revoked':
        await this.removeOwnership(rec.palId);
        return;
      case 'removed':
        await this.withdraw(rec.palId, result.supportCode);
        return;
      case 'unfulfillable':
        await this.putRecord(
          rec.palId,
          {
            productId: rec.productId,
            status: 'unfulfillable',
            supportCode: result.supportCode ?? rec.supportCode,
          },
          true,
        );
        return;
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
        grant:
          result.pal && result.content
            ? {
                pal: result.pal,
                content: result.content,
                contentVersion: result.contentVersion,
                changeNote: result.changeNote,
              }
            : undefined,
        pendingUpdate: undefined,
        supportCode: result.supportCode,
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

  private async offerUpdate(
    palId: string,
    update: PendingUpdate,
  ): Promise<void> {
    const rec = this.records[palId];
    if (
      rec?.status !== 'active' ||
      !this.localPalFor(palId) ||
      !update.pal.system_prompt ||
      update.contentVersion === rec.contentVersion ||
      update.contentVersion === rec.pendingUpdate?.contentVersion
    ) {
      return;
    }
    if (changedCreatorFields(rec.applied, update.content).size === 0) {
      await this.putRecord(palId, {
        productId: rec.productId,
        contentVersion: update.contentVersion,
        applied: update.content,
        pendingUpdate: undefined,
      });
      return;
    }
    await this.putRecord(palId, {
      productId: rec.productId,
      pendingUpdate: update,
    });
  }

  async applyUpdate(palId: string, shownVersion: string): Promise<void> {
    await this.load();
    const productId = this.records[palId]?.productId;
    if (!productId) {
      return;
    }
    await this.serialize(productId, async () => {
      const rec = this.records[palId];
      const pending = rec?.pendingUpdate;
      const local = this.localPalFor(palId);
      if (
        rec?.status !== 'active' ||
        !pending ||
        pending.contentVersion !== shownVersion ||
        !local
      ) {
        return;
      }
      const {thumbnailFailed} = await this.deps.palStore.applyCreatorUpdate(
        local.id,
        pending.pal,
        changedCreatorFields(rec.applied, pending.content),
      );
      await this.putRecord(palId, {
        productId,
        contentVersion: pending.contentVersion,
        applied: thumbnailFailed
          ? {...pending.content, thumbnail_url: rec.applied?.thumbnail_url}
          : pending.content,
        pendingUpdate: undefined,
        title: pending.pal.title,
        thumbnailUrl: thumbnailFailed
          ? rec.thumbnailUrl
          : (pending.pal.thumbnail_url ?? rec.thumbnailUrl),
      });
    });
  }

  private async removeOwnership(palId: string): Promise<void> {
    const rec = this.records[palId];
    if (!rec) {
      return;
    }
    await this.putRecord(
      palId,
      {
        productId: rec.productId,
        status: 'removed',
        grant: undefined,
        pendingUpdate: undefined,
        ...(this.keptByLibrary(palId) ? {} : {applied: undefined}),
      },
      true,
    );
    await this.deleteLocalUnlessLibrary(palId);
  }

  private async withdraw(palId: string, supportCode?: string): Promise<void> {
    const rec = this.records[palId];
    if (!rec) {
      return;
    }
    await this.putRecord(
      palId,
      {
        productId: rec.productId,
        status: 'unfulfillable',
        supportCode: supportCode ?? rec.supportCode,
        ...(rec.status === 'active' || rec.status === 'granted'
          ? {withdrawnAfterDelivery: true}
          : {}),
        grant: undefined,
        pendingUpdate: undefined,
        applied: undefined,
      },
      true,
    );
    await this.deleteLocalUnlessLibrary(palId);
  }

  private keptByLibrary(palId: string): boolean {
    return (
      this.localPalFor(palId) !== undefined &&
      this.deps.auth.isAuthenticated &&
      this.deps.palStore.userLibrary.some(pal => pal.id === palId)
    );
  }

  private async deleteLocalUnlessLibrary(palId: string): Promise<void> {
    const local = this.localPalFor(palId);
    if (local && !this.keptByLibrary(palId)) {
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
        const grant = rec.grant!;
        const {created} = await this.deps.palStore.installOwnedPal(grant.pal);
        await this.putRecord(rec.palId, {
          productId: rec.productId,
          status: 'active',
          grant: undefined,
          ...this.adoptGrant(rec, grant, created),
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

  private adoptGrant(
    rec: LedgerRecord,
    grant: GrantedVersion,
    created: boolean,
  ): Partial<LedgerRecord> {
    const version = grant.contentVersion ?? rec.contentVersion;
    if (created || !rec.applied) {
      return {applied: grant.content, contentVersion: version};
    }
    if (changedCreatorFields(rec.applied, grant.content).size > 0) {
      return {
        pendingUpdate: {
          ...grant,
          contentVersion: version ?? UNKNOWN_CONTENT_VERSION,
        },
      };
    }
    return {contentVersion: version};
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
      this.availability = available ? 'ready' : 'unavailable';
    });
    if (available) {
      this.readStorefront();
    }
    await this.drainQueue();
    if (!available) {
      return;
    }
    const held = this.androidHeldPalIds();
    this.resetAndroidAckMemo();
    const {ok, transactions: txs} = await this.storeTransactions();
    for (const tx of txs) {
      if (this.invalidTxIds.has(txKey(tx))) {
        continue;
      }
      const rec = this.recordForProduct(tx.productId);
      if (!isSettled(rec?.status) || tx.unfinished) {
        await this.processTransaction(tx, {});
      }
    }
    await this.dropStalePending(txs, false, ok, held);
    if (!ok) {
      return;
    }
    const refreshed = await this.refresh(txs);
    if (refreshed) {
      this.markLedgerWritable();
    }
  }

  private async storeTransactions(): Promise<StoreQuery> {
    const [unfinished, {ok, transactions: entitled}] = await Promise.all([
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
    return {ok, transactions: [...merged.values()]};
  }

  private androidHeldPalIds(): string[] {
    return Platform.OS === 'android'
      ? Object.values(this.records)
          .filter(rec => rec.status === 'held_invalid')
          .map(rec => rec.palId)
      : [];
  }

  private async dropStalePending(
    txs: StoreTransaction[],
    force: boolean,
    queryOk: boolean,
    heldPalIds: string[],
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
    if (!queryOk) {
      return;
    }
    const unlisted = heldPalIds
      .map(palId => this.records[palId])
      .filter(
        (rec): rec is LedgerRecord =>
          rec !== undefined && !txs.some(tx => tx.productId === rec.productId),
      );
    for (const rec of unlisted) {
      await this.serialize(rec.productId, async () => {
        if (this.records[rec.palId]?.status === 'held_invalid') {
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
            contentVersion:
              rec.pendingUpdate?.contentVersion ?? rec.contentVersion,
            purchaseRef: rec.supportCode!,
          },
        ]),
    );
    if (proofs.length === 0 && Object.keys(known).length === 0) {
      return true;
    }
    let refreshed;
    try {
      refreshed = await this.deps.api.refresh(platform(), proofs, known);
    } catch {
      return false;
    }
    for (const {
      pal,
      content,
      contentVersion,
      changeNote,
    } of refreshed.changed) {
      const rec = this.records[pal.id];
      if (rec?.status === 'active') {
        await this.serialize(rec.productId, () =>
          this.offerUpdate(pal.id, {
            pal,
            content,
            contentVersion: contentVersion ?? UNKNOWN_CONTENT_VERSION,
            changeNote,
          }),
        );
      }
    }
    const removals = [
      ...refreshed.revoked.map(palId => ({palId, withdrawn: false})),
      ...refreshed.removed.map(palId => ({palId, withdrawn: true})),
    ];
    for (const {palId, withdrawn} of removals) {
      const rec = this.records[palId];
      if (
        rec &&
        rec.status !== 'removed' &&
        rec.status !== 'unfulfillable' &&
        !(Platform.OS === 'android' && rec.status === 'held_invalid')
      ) {
        await this.serialize(rec.productId, () =>
          withdrawn ? this.withdraw(palId) : this.removeOwnership(palId),
        );
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
      (await this.storeTransactions()).transactions.find(
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
    if (!ACCOUNT_LINK_ENABLED) {
      return;
    }
    this.linkPending = true;
  }

  cancelLinkRequest(): void {
    this.linkPending = false;
  }

  async link(): Promise<LinkOutcome | undefined> {
    const userId = this.deps.auth.user?.id;
    if (!ACCOUNT_LINK_ENABLED || !this.deps.auth.isAuthenticated || !userId) {
      return undefined;
    }
    await this.load();
    const unlinked = Object.values(this.records).filter(
      rec => rec.status === 'active' && rec.linkedUserId !== userId,
    );
    if (unlinked.length === 0) {
      return undefined;
    }
    const {transactions} = await this.storePort.currentEntitlements();
    const txs = transactions.filter(
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
      const held = this.androidHeldPalIds();
      this.resetAndroidAckMemo();
      const {ok, transactions: txs} =
        await this.storePort.currentEntitlements();
      for (const tx of txs) {
        await this.processTransaction(tx, {settledVerify: true, install: true});
      }
      await this.dropStalePending(txs, true, ok, held);
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
    const txs = productId
      ? (await this.storePort.currentEntitlements()).transactions
      : [];
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
