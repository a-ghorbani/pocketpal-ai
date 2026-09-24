import {
  shouldCompactSession,
  sanitizeMessage,
  partitionMessagesForCompaction,
  buildCompactionPrompt,
  executeCompaction,
} from '../compactionService';
import {
  CompletionResultSnapshot,
  CompletionEngine,
} from '../../../utils/completionTypes';
import {MessageType, User} from '../../../utils/types';
import {assistant} from '../../../utils/chat';

const mockUser: User = {id: 'user_123'};

describe('compactionService', () => {
  describe('shouldCompactSession', () => {
    it('returns false when snapshot is undefined', () => {
      expect(shouldCompactSession(undefined, 2048)).toBe(false);
    });

    it('returns false when effectiveNCtx is invalid or missing', () => {
      const snap: CompletionResultSnapshot = {
        used: 2000,
        contextFull: false,
        isRemote: false,
      };
      expect(shouldCompactSession(snap, undefined)).toBe(false);
      expect(shouldCompactSession(snap, 0)).toBe(false);
    });

    it('returns true unconditionally when snapshot has contextFull flag', () => {
      const snap: CompletionResultSnapshot = {
        used: 500,
        contextFull: true,
        isRemote: false,
      };
      expect(shouldCompactSession(snap, 2048)).toBe(true);
    });

    it('evaluates dynamic token headroom for n_ctx = 2048 (buffer = 512, limit = 1536)', () => {
      // 2048 * 0.15 = 307.2, max(512, 308) = 512 -> limit = 2048 - 512 = 1536
      const below: CompletionResultSnapshot = {
        used: 1500,
        contextFull: false,
        isRemote: false,
      };
      const atLimit: CompletionResultSnapshot = {
        used: 1536,
        contextFull: false,
        isRemote: false,
      };
      const above: CompletionResultSnapshot = {
        used: 1800,
        contextFull: false,
        isRemote: false,
      };

      expect(shouldCompactSession(below, 2048)).toBe(false);
      expect(shouldCompactSession(atLimit, 2048)).toBe(true);
      expect(shouldCompactSession(above, 2048)).toBe(true);
    });

    it('evaluates dynamic token headroom for n_ctx = 4096 (buffer = 615, limit = 3481)', () => {
      // 4096 * 0.15 = 614.4 -> ceil = 615 -> limit = 4096 - 615 = 3481
      const below: CompletionResultSnapshot = {
        used: 3400,
        contextFull: false,
        isRemote: false,
      };
      const above: CompletionResultSnapshot = {
        used: 3500,
        contextFull: false,
        isRemote: false,
      };

      expect(shouldCompactSession(below, 4096)).toBe(false);
      expect(shouldCompactSession(above, 4096)).toBe(true);
    });

    it('evaluates dynamic token headroom for n_ctx = 8192 (buffer = 1229, limit = 6963)', () => {
      // 8192 * 0.15 = 1228.8 -> ceil = 1229 -> limit = 8192 - 1229 = 6963
      const below: CompletionResultSnapshot = {
        used: 6900,
        contextFull: false,
        isRemote: false,
      };
      const above: CompletionResultSnapshot = {
        used: 7000,
        contextFull: false,
        isRemote: false,
      };

      expect(shouldCompactSession(below, 8192)).toBe(false);
      expect(shouldCompactSession(above, 8192)).toBe(true);
    });

    it('supports custom threshold override', () => {
      const snap: CompletionResultSnapshot = {
        used: 1800,
        contextFull: false,
        isRemote: false,
      };
      // 1800 / 2048 = 0.878
      expect(shouldCompactSession(snap, 2048, {threshold: 0.9})).toBe(false);
      expect(shouldCompactSession(snap, 2048, {threshold: 0.85})).toBe(true);
    });
  });

  describe('sanitizeMessage', () => {
    it('sanitizes user text messages with images', () => {
      const msg: MessageType.Text = {
        id: 'msg_1',
        type: 'text',
        author: mockUser,
        text: 'Look at this diagram',
        imageUris: ['file:///path/to/diagram.png'],
      };

      const sanitized = sanitizeMessage(msg);
      expect(sanitized).toEqual({
        role: 'user',
        sanitizedContent: 'Look at this diagram [Attached Image 1]',
      });
    });

    it('sanitizes assistant turns with tool calls and tool outcomes', () => {
      const msg: MessageType.AssistantTurn = {
        id: 'turn_1',
        type: 'assistant_turn',
        author: assistant,
        steps: [
          {
            content: 'I will search for the weather.',
            toolCalls: [
              {
                id: 'call_1',
                type: 'function',
                function: {name: 'web_search', arguments: '{"q":"weather"}'},
              },
            ],
            toolOutcomes: [
              {
                callId: 'call_1',
                toolName: 'web_search',
                result: {type: 'text', summary: 'success'},
                responseContent:
                  'A very long scraped text from web search that should be truncated because it has more than 150 characters and we do not want to blow up the context window during summarization pass.',
              },
            ],
          },
          {
            content: 'The weather is sunny and 72°F.',
          },
        ],
      };

      const sanitized = sanitizeMessage(msg);
      expect(sanitized?.role).toBe('assistant');
      expect(sanitized?.sanitizedContent).toContain(
        'I will search for the weather.',
      );
      expect(sanitized?.sanitizedContent).toContain('[Used Tool: web_search]');
      expect(sanitized?.sanitizedContent).toContain(
        '[Tool Result (web_search):',
      );
      expect(sanitized?.sanitizedContent).toContain('(truncated)');
      expect(sanitized?.sanitizedContent).toContain(
        'The weather is sunny and 72°F.',
      );
    });

    it('sanitizes existing compaction markers', () => {
      const msg: MessageType.Custom = {
        id: 'comp_1',
        type: 'custom',
        author: assistant,
        metadata: {
          compaction: true,
          summary: 'Prior summary of goals and facts.',
        },
      };

      const sanitized = sanitizeMessage(msg);
      expect(sanitized).toEqual({
        role: 'system',
        sanitizedContent:
          '[Prior Compaction Summary]: Prior summary of goals and facts.',
      });
    });
  });

  describe('partitionMessagesForCompaction', () => {
    const createMsg = (
      id: string,
      text: string,
      createdAt: number,
      isAssistant = false,
    ): MessageType.Text => ({
      id,
      type: 'text',
      author: isAssistant ? assistant : mockUser,
      text,
      createdAt,
    });

    it('returns null if there are fewer than preserved turns + 1 messages', () => {
      const messages = [
        createMsg('1', 'Hello', 1000),
        createMsg('2', 'Hi there', 2000, true),
        createMsg('3', 'How are you?', 3000),
        createMsg('4', 'I am good', 4000, true),
      ];

      // Default preserved turns = 2 (4 messages), total is 4, so nothing left to summarize
      expect(partitionMessagesForCompaction(messages, 2)).toBeNull();
    });

    it('partitions older messages and preserves latest 2 turns verbatim', () => {
      const messages = [
        createMsg('1', 'Topic introduction', 1000),
        createMsg('2', 'Explanation A', 2000, true),
        createMsg('3', 'Topic B question', 3000),
        createMsg('4', 'Explanation B', 4000, true),
        createMsg('5', 'Recent turn 1', 5000),
        createMsg('6', 'Recent reply 1', 6000, true),
        createMsg('7', 'Recent turn 2', 7000),
        createMsg('8', 'Recent reply 2', 8000, true),
      ];

      const partition = partitionMessagesForCompaction(messages, 2);
      expect(partition).not.toBeNull();
      expect(partition!.toPreserve.map(m => m.id)).toEqual([
        '5',
        '6',
        '7',
        '8',
      ]);
      expect(partition!.messageIdsToArchive).toEqual(['1', '2', '3', '4']);
      expect(partition!.toSummarize.length).toBe(4);
      // Marker timestamp should be midway between message 4 (4000) and message 5 (5000) = 4500
      expect(partition!.markerTimestamp).toBe(4500);
    });

    it('chains multi-round compactions by extracting priorSummary and archiving old marker', () => {
      const oldCompactionMarker: MessageType.Custom = {
        id: 'comp_marker_1',
        type: 'custom',
        author: assistant,
        createdAt: 2000,
        metadata: {
          compaction: true,
          summary: 'Round 1 summary: User is building an iOS app.',
        },
      };

      const messages: MessageType.Any[] = [
        oldCompactionMarker,
        createMsg('3', 'We need push notifications', 3000),
        createMsg('4', 'Here is APNs setup', 4000, true),
        createMsg('5', 'Now analytics', 5000),
        createMsg('6', 'Here is Firebase setup', 6000, true),
        createMsg('7', 'Latest question', 7000),
        createMsg('8', 'Latest answer', 8000, true),
      ];

      const partition = partitionMessagesForCompaction(messages, 2);
      expect(partition).not.toBeNull();
      expect(partition!.priorSummary).toBe(
        'Round 1 summary: User is building an iOS app.',
      );
      expect(partition!.messageIdsToArchive).toContain('comp_marker_1');
      expect(partition!.toPreserve.map(m => m.id)).toEqual([
        '5',
        '6',
        '7',
        '8',
      ]);
    });
  });

  describe('buildCompactionPrompt', () => {
    it('builds structured prompt with required sections', () => {
      const messages = [
        {
          role: 'user' as const,
          sanitizedContent: 'We are designing a database schema.',
        },
        {
          role: 'assistant' as const,
          sanitizedContent: 'We should use SQLite with WatermelonDB.',
        },
      ];

      const prompt = buildCompactionPrompt(messages);
      expect(prompt).toContain('You are a conversation summarizer.');
      expect(prompt).toContain('Do NOT output reasoning or <think> tags.');
      expect(prompt).toContain('### Primary Goal');
      expect(prompt).toContain('### Key Decisions & Facts');
      expect(prompt).toContain('### Current State & Next Steps');
      expect(prompt).toContain('USER: We are designing a database schema.');
      expect(prompt).toContain(
        'ASSISTANT: We should use SQLite with WatermelonDB.',
      );
    });

    it('includes special focus instruction when provided', () => {
      const messages = [
        {role: 'user' as const, sanitizedContent: 'Let us discuss indexing.'},
      ];
      const prompt = buildCompactionPrompt(
        messages,
        'Focus heavily on index performance',
      );
      expect(prompt).toContain(
        'Special User Focus: Give extra priority and detail to: "Focus heavily on index performance"',
      );
    });

    it('includes prior summary when chaining compactions', () => {
      const messages = [
        {role: 'user' as const, sanitizedContent: 'Continuing the feature.'},
      ];
      const prompt = buildCompactionPrompt(
        messages,
        undefined,
        'Initial setup completed.',
      );
      expect(prompt).toContain('### Previous Summary of Earlier Turns');
      expect(prompt).toContain('Initial setup completed.');
    });
  });

  describe('executeCompaction', () => {
    it('executes completion with n_predict=256, temperature=0.2 and strips think tags', async () => {
      const mockEngine: CompletionEngine = {
        completion: jest.fn().mockResolvedValue({
          text: '<think>I should summarize this well</think>### Primary Goal\nBuild app\n\n### Key Decisions & Facts\n- SQLite used',
        }),
        stopCompletion: jest.fn().mockResolvedValue(undefined),
      };

      const result = await executeCompaction(
        mockEngine,
        'Summarize this prompt',
      );

      expect(mockEngine.completion).toHaveBeenCalledWith(
        expect.objectContaining({
          n_predict: 256,
          temperature: 0.2,
          enable_thinking: false,
        }),
      );
      expect(result).not.toContain('<think>');
      expect(result).toContain('### Primary Goal\nBuild app');
    });

    it('throws error if completion produces empty summary', async () => {
      const mockEngine: CompletionEngine = {
        completion: jest.fn().mockResolvedValue({text: ''}),
        stopCompletion: jest.fn().mockResolvedValue(undefined),
      };

      await expect(executeCompaction(mockEngine, 'prompt')).rejects.toThrow(
        'Compaction produced an empty summary.',
      );
    });
  });
});
