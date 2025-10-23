/**
 * Mock DeepLinkStore for testing
 */

export class DeepLinkStore {
  pendingMessage: string | null = null;

  setPendingMessage = jest.fn((message: string | null) => {
    this.pendingMessage = message;
  });

  clearPendingMessage = jest.fn(() => {
    this.pendingMessage = null;
  });
}

export const deepLinkStore = new DeepLinkStore();
