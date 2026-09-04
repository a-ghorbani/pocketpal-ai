/**
 * Mock DeepLinkStore for testing
 */

import type {HubRunRequest} from '../../src/services/hubRunLink';
import type {PairingRequest} from '../../src/services/pairingLink';

export class DeepLinkStore {
  pendingMessage: string | null = null;
  pendingHubRun: HubRunRequest | null = null;
  pendingPairing: PairingRequest | null = null;

  setPendingMessage = jest.fn((message: string | null) => {
    this.pendingMessage = message;
  });

  clearPendingMessage = jest.fn(() => {
    this.pendingMessage = null;
  });

  setPendingHubRun = jest.fn((request: HubRunRequest | null) => {
    this.pendingHubRun = request;
  });

  clearPendingHubRun = jest.fn(() => {
    this.pendingHubRun = null;
  });

  setPendingPairing = jest.fn((request: PairingRequest | null) => {
    this.pendingPairing = request;
  });

  clearPendingPairing = jest.fn(() => {
    this.pendingPairing = null;
  });
}

export const deepLinkStore = new DeepLinkStore();
