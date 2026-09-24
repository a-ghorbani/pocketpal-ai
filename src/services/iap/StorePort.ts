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

export type PurchaseOutcome =
  | {kind: 'purchased'; tx: StoreTransaction}
  | {kind: 'pending'}
  | {kind: 'already_owned'}
  | {kind: 'cancelled'}
  | {kind: 'error'; code: string; downgrade: boolean};

export interface StorePort {
  readonly queryOk: boolean;
  init(): Promise<boolean>;
  fetchProducts(productIds: string[]): Promise<StoreProduct[]>;
  purchase(
    productId: string,
    binding: Binding | null,
  ): Promise<PurchaseOutcome>;
  unfinished(): Promise<StoreTransaction[]>;
  currentEntitlements(): Promise<StoreTransaction[]>;
  sync(): Promise<void>;
  finish(tx: StoreTransaction): Promise<void>;
  onTransaction(listener: (tx: StoreTransaction) => void): () => void;
}
