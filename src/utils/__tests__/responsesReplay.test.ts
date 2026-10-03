import type {ResponsesReplayState} from '../../api/responsesTypes';
import type {ChatMessage} from '../types';
import {
  buildResponsesReplayInput,
  ResponsesReplayValidationError,
} from '../responsesReplay';

const binding = {
  wireApi: 'responses' as const,
  serverId: 'server-1',
  serverUrl: 'HTTPS://Example.test/v1/',
  serverType: 'GitHub Copilot',
  modelId: 'gpt-test',
  credentialRevision: 3,
};

const state = (
  output: ResponsesReplayState['output'],
  overrides: Partial<ResponsesReplayState> = {},
): ResponsesReplayState => ({
  version: 1,
  binding: {...binding, serverUrl: 'https://example.test/v1'},
  output,
  terminalStatus: 'completed',
  ...overrides,
});

const toolCall = (id: string, name = 'lookup') => ({
  id,
  type: 'function' as const,
  function: {name, arguments: `{"id":"${id}"}`},
});

describe('buildResponsesReplayInput', () => {
  it('replaces matching portable assistant text and calls exactly once', () => {
    const messages: ChatMessage[] = [
      {role: 'user', content: 'question'},
      {
        role: 'assistant',
        content: 'visible preamble',
        tool_calls: [toolCall('call-1')],
      },
      {role: 'tool', tool_call_id: 'call-1', content: 'tool result'},
    ];
    const replay = state([
      {
        type: 'message',
        id: 'msg-1',
        role: 'assistant',
        phase: 'commentary',
        status: 'completed',
        content: [{type: 'output_text', text: 'visible preamble'}],
      },
      {
        type: 'function_call',
        id: 'item-1',
        call_id: 'call-1',
        name: 'lookup',
        arguments: '{"id":"call-1"}',
        status: 'completed',
      },
    ]);

    const result = buildResponsesReplayInput(messages, {
      binding,
      messageMetadata: [undefined, {responsesState: replay}],
    });

    expect(result).toEqual([
      {role: 'user', content: 'question'},
      replay.output[0],
      replay.output[1],
      {
        type: 'function_call_output',
        call_id: 'call-1',
        output: 'tool result',
      },
    ]);
    expect(
      result.filter(
        item =>
          !('type' in item) && 'role' in item && item.role === 'assistant',
      ),
    ).toHaveLength(0);
  });

  it('preserves output order, encrypted reasoning, phase, and distinct ids', () => {
    const replay = state([
      {
        type: 'reasoning',
        id: 'reasoning-item',
        encrypted_content: 'encrypted-payload',
        summary: [{type: 'summary_text', text: 'summary'}],
      },
      {
        type: 'message',
        id: 'message-item',
        role: 'assistant',
        phase: 'commentary',
        content: [{type: 'output_text', text: 'first'}],
      },
      {
        type: 'function_call',
        id: 'output-item-id',
        call_id: 'call-id',
        name: 'lookup',
        arguments: '{"id":"call-id"}',
      },
      {
        type: 'message',
        id: 'final-item',
        role: 'assistant',
        phase: 'final_answer',
        content: [{type: 'output_text', text: 'last'}],
      },
    ]);
    const result = buildResponsesReplayInput(
      [
        {
          role: 'assistant',
          content: 'first\nlast',
          tool_calls: [toolCall('call-id')],
        },
        {role: 'tool', tool_call_id: 'call-id', content: 'done'},
      ],
      {binding, messageMetadata: [{responsesState: replay}]},
    );

    expect(result.slice(0, 4)).toEqual(replay.output);
    expect(result[0]).toMatchObject({
      encrypted_content: 'encrypted-payload',
    });
    expect(result[1]).toMatchObject({phase: 'commentary'});
    expect(result[2]).toMatchObject({
      id: 'output-item-id',
      call_id: 'call-id',
    });
    expect(result[3]).toMatchObject({phase: 'final_answer'});
  });

  it.each([
    ['server', {serverId: 'server-2'}],
    ['url', {serverUrl: 'https://foreign.test/v1'}],
    ['type', {serverType: 'OpenAI'}],
    ['model', {modelId: 'other-model'}],
    ['protocol', {wireApi: 'chat-completions'}],
    ['revision', {credentialRevision: 4}],
  ])('isolates foreign %s replay state', (_label, bindingOverride) => {
    const foreign = {
      ...state([]),
      binding: {...binding, ...bindingOverride},
    };
    const messages: ChatMessage[] = [
      {role: 'assistant', content: 'portable text'},
    ];

    expect(
      buildResponsesReplayInput(messages, {
        binding,
        messageMetadata: [{responsesState: foreign}],
      }),
    ).toEqual([{role: 'assistant', content: 'portable text'}]);
  });

  it('maps legacy text, multiple calls, and following tool results', () => {
    const result = buildResponsesReplayInput(
      [
        {
          role: 'assistant',
          content: 'checking',
          tool_calls: [toolCall('call-1'), toolCall('call-2', 'search')],
        },
        {role: 'tool', tool_call_id: 'call-2', content: 'second'},
        {role: 'tool', tool_call_id: 'call-1', content: 'first'},
      ],
      {binding},
    );

    expect(result).toEqual([
      {role: 'assistant', content: 'checking'},
      {
        type: 'function_call',
        call_id: 'call-1',
        name: 'lookup',
        arguments: '{"id":"call-1"}',
        status: 'completed',
      },
      {
        type: 'function_call',
        call_id: 'call-2',
        name: 'search',
        arguments: '{"id":"call-2"}',
        status: 'completed',
      },
      {type: 'function_call_output', call_id: 'call-2', output: 'second'},
      {type: 'function_call_output', call_id: 'call-1', output: 'first'},
    ]);
    expect(result[1]).not.toHaveProperty('id');
  });

  it.each([
    [
      'orphan-tool-output',
      [{role: 'tool', tool_call_id: 'missing', content: 'nope'}],
    ],
    [
      'duplicate-tool-output',
      [
        {
          role: 'assistant',
          content: '',
          tool_calls: [toolCall('call-1')],
        },
        {role: 'tool', tool_call_id: 'call-1', content: 'one'},
        {role: 'tool', tool_call_id: 'call-1', content: 'two'},
      ],
    ],
    [
      'missing-tool-output',
      [
        {
          role: 'assistant',
          content: '',
          tool_calls: [toolCall('call-1')],
        },
        {role: 'user', content: 'next'},
      ],
    ],
  ])('rejects %s histories', (code, messages) => {
    expect(() =>
      buildResponsesReplayInput(messages as ChatMessage[], {binding}),
    ).toThrow(
      expect.objectContaining<Partial<ResponsesReplayValidationError>>({
        code: code as ResponsesReplayValidationError['code'],
      }),
    );
  });

  it.each([
    [
      'malformed matching state',
      {
        ...state([]),
        terminalStatus: 'incomplete',
      },
      'invalid-replay-state',
    ],
    [
      'incomplete output item',
      state([
        {
          type: 'message',
          id: 'msg-1',
          role: 'assistant',
          status: 'incomplete',
          content: [{type: 'output_text', text: 'partial'}],
        },
      ]),
      'incomplete-replay-item',
    ],
    [
      'inconsistent call ids',
      state([
        {
          type: 'function_call',
          id: 'item-1',
          call_id: 'different-call',
          name: 'lookup',
          arguments: '{}',
        },
      ]),
      'inconsistent-call-ids',
    ],
  ])('returns actionable errors for %s', (_label, replay, code) => {
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        content: 'portable',
        tool_calls:
          code === 'inconsistent-call-ids' ? [toolCall('call-1')] : undefined,
      },
    ];
    try {
      buildResponsesReplayInput(messages, {
        binding,
        messageMetadata: [{responsesState: replay}],
      });
      throw new Error('expected replay validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ResponsesReplayValidationError);
      expect(error).toMatchObject({
        code: code as ResponsesReplayValidationError['code'],
        messageIndex: 0,
      });
      expect((error as Error).message).toMatch(/Assistant message 0/);
    }
  });

  it('does not mutate portable history, metadata, or replay state', () => {
    const replay = state([
      {
        type: 'message',
        id: 'msg-1',
        role: 'assistant',
        content: [
          {type: 'output_text', text: 'text', annotations: [{kind: 'test'}]},
        ],
      },
    ]);
    const messages: ChatMessage[] = [{role: 'assistant', content: 'text'}];
    const metadata = [{responsesState: replay}];
    const before = JSON.stringify({messages, metadata});

    const result = buildResponsesReplayInput(messages, {
      binding,
      messageMetadata: metadata,
    });

    expect(JSON.stringify({messages, metadata})).toBe(before);
    expect(result[0]).not.toBe(replay.output[0]);
    expect((result[0] as any).content).not.toBe(
      (replay.output[0] as any).content,
    );
  });
});
