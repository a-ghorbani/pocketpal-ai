/**
 * Mock CheckoutFlowStore for testing
 */

import {makeAutoObservable} from 'mobx';

class MockCheckoutFlowStore {
  status:
    | 'idle'
    | 'creating'
    | 'browser_open'
    | 'finalizing'
    | 'owned'
    | 'processing_deferred'
    | 'cancelled'
    | 'error' = 'idle';
  palId: string | null = null;
  purchaseId?: string;
  errorKind?: '401' | '404' | '500' | 'network';

  start: jest.Mock;
  onReturn: jest.Mock;
  reset: jest.Mock;

  constructor() {
    makeAutoObservable(this, {
      start: false,
      onReturn: false,
      reset: false,
    });
    this.start = jest.fn().mockResolvedValue(undefined);
    this.onReturn = jest.fn();
    this.reset = jest.fn();
  }

  get isInFlight(): boolean {
    return this.status === 'creating' || this.status === 'finalizing';
  }
}

export const checkoutFlowStore = new MockCheckoutFlowStore();
