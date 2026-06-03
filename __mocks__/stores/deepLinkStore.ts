/**
 * Mock DeepLinkStore for testing
 */

import type {HubRunRequest} from '../../src/services/hubRunLink';

export class DeepLinkStore {
  pendingMessage: string | null = null;
  pendingHubRun: HubRunRequest | null = null;

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
}

export const deepLinkStore = new DeepLinkStore();
