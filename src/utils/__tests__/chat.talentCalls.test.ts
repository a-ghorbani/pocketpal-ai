import {convertToChatMessages, user, assistant} from '../chat';
import {ChatMessage, MessageType} from '../types';

/**
 * Regression suite for the TASK-20260415-1030 structural refactor of
 * convertToChatMessages: it moved from `.map().reverse()` producing a single
 * ChatMessage per text-message into `.map(→ChatMessage[]).reverse().flat()`.
 *
 * These tests lock down the byte-identical output for the NON-tool-call paths
 * (text-only, multimodal, mixed). The additive tool-call branch is validated
 * separately below.
 */
describe('convertToChatMessages (structural refactor regression)', () => {
  it('produces chronological order for a text-only conversation', () => {
    const now = 1_700_000_000;
    const messages: MessageType.Text[] = [
      // Note: chat transcripts are stored newest-first, the fn reverses.
      {id: '3', author: user, text: 'q2', type: 'text', createdAt: now + 3},
      {
        id: '2',
        author: assistant,
        text: 'a1',
        type: 'text',
        createdAt: now + 2,
      },
      {id: '1', author: user, text: 'q1', type: 'text', createdAt: now + 1},
    ];
    const result = convertToChatMessages(messages);
    expect(result).toEqual([
      {role: 'user', content: 'q1'},
      {role: 'assistant', content: 'a1'},
      {role: 'user', content: 'q2'},
    ] as ChatMessage[]);
  });

  it('preserves reasoning_content on assistant text messages', () => {
    const messages: MessageType.Text[] = [
      {
        id: '1',
        author: assistant,
        text: 'The answer is 42.',
        type: 'text',
        createdAt: 1,
        metadata: {
          completionResult: {
            reasoning_content: 'Hmm, what is six times seven...',
            content: 'The answer is 42.',
          },
        },
      },
    ];
    const result = convertToChatMessages(messages);
    expect(result).toEqual([
      {
        role: 'assistant',
        content: 'The answer is 42.',
        reasoning_content: 'Hmm, what is six times seven...',
      },
    ] as ChatMessage[]);
  });

  it('falls back to partialCompletionResult.reasoning_content when completionResult absent', () => {
    const messages: MessageType.Text[] = [
      {
        id: '1',
        author: assistant,
        text: 'partial',
        type: 'text',
        createdAt: 1,
        metadata: {
          partialCompletionResult: {
            reasoning_content: 'mid-stream thought',
            content: 'partial',
          },
        },
      },
    ];
    const result = convertToChatMessages(messages);
    expect((result[0] as any).reasoning_content).toBe('mid-stream thought');
  });

  it('does not attach reasoning_content to user messages', () => {
    const messages: MessageType.Text[] = [
      {
        id: '1',
        author: user,
        text: 'hi',
        type: 'text',
        createdAt: 1,
        metadata: {
          completionResult: {reasoning_content: 'leak?', content: 'hi'},
        } as any,
      },
    ];
    const result = convertToChatMessages(messages);
    expect(result).toEqual([{role: 'user', content: 'hi'}]);
    expect((result[0] as any).reasoning_content).toBeUndefined();
  });

  it('keeps assistant messages with empty text when they carry tool_calls', () => {
    const messages: MessageType.Text[] = [
      {
        id: '1',
        author: assistant,
        text: '',
        type: 'text',
        createdAt: 1,
        metadata: {
          talentCalls: [
            {
              id: 'call_1',
              type: 'function',
              function: {name: 'render_html', arguments: '{"html":"<b/>"}'},
            },
          ],
          toolMessages: [
            {tool_call_id: 'call_1', content: 'Rendered HTML preview: "x"'},
          ],
        } as any,
      },
    ];
    const result = convertToChatMessages(messages);
    // Per OpenAI chat spec: assistant-with-tool_calls must PRECEDE its
    // role:'tool' responses so tool_call_id back-refs resolve.
    expect(result).toEqual([
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {name: 'render_html', arguments: '{"html":"<b/>"}'},
          },
        ],
      },
      {
        role: 'tool',
        tool_call_id: 'call_1',
        content: 'Rendered HTML preview: "x"',
      },
    ]);
  });

  it('drops text messages with empty text and no tool_calls', () => {
    const messages: MessageType.Text[] = [
      {id: '1', author: user, text: '   ', type: 'text', createdAt: 1},
      {id: '2', author: assistant, text: 'ok', type: 'text', createdAt: 2},
    ];
    const result = convertToChatMessages(messages);
    expect(result).toEqual([{role: 'assistant', content: 'ok'}]);
  });

  it('interleaves multiple tool calls with subsequent turns correctly', () => {
    // Newest-first input; expect chronological output with assistant-then-tools
    const messages: MessageType.Text[] = [
      {
        id: '3',
        author: assistant,
        text: 'Done.',
        type: 'text',
        createdAt: 3,
      },
      {
        id: '2',
        author: assistant,
        text: '',
        type: 'text',
        createdAt: 2,
        metadata: {
          talentCalls: [
            {
              id: 'a',
              type: 'function',
              function: {name: 'render_html', arguments: '{"html":"<i/>"}'},
            },
            {
              id: 'b',
              type: 'function',
              function: {name: 'render_html', arguments: '{"html":"<u/>"}'},
            },
          ],
          toolMessages: [
            {tool_call_id: 'a', content: 'A'},
            {tool_call_id: 'b', content: 'B'},
          ],
        } as any,
      },
      {id: '1', author: user, text: 'go', type: 'text', createdAt: 1},
    ];
    const result = convertToChatMessages(messages);
    expect(result).toEqual([
      {role: 'user', content: 'go'},
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'a',
            type: 'function',
            function: {name: 'render_html', arguments: '{"html":"<i/>"}'},
          },
          {
            id: 'b',
            type: 'function',
            function: {name: 'render_html', arguments: '{"html":"<u/>"}'},
          },
        ],
      },
      {role: 'tool', tool_call_id: 'a', content: 'A'},
      {role: 'tool', tool_call_id: 'b', content: 'B'},
      {role: 'assistant', content: 'Done.'},
    ]);
  });

  it('does not emit tool branch when toolCalls is an empty array', () => {
    const messages: MessageType.Text[] = [
      {
        id: '1',
        author: assistant,
        text: 'plain',
        type: 'text',
        createdAt: 1,
        metadata: {talentCalls: []} as any,
      },
    ];
    const result = convertToChatMessages(messages);
    expect(result).toEqual([{role: 'assistant', content: 'plain'}]);
  });
});
