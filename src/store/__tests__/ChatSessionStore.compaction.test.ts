import {chatSessionStore} from '../ChatSessionStore';
import {chatSessionRepository} from '../../repositories/ChatSessionRepository';
import {MessageType, User} from '../../utils/types';
import {assistant} from '../../utils/chat';
import {CompletionEngine} from '../../utils/completionTypes';

const mockUser: User = {id: 'user_1', firstName: 'Tester'};

describe('ChatSessionStore compaction integration', () => {
  const createMsg = (id: string, text: string, createdAt: number, isAssistant = false): MessageType.Text => ({
    id,
    type: 'text',
    author: isAssistant ? assistant : mockUser,
    text,
    createdAt,
    metadata: {},
  });

  beforeEach(() => {
    jest.clearAllMocks();
    chatSessionStore.sessions = [];
    chatSessionStore.activeSessionId = null;
    chatSessionStore.isCompacting = false;
    chatSessionStore.lastCompletionResult = {
      used: 1900,
      contextFull: true,
      isRemote: false,
    };
    chatSessionStore.consecutiveFullFailures = 2;
    chatSessionStore.dismissedBannerVariants = new Set(['context-full']);
  });

  it('filters out soft-archived messages from currentSessionMessages', () => {
    const session = {
      id: 'sess_1',
      title: 'Test Session',
      date: new Date().toISOString(),
      messagesLoaded: true,
      messages: [
        createMsg('1', 'Old message 1', 1000),
        {...createMsg('2', 'Old message 2', 2000, true), metadata: {isCompacted: true}},
        createMsg('3', 'Recent message 3', 3000),
      ],
    };

    chatSessionStore.sessions = [session as any];
    chatSessionStore.activeSessionId = 'sess_1';

    const visible = chatSessionStore.currentSessionMessages;
    expect(visible.map(m => m.id)).toEqual(['1', '3']);
    expect(visible.some(m => m.metadata?.isCompacted)).toBe(false);
  });

  it('resets context metrics upon resetContextMetrics()', () => {
    expect(chatSessionStore.lastCompletionResult).toBeDefined();
    expect(chatSessionStore.consecutiveFullFailures).toBe(2);

    chatSessionStore.resetContextMetrics();

    expect(chatSessionStore.lastCompletionResult).toBeUndefined();
    expect(chatSessionStore.consecutiveFullFailures).toBe(0);
    expect(chatSessionStore.dismissedBannerVariants.size).toBe(0);
  });

  it('aborts and cleans up when cancelCompaction is invoked', () => {
    chatSessionStore.compactionAbortController = new AbortController();
    chatSessionStore.isCompacting = true;

    chatSessionStore.cancelCompaction();

    expect(chatSessionStore.isCompacting).toBe(false);
    expect(chatSessionStore.compactionAbortController).toBeNull();
  });

  it('executes compactActiveSession successfully', async () => {
    const session = {
      id: 'sess_1',
      title: 'Session to compact',
      date: new Date().toISOString(),
      messagesLoaded: true,
      messages: [
        createMsg('1', 'Turn 1 User', 1000),
        createMsg('2', 'Turn 1 Assistant', 2000, true),
        createMsg('3', 'Turn 2 User', 3000),
        createMsg('4', 'Turn 2 Assistant', 4000, true),
        createMsg('5', 'Turn 3 User', 5000),
        createMsg('6', 'Turn 3 Assistant', 6000, true),
      ],
    };

    chatSessionStore.sessions = [session as any];
    chatSessionStore.activeSessionId = 'sess_1';

    const mockEngine: CompletionEngine = {
      completion: jest.fn().mockResolvedValue({
        text: '### Primary Goal\nBuild features\n\n### Key Decisions & Facts\n- Decision A',
      }),
      stopCompletion: jest.fn().mockResolvedValue(undefined),
    };

    const spySoftArchive = jest.spyOn(
      chatSessionRepository,
      'softArchiveMessagesAndAddCompaction',
    );

    const success = await chatSessionStore.compactActiveSession(
      'focus on Decision A',
      mockEngine,
    );

    expect(success).toBe(true);
    expect(chatSessionStore.isCompacting).toBe(false);
    expect(chatSessionStore.lastCompletionResult).toBeUndefined();
    expect(chatSessionStore.consecutiveFullFailures).toBe(0);

    expect(spySoftArchive).toHaveBeenCalledWith(
      'sess_1',
      ['1', '2'], // Messages 1 and 2 summarized (last 4 preserved: 3, 4, 5, 6)
      expect.objectContaining({
        type: 'custom',
        metadata: expect.objectContaining({
          compaction: true,
          compactedCount: 2,
          focusInstruction: 'focus on Decision A',
        }),
      }),
    );
  });
});
