import {makeAutoObservable} from 'mobx';

import type {
  Availability,
  FlowPhase,
  LedgerRecord,
} from '../../src/store/PurchaseStore';
import type {StoreProduct} from '../../src/services/iap/StorePort';
import type {PalsHubPal} from '../../src/types/palshub';

class MockPurchaseStore {
  records: Record<string, LedgerRecord> = {};
  availability: Availability = 'initializing';
  products = new Map<string, StoreProduct>();
  phases = new Map<string, FlowPhase>();
  linkPending = false;
  linkConflict = false;

  buy: jest.Mock;
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

  constructor() {
    makeAutoObservable(this, {
      buy: false,
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
    });
    this.buy = jest.fn().mockResolvedValue('stay');
    this.retry = jest.fn().mockResolvedValue(undefined);
    this.restore = jest.fn().mockResolvedValue(undefined);
    this.installOwned = jest.fn().mockResolvedValue(true);
    this.link = jest.fn().mockResolvedValue('linked');
    this.requestLink = jest.fn();
    this.cancelLinkRequest = jest.fn();
    this.endSession = jest.fn();
    this.start = jest.fn().mockResolvedValue(undefined);
    this.isOwned = jest.fn(
      (palId: string) =>
        this.records[palId]?.status === 'active' ||
        this.records[palId]?.status === 'granted',
    );
    this.canBuy = jest.fn(
      (pal: PalsHubPal) =>
        this.availability === 'ready' &&
        !!this.productFor(pal.store_product_id) &&
        !this.records[pal.id] &&
        !pal.is_owned,
    );
  }

  productFor(productId: string | undefined): StoreProduct | undefined {
    return productId ? this.products.get(productId) : undefined;
  }

  recordFor(palId: string): LedgerRecord | undefined {
    return this.records[palId];
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
        rec.status === 'unfulfillable',
    );
  }

  reset() {
    this.records = {};
    this.availability = 'initializing';
    this.products.clear();
    this.phases.clear();
    this.linkPending = false;
    this.linkConflict = false;
  }
}

export const mockPurchaseStore = new MockPurchaseStore();
