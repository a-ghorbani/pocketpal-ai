import {Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {setApiBaseOverride} from '../services/palshub/apiBase';
import {outcomeForErrorCode} from '../services/iap/storeOutcomes';
import type {Binding} from '../services/iap/iapWire';
import type {
  PurchaseOutcome,
  StorePort,
  StoreProduct,
  StoreTransaction,
} from '../services/iap/StorePort';

export const FAKE_STORE_KEY = 'e2e.fakeStore';
const MARKER = 'IAP_FAKE_STORE';

interface FakeTransaction {
  productId: string;
  transactionId: string;
  state: 'purchased' | 'pending';
  unfinished: boolean;
}

interface FakeState {
  apiBase?: string;
  products: Record<string, string>;
  next: string;
  owned: FakeTransaction[];
  pending: FakeTransaction[];
  unavailable: boolean;
  seq: number;
}

const initialState = (): FakeState => ({
  products: {},
  next: 'purchased',
  owned: [],
  pending: [],
  unavailable: false,
  seq: 0,
});

class FakeStore implements StorePort {
  private state: FakeState = initialState();
  private listeners = new Set<(tx: StoreTransaction) => void>();
  lastBinding: Binding | null = null;
  finished: string[] = [];
  syncCount = 0;

  get queryOk(): boolean {
    return !this.state.unavailable;
  }

  restore = async (): Promise<void> => {
    try {
      const raw = await AsyncStorage.getItem(FAKE_STORE_KEY);
      this.state = raw
        ? {...initialState(), ...JSON.parse(raw)}
        : initialState();
    } catch {
      this.state = initialState();
    }
    setApiBaseOverride(this.state.apiBase);
  };

  private async save(): Promise<void> {
    await AsyncStorage.setItem(FAKE_STORE_KEY, JSON.stringify(this.state));
  }

  private toTransaction(fake: FakeTransaction): StoreTransaction {
    return {
      productId: fake.productId,
      transactionId:
        fake.state === 'purchased' ? fake.transactionId : undefined,
      state: fake.state,
      unfinished: Platform.OS === 'ios' && fake.unfinished,
      proof:
        Platform.OS === 'ios'
          ? {
              platform: 'ios',
              jws: `fake.${fake.productId}.${fake.transactionId}`,
            }
          : {
              platform: 'android',
              productId: fake.productId,
              purchaseToken: `fake.${fake.productId}.${fake.transactionId}`,
            },
      handle: fake.transactionId,
    };
  }

  private newTransaction(
    productId: string,
    state: FakeTransaction['state'],
  ): FakeTransaction {
    this.state.seq += 1;
    return {
      productId,
      transactionId: `fake-tx-${this.state.seq}`,
      state,
      unfinished: state === 'purchased',
    };
  }

  private emit(fake: FakeTransaction) {
    const tx = this.toTransaction(fake);
    this.listeners.forEach(listener => listener(tx));
  }

  async init(): Promise<boolean> {
    return !this.state.unavailable;
  }

  async fetchProducts(productIds: string[]): Promise<StoreProduct[]> {
    return productIds
      .filter(id => this.state.products[id] !== undefined)
      .map(id => ({productId: id, displayPrice: this.state.products[id]}));
  }

  async purchase(
    productId: string,
    binding: Binding | null,
  ): Promise<PurchaseOutcome> {
    this.lastBinding = binding;
    const next = this.state.next;
    this.state.next = 'purchased';
    if (next === 'purchased') {
      const fake = this.newTransaction(productId, 'purchased');
      this.state.owned.push(fake);
      await this.save();
      this.emit(fake);
      return {kind: 'purchased', tx: this.toTransaction(fake)};
    }
    if (next === 'pending') {
      const fake = this.newTransaction(productId, 'pending');
      this.state.pending.push(fake);
      await this.save();
      return {kind: 'pending'};
    }
    await this.save();
    if (next === 'already_owned') {
      if (!this.state.owned.some(tx => tx.productId === productId)) {
        this.state.owned.push(this.newTransaction(productId, 'purchased'));
        await this.save();
      }
      return {kind: 'already_owned'};
    }
    if (next === 'cancelled') {
      return {kind: 'cancelled'};
    }
    return outcomeForErrorCode(next.replace(/^error:/, ''));
  }

  async unfinished(): Promise<StoreTransaction[]> {
    if (Platform.OS !== 'ios') {
      return [];
    }
    return this.state.owned
      .filter(tx => tx.unfinished)
      .map(tx => this.toTransaction(tx));
  }

  async currentEntitlements(): Promise<StoreTransaction[]> {
    if (this.state.unavailable) {
      return [];
    }
    const listed =
      Platform.OS === 'android'
        ? [...this.state.owned, ...this.state.pending]
        : this.state.owned;
    return listed.map(tx => this.toTransaction(tx));
  }

  async sync(): Promise<void> {
    this.syncCount += 1;
  }

  async finish(tx: StoreTransaction): Promise<void> {
    if (Platform.OS !== 'ios') {
      return;
    }
    this.finished.push(String(tx.handle));
    this.state.owned = this.state.owned.map(fake =>
      fake.transactionId === tx.handle ? {...fake, unfinished: false} : fake,
    );
    await this.save();
  }

  onTransaction(listener: (tx: StoreTransaction) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  run = async (command: string): Promise<string> => {
    const [verb, arg = ''] = command.split('::');
    switch (verb) {
      case 'api':
        this.state.apiBase = arg || undefined;
        setApiBaseOverride(this.state.apiBase);
        break;
      case 'products':
        this.state.products = Object.fromEntries(
          arg
            .split('|')
            .filter(Boolean)
            .map(entry => {
              const at = entry.indexOf('=');
              return [entry.slice(0, at), entry.slice(at + 1)];
            }),
        );
        break;
      case 'next':
        this.state.next = arg;
        break;
      case 'approve_pending': {
        const approved = this.state.pending.filter(
          tx => !arg || tx.productId === arg,
        );
        this.state.pending = this.state.pending.filter(
          tx => !approved.includes(tx),
        );
        const purchased = approved.map(tx => ({
          ...tx,
          state: 'purchased' as const,
          unfinished: true,
        }));
        this.state.owned.push(...purchased);
        await this.save();
        purchased.forEach(tx => this.emit(tx));
        return this.summary();
      }
      case 'decline_pending':
        this.state.pending = this.state.pending.filter(
          tx => arg && tx.productId !== arg,
        );
        break;
      case 'refund':
        this.state.owned = this.state.owned.filter(tx => tx.productId !== arg);
        break;
      case 'entitle':
        this.state.owned.push({
          ...this.newTransaction(arg, 'purchased'),
          unfinished: false,
        });
        break;
      case 'unfinished':
        this.state.owned.push(this.newTransaction(arg, 'purchased'));
        break;
      case 'unavailable':
        this.state.unavailable = arg !== 'off';
        break;
      case 'reset':
        this.state = initialState();
        setApiBaseOverride(undefined);
        this.finished = [];
        this.syncCount = 0;
        break;
      case 'read':
        return this.summary();
      default:
        return `${MARKER} unknown command: ${verb}`;
    }
    await this.save();
    return this.summary();
  };

  private summary(): string {
    return JSON.stringify({
      marker: MARKER,
      next: this.state.next,
      owned: this.state.owned,
      pending: this.state.pending,
      unavailable: this.state.unavailable,
      finished: this.finished,
      syncCount: this.syncCount,
    });
  }
}

export const fakeStore = new FakeStore();
