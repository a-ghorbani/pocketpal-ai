import {makeAutoObservable} from 'mobx';

import type {
  Availability,
  FlowPhase,
  LedgerRecord,
  PlusFlow,
} from '../../src/store/PurchaseStore';
import {PLUS_PRODUCT_IDS} from '../../src/services/plus/catalog';
import type {StoreProduct} from '../../src/services/iap/StorePort';
import type {PalsHubPal} from '../../src/types/palshub';

class MockPurchaseStore {
  records: Record<string, LedgerRecord> = {};
  availability: Availability = 'initializing';
  products = new Map<string, StoreProduct>();
  phases = new Map<string, FlowPhase>();
  linkPending = false;
  linkConflict = false;
  isRestoring = false;
  needsLink = false;
  showsLicenseNotice = false;
  plusUnlocked = false;
  plusPending = false;
  plusChecked = false;
  plusFlow: PlusFlow = 'idle';
  plusProductsLoading = false;

  buy: jest.Mock;
  buyPlus: jest.Mock;
  loadPlus: jest.Mock;
  syncProducts: jest.Mock;
  retryPlusProducts: jest.Mock;
  retry: jest.Mock;
  restore: jest.Mock;
  installOwned: jest.Mock;
  link: jest.Mock;
  requestLink: jest.Mock;
  cancelLinkRequest: jest.Mock;
  endSession: jest.Mock;
  start: jest.Mock;
  isOwned: jest.Mock;
  canBuy: jest.Mock;
  applyUpdate: jest.Mock;

  constructor() {
    makeAutoObservable(this, {
      buy: false,
      buyPlus: false,
      loadPlus: false,
      syncProducts: false,
      retryPlusProducts: false,
      retry: false,
      restore: false,
      installOwned: false,
      link: false,
      requestLink: false,
      cancelLinkRequest: false,
      endSession: false,
      start: false,
      isOwned: false,
      canBuy: false,
      applyUpdate: false,
    });
    this.buy = jest.fn().mockResolvedValue('stay');
    this.buyPlus = jest.fn().mockResolvedValue('purchased');
    this.loadPlus = jest.fn().mockResolvedValue(undefined);
    this.syncProducts = jest.fn().mockResolvedValue(undefined);
    this.retryPlusProducts = jest.fn();
    this.retry = jest.fn().mockResolvedValue(undefined);
    this.restore = jest.fn().mockResolvedValue({queryOk: true});
    this.installOwned = jest.fn().mockResolvedValue(true);
    this.link = jest.fn().mockResolvedValue('linked');
    this.requestLink = jest.fn();
    this.cancelLinkRequest = jest.fn();
    this.endSession = jest.fn();
    this.start = jest.fn().mockResolvedValue(undefined);
    this.applyUpdate = jest.fn().mockResolvedValue(undefined);
    this.isOwned = jest.fn(
      (palId: string) =>
        this.records[palId]?.status === 'active' ||
        this.records[palId]?.status === 'granted',
    );
    this.canBuy = jest.fn(
      (pal: PalsHubPal) =>
        this.availability === 'ready' &&
        !!this.productFor(pal.store_product_id) &&
        (!this.records[pal.id] || this.records[pal.id].status === 'removed') &&
        !pal.is_owned,
    );
  }

  get plusProducts(): StoreProduct[] {
    return PLUS_PRODUCT_IDS.flatMap(id => {
      const product = this.products.get(id);
      return product ? [product] : [];
    });
  }

  productFor(productId: string | undefined): StoreProduct | undefined {
    return productId ? this.products.get(productId) : undefined;
  }

  recordFor(palId: string): LedgerRecord | undefined {
    return this.records[palId];
  }

  updateAvailable(palId: string): boolean {
    const rec = this.records[palId];
    return rec?.status === 'active' && rec.pendingUpdate !== undefined;
  }

  isStoreOwned(palId: string): boolean {
    const status = this.records[palId]?.status;
    return status === 'active' || status === 'granted';
  }

  flowFor(palId: string): FlowPhase {
    const phase = this.phases.get(palId);
    if (phase) {
      return phase;
    }
    const status = this.records[palId]?.status;
    return !status || status === 'removed' ? 'idle' : status;
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

  reset() {
    this.records = {};
    this.availability = 'initializing';
    this.products.clear();
    this.phases.clear();
    this.linkPending = false;
    this.linkConflict = false;
    this.isRestoring = false;
    this.needsLink = false;
    this.showsLicenseNotice = false;
    this.plusUnlocked = false;
    this.plusPending = false;
    this.plusChecked = false;
    this.plusFlow = 'idle';
    this.plusProductsLoading = false;
    this.retryPlusProducts.mockReset();
  }
}

export const mockPurchaseStore = new MockPurchaseStore();
