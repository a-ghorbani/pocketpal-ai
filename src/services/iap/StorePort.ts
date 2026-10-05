import type {Binding, StoreProof} from './iapWire';

export interface StoreProduct {
  productId: string;
  displayPrice: string;
}

export interface StoreTransaction {
  productId: string;
  transactionId?: string;
  state: 'purchased' | 'pending';
  unfinished: boolean;
  proof: StoreProof;
  handle: unknown;
}

export interface StoreQuery {
  ok: boolean;
  transactions: StoreTransaction[];
}

export type PurchaseOutcome =
  | {kind: 'purchased'; tx: StoreTransaction}
  | {kind: 'pending'}
  | {kind: 'already_owned'}
  | {kind: 'cancelled'}
  | {kind: 'error'; code: string};

export interface StorePort {
  init(): Promise<boolean>;
  fetchProducts(productIds: string[]): Promise<StoreProduct[]>;
  storefront(): Promise<string | undefined>;
  purchase(
    productId: string,
    binding: Binding | null,
  ): Promise<PurchaseOutcome>;
  unfinished(): Promise<StoreTransaction[]>;
  currentEntitlements(): Promise<StoreQuery>;
  sync(): Promise<void>;
  finish(tx: StoreTransaction): Promise<void>;
  onTransaction(listener: (tx: StoreTransaction) => void): () => void;
}
