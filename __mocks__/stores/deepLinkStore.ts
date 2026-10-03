/**
 * Mock DeepLinkStore for testing
 */

import type {HubRunRequest} from '../../src/services/hubRunLink';

export class DeepLinkStore {
  pendingMessage: string | null = null;
  pendingHubRun: HubRunRequest | null = null;
  pendingVoiceConversationRequestId: number | null = null;
  private nextVoiceConversationRequestId = 1;

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

  requestVoiceConversation = jest.fn(() => {
    this.pendingVoiceConversationRequestId = this
      .nextVoiceConversationRequestId++;
  });

  clearVoiceConversationRequest = jest.fn(() => {
    this.pendingVoiceConversationRequestId = null;
  });

  consumeVoiceConversationRequest = jest.fn((requestId: number) => {
    if (this.pendingVoiceConversationRequestId === requestId) {
      this.pendingVoiceConversationRequestId = null;
    }
  });
}

export const deepLinkStore = new DeepLinkStore();
