/**
 * Tests for the toolMessages rename (TASK-20260426-1600)
 *
 * Verifies that convertToChatMessages reads metadata.toolMessages
 * (not the old metadata.talentResults) for the wire payload.
 */
import {convertToChatMessages, assistant} from '../chat';
import type {MessageType} from '../types';

describe('convertToChatMessages: toolMessages wire payload', () => {
  it('reads toolMessages from metadata for tool role messages', () => {
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
              function: {name: 'calculate', arguments: '{"expression":"2+2"}'},
            },
          ],
          toolMessages: [{tool_call_id: 'call_1', content: '2+2 = 4'}],
          // talentResults is the result map (for UI), not the wire payload
          talentResults: {
            call_1: {type: 'text', summary: '2+2 = 4'},
          },
        } as any,
      },
    ];

    const result = convertToChatMessages(messages);

    // Should produce assistant with tool_calls + tool role message
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe('assistant');
    expect(result[0].tool_calls).toBeDefined();
    expect(result[1].role).toBe('tool');
    expect(result[1].tool_call_id).toBe('call_1');
    expect(result[1].content).toBe('2+2 = 4');
  });

  it('does not read talentResults (the result map) as wire payload', () => {
    // If code incorrectly read talentResults as wire payload, it would
    // try to use the TalentResult objects as {tool_call_id, content}
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
          // toolMessages absent -- should produce no tool-role messages
          talentResults: {
            call_1: {
              type: 'html',
              html: '<b/>',
              title: 'X',
              summary: 'Rendered HTML preview: "X"',
            },
          },
        } as any,
      },
    ];

    const result = convertToChatMessages(messages);

    // Only the assistant message with tool_calls, no tool messages
    // (toolMessages was not present, so toolResults defaults to [])
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('assistant');
    expect(result[0].tool_calls).toBeDefined();
  });

  it('handles multiple toolMessages for multiple calls', () => {
    const messages: MessageType.Text[] = [
      {
        id: '1',
        author: assistant,
        text: 'Here are the results:',
        type: 'text',
        createdAt: 1,
        metadata: {
          talentCalls: [
            {
              id: 'call_a',
              type: 'function',
              function: {name: 'calculate', arguments: '{"expression":"1+1"}'},
            },
            {
              id: 'call_b',
              type: 'function',
              function: {name: 'datetime', arguments: '{"action":"now"}'},
            },
          ],
          toolMessages: [
            {tool_call_id: 'call_a', content: '1+1 = 2'},
            {tool_call_id: 'call_b', content: '2026-04-15T12:00:00Z'},
          ],
        } as any,
      },
    ];

    const result = convertToChatMessages(messages);

    expect(result).toHaveLength(3);
    expect(result[0].role).toBe('assistant');
    expect(result[0].content).toBe('Here are the results:');
    expect(result[1]).toEqual({
      role: 'tool',
      tool_call_id: 'call_a',
      content: '1+1 = 2',
    });
    expect(result[2]).toEqual({
      role: 'tool',
      tool_call_id: 'call_b',
      content: '2026-04-15T12:00:00Z',
    });
  });

  it('toolMessages with empty array produces no tool-role messages', () => {
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
              function: {name: 'render_html', arguments: '{}'},
            },
          ],
          toolMessages: [],
        } as any,
      },
    ];

    const result = convertToChatMessages(messages);

    // Assistant with tool_calls but no tool-role messages
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('assistant');
    expect(result[0].tool_calls).toBeDefined();
  });
});
