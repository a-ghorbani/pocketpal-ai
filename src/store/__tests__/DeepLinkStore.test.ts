import {deepLinkStore} from '../DeepLinkStore';

describe('DeepLinkStore voice conversation requests', () => {
  beforeEach(() => {
    deepLinkStore.pendingVoiceConversationRequestId = null;
  });

  it('uses distinct request IDs and consumes only the current request', () => {
    deepLinkStore.requestVoiceConversation();
    const first = deepLinkStore.pendingVoiceConversationRequestId;

    deepLinkStore.requestVoiceConversation();
    const second = deepLinkStore.pendingVoiceConversationRequestId;

    expect(first).not.toBeNull();
    expect(second).not.toBe(first);

    deepLinkStore.consumeVoiceConversationRequest(first!);
    expect(deepLinkStore.pendingVoiceConversationRequestId).toBe(second);

    deepLinkStore.consumeVoiceConversationRequest(second!);
    expect(deepLinkStore.pendingVoiceConversationRequestId).toBeNull();
  });

  it('clears the current request without requiring its ID', () => {
    deepLinkStore.requestVoiceConversation();

    deepLinkStore.clearVoiceConversationRequest();

    expect(deepLinkStore.pendingVoiceConversationRequestId).toBeNull();
  });
});
