import {
  createResponsesStreamReducer,
  ResponsesStreamProtocolError,
} from '../responsesStream';

const binding = {
  wireApi: 'responses' as const,
  serverId: 'server-test',
  serverUrl: 'https://example.test/v1',
  serverType: 'Synthetic',
  modelId: 'model-test',
  credentialRevision: 1,
};

const message = (
  id: string,
  status: 'in_progress' | 'completed' = 'in_progress',
) => ({
  type: 'message',
  id,
  role: 'assistant',
  status,
  phase: 'final_answer',
  content: [],
});

describe('ResponsesStreamReducer', () => {
  it('reduces interleaved indexed text, reasoning, and concurrent calls', () => {
    const reducer = createResponsesStreamReducer();
    const snapshots = [
      reducer.reduce({
        type: 'response.created',
        response: {status: 'in_progress'},
      }),
      reducer.reduce({
        type: 'response.output_item.added',
        output_index: 2,
        item: {
          type: 'function_call',
          id: 'function-item-2',
          call_id: 'call-2',
          name: 'second',
          arguments: '',
          status: 'in_progress',
        },
      }),
      reducer.reduce({
        type: 'response.output_item.added',
        output_index: 0,
        item: {
          type: 'reasoning',
          id: 'reasoning-item',
          summary: [],
          encrypted_content: 'opaque-synthetic-value',
        },
      }),
      reducer.reduce({
        type: 'response.reasoning_summary_part.added',
        output_index: 0,
        item_id: 'reasoning-item',
        summary_index: 1,
        part: {type: 'summary_text', text: ''},
      }),
      reducer.reduce({
        type: 'response.reasoning_summary_text.delta',
        output_index: 0,
        item_id: 'reasoning-item',
        summary_index: 1,
        delta: 'reason',
      }),
      reducer.reduce({
        type: 'response.output_item.added',
        output_index: 1,
        item: message('message-item'),
      }),
      reducer.reduce({
        type: 'response.content_part.added',
        output_index: 1,
        item_id: 'message-item',
        content_index: 1,
        part: {type: 'output_text', text: ''},
      }),
      reducer.reduce({
        type: 'response.output_text.delta',
        output_index: 1,
        item_id: 'message-item',
        content_index: 1,
        delta: 'world',
      }),
      reducer.reduce({
        type: 'response.content_part.added',
        output_index: 1,
        item_id: 'message-item',
        content_index: 0,
        part: {type: 'output_text', text: ''},
      }),
      reducer.reduce({
        type: 'response.output_text.delta',
        output_index: 1,
        item_id: 'message-item',
        content_index: 0,
        delta: 'hello ',
      }),
      reducer.reduce({
        type: 'response.output_item.added',
        output_index: 3,
        item: {
          type: 'function_call',
          id: 'function-item-1',
          call_id: 'call-1',
          name: 'first',
          arguments: '',
          status: 'in_progress',
        },
      }),
      reducer.reduce({
        type: 'response.function_call_arguments.delta',
        output_index: 3,
        item_id: 'function-item-1',
        delta: '{"a":',
      }),
      reducer.reduce({
        type: 'response.function_call_arguments.delta',
        output_index: 2,
        item_id: 'function-item-2',
        delta: '{"b":2}',
      }),
      reducer.reduce({
        type: 'response.function_call_arguments.done',
        output_index: 3,
        item_id: 'function-item-1',
        arguments: '{"a":1}',
      }),
      reducer.reduce({
        type: 'response.output_item.done',
        output_index: 3,
        item: {
          type: 'function_call',
          id: 'function-item-1',
          call_id: 'call-1',
          name: 'first',
          arguments: '{"a":1}',
          status: 'completed',
        },
      }),
      reducer.reduce({
        type: 'response.output_item.done',
        output_index: 2,
        item: {
          type: 'function_call',
          id: 'function-item-2',
          call_id: 'call-2',
          name: 'second',
          arguments: '{"b":2}',
          status: 'completed',
        },
      }),
    ].filter(Boolean);

    expect(snapshots.at(-1)).toEqual({
      token: '',
      content: 'hello world',
      accumulated_text: 'hello world',
      reasoning_content: 'reason',
      tool_calls: [
        {
          id: 'call-2',
          type: 'function',
          function: {name: 'second', arguments: '{"b":2}'},
        },
        {
          id: 'call-1',
          type: 'function',
          function: {name: 'first', arguments: '{"a":1}'},
        },
      ],
    });
  });

  it('uses authoritative done and completed snapshots without double append', () => {
    const reducer = createResponsesStreamReducer();
    reducer.reduce({
      type: 'response.output_item.added',
      output_index: 0,
      item: message('message-1'),
    });
    reducer.reduce({
      type: 'response.content_part.added',
      output_index: 0,
      item_id: 'message-1',
      content_index: 0,
      part: {type: 'output_text', text: ''},
    });
    reducer.reduce({
      type: 'response.output_text.delta',
      output_index: 0,
      item_id: 'message-1',
      content_index: 0,
      delta: 'Hel',
    });
    reducer.reduce({
      type: 'response.output_text.done',
      output_index: 0,
      item_id: 'message-1',
      content_index: 0,
      text: 'Hello',
    });
    expect(
      reducer.reduce({
        type: 'response.output_text.done',
        output_index: 0,
        item_id: 'message-1',
        content_index: 0,
        text: 'Hello',
      }),
    ).toBeUndefined();

    const terminal = {
      type: 'response.completed',
      response: {
        status: 'completed',
        output: [
          {
            ...message('message-1', 'completed'),
            content: [
              {
                type: 'output_text',
                text: 'Hello!',
                annotations: [{type: 'synthetic'}],
              },
            ],
          },
        ],
        usage: {
          input_tokens: 9,
          output_tokens: 4,
          total_tokens: 13,
          input_tokens_details: {cached_tokens: 3},
          output_tokens_details: {reasoning_tokens: 2},
        },
      },
    };
    expect(reducer.reduce(terminal)).toMatchObject({
      content: 'Hello!',
      accumulated_text: 'Hello!',
    });
    const finalized = reducer.finish(binding);

    expect(finalized.result).toMatchObject({
      text: 'Hello!',
      content: 'Hello!',
      terminal_status: 'completed',
      tokens_evaluated: 9,
      tokens_predicted: 4,
      usage: {
        inputTokens: 9,
        outputTokens: 4,
        totalTokens: 13,
        cachedInputTokens: 3,
        reasoningTokens: 2,
      },
    });
    expect(finalized.replay?.output[0]).toMatchObject({
      id: 'message-1',
      phase: 'final_answer',
      content: [
        {
          text: 'Hello!',
          annotations: [{type: 'synthetic'}],
        },
      ],
    });
    expect(finalized.result.provider_state?.responses).toEqual(
      finalized.replay,
    );
  });

  it('accepts Copilot done item ids as authoritative without losing accumulated state', () => {
    const reducer = createResponsesStreamReducer(undefined, {
      providerProfile: 'github-copilot',
    });
    reducer.reduce({
      type: 'response.output_item.added',
      output_index: 0,
      item: {type: 'reasoning', id: 'reasoning-added', summary: []},
    });
    reducer.reduce({
      type: 'response.reasoning_summary_text.delta',
      output_index: 0,
      item_id: 'reasoning-added',
      summary_index: 0,
      delta: 'preserved reasoning',
    });
    reducer.reduce({
      type: 'response.output_item.added',
      output_index: 1,
      item: message('message-added'),
    });
    reducer.reduce({
      type: 'response.output_text.delta',
      output_index: 1,
      item_id: 'message-added',
      content_index: 0,
      delta: 'preserved content',
    });
    reducer.reduce({
      type: 'response.output_item.added',
      output_index: 2,
      item: {
        type: 'function_call',
        id: 'tool-added',
        call_id: 'call-id',
        name: 'lookup',
        arguments: '',
        status: 'in_progress',
      },
    });
    reducer.reduce({
      type: 'response.function_call_arguments.delta',
      output_index: 2,
      item_id: 'tool-added',
      delta: '{"query":"preserved"}',
    });

    reducer.reduce({
      type: 'response.output_item.done',
      output_index: 0,
      item: {type: 'reasoning', id: 'reasoning-done', summary: []},
    });
    reducer.reduce({
      type: 'response.output_item.done',
      output_index: 1,
      item: {...message('message-done', 'completed'), content: []},
    });
    reducer.reduce({
      type: 'response.output_item.done',
      output_index: 2,
      item: {
        type: 'function_call',
        id: 'tool-done',
        call_id: 'call-id',
        name: 'lookup',
        arguments: '',
        status: 'completed',
      },
    });
    reducer.reduce({
      type: 'response.completed',
      response: {
        status: 'completed',
        output: [
          {type: 'reasoning', id: 'reasoning-done', summary: []},
          {...message('message-done', 'completed'), content: []},
          {
            type: 'function_call',
            id: 'tool-done',
            call_id: 'call-id',
            name: 'lookup',
            arguments: '',
            status: 'completed',
          },
        ],
      },
    });

    const finalized = reducer.finish(binding);
    expect(finalized.result).toMatchObject({
      content: 'preserved content',
      reasoning_content: 'preserved reasoning',
      tool_calls: [
        {
          id: 'call-id',
          function: {name: 'lookup', arguments: '{"query":"preserved"}'},
        },
      ],
    });
    expect(finalized.replay?.output).toEqual([
      {
        type: 'reasoning',
        id: 'reasoning-done',
        summary: [{type: 'summary_text', text: 'preserved reasoning'}],
      },
      {
        type: 'message',
        id: 'message-done',
        role: 'assistant',
        status: 'completed',
        phase: 'final_answer',
        content: [{type: 'output_text', text: 'preserved content'}],
      },
      {
        type: 'function_call',
        id: 'tool-done',
        call_id: 'call-id',
        name: 'lookup',
        arguments: '{"query":"preserved"}',
        status: 'completed',
      },
    ]);
  });

  it('rejects done item id replacement without the Copilot profile', () => {
    const reducer = createResponsesStreamReducer();
    reducer.reduce({
      type: 'response.output_item.added',
      output_index: 0,
      item: {type: 'reasoning', id: 'reasoning-added', summary: []},
    });

    expect(() =>
      reducer.reduce({
        type: 'response.output_item.done',
        output_index: 0,
        item: {type: 'reasoning', id: 'reasoning-done', summary: []},
      }),
    ).toThrow('output item identity changed');
  });

  it.each([
    [
      'missing registration',
      {
        type: 'response.output_item.done',
        output_index: 1,
        item: {type: 'reasoning', id: 'reasoning-done', summary: []},
      },
    ],
    [
      'wrong item type',
      {
        type: 'response.output_item.done',
        output_index: 0,
        item: message('message-done'),
      },
    ],
  ])('rejects Copilot replacement with %s', (_label, event) => {
    const reducer = createResponsesStreamReducer(undefined, {
      providerProfile: 'github-copilot',
    });
    reducer.reduce({
      type: 'response.output_item.added',
      output_index: 0,
      item: {type: 'reasoning', id: 'reasoning-added', summary: []},
    });

    expect(() => reducer.reduce(event)).toThrow(ResponsesStreamProtocolError);
  });

  it('rejects a Copilot done item id registered at a conflicting index', () => {
    const reducer = createResponsesStreamReducer(undefined, {
      providerProfile: 'github-copilot',
    });
    reducer.reduce({
      type: 'response.output_item.added',
      output_index: 0,
      item: {type: 'reasoning', id: 'reasoning-zero', summary: []},
    });
    reducer.reduce({
      type: 'response.output_item.added',
      output_index: 1,
      item: {type: 'reasoning', id: 'reasoning-one', summary: []},
    });

    expect(() =>
      reducer.reduce({
        type: 'response.output_item.done',
        output_index: 1,
        item: {type: 'reasoning', id: 'reasoning-zero', summary: []},
      }),
    ).toThrow('output item id moved to another index');
  });

  it('accepts Copilot item-scoped id rotation and reconciles the final identity', () => {
    const reducer = createResponsesStreamReducer(undefined, {
      providerProfile: 'github-copilot',
    });
    reducer.reduce({
      type: 'response.output_item.added',
      output_index: 0,
      item: message('message-added'),
    });
    reducer.reduce({
      type: 'response.content_part.added',
      output_index: 0,
      item_id: 'message-content',
      content_index: 0,
      part: {type: 'output_text', text: ''},
    });
    reducer.reduce({
      type: 'response.output_text.delta',
      output_index: 0,
      item_id: 'message-delta',
      content_index: 0,
      delta: 'rotated',
    });
    reducer.reduce({
      type: 'response.content_part.done',
      output_index: 0,
      item_id: 'message-part-done',
      content_index: 0,
      part: {type: 'output_text', text: 'rotated identity'},
    });
    reducer.reduce({
      type: 'response.output_item.done',
      output_index: 0,
      item: {
        ...message('message-item-done', 'completed'),
        content: [],
      },
    });
    reducer.reduce({
      type: 'response.completed',
      response: {
        status: 'completed',
        output: [
          {
            ...message('message-terminal', 'completed'),
            content: [],
          },
        ],
      },
    });

    const finalized = reducer.finish(binding);
    expect(finalized.result.content).toBe('rotated identity');
    expect(finalized.replay?.output[0]).toMatchObject({
      id: 'message-terminal',
      content: [{type: 'output_text', text: 'rotated identity'}],
    });
  });

  it('rejects completed snapshot id rotation without the Copilot profile', () => {
    const reducer = createResponsesStreamReducer();
    reducer.reduce({
      type: 'response.output_item.added',
      output_index: 0,
      item: message('message-added'),
    });

    expect(() =>
      reducer.reduce({
        type: 'response.completed',
        response: {
          status: 'completed',
          output: [message('message-terminal', 'completed')],
        },
      }),
    ).toThrow('output item identity changed');
  });

  it.each([
    [
      'wrong item type',
      [{type: 'reasoning', id: 'reasoning-terminal', summary: []}],
    ],
    [
      'conflicting output index',
      [
        message('message-one', 'completed'),
        message('message-zero', 'completed'),
      ],
    ],
    [
      'duplicate terminal id',
      [
        message('message-terminal', 'completed'),
        message('message-terminal', 'completed'),
      ],
    ],
  ])(
    'rejects Copilot completed snapshot rotation with %s',
    (_label, output) => {
      const reducer = createResponsesStreamReducer(undefined, {
        providerProfile: 'github-copilot',
      });
      reducer.reduce({
        type: 'response.output_item.added',
        output_index: 0,
        item: message('message-zero'),
      });
      if (output.length > 1) {
        reducer.reduce({
          type: 'response.output_item.added',
          output_index: 1,
          item: message('message-one'),
        });
      }

      expect(() =>
        reducer.reduce({
          type: 'response.completed',
          response: {status: 'completed', output},
        }),
      ).toThrow(ResponsesStreamProtocolError);
    },
  );

  it('rejects item-scoped id rotation without the Copilot profile', () => {
    const reducer = createResponsesStreamReducer();
    reducer.reduce({
      type: 'response.output_item.added',
      output_index: 0,
      item: message('message-added'),
    });

    expect(() =>
      reducer.reduce({
        type: 'response.content_part.added',
        output_index: 0,
        item_id: 'message-content',
        content_index: 0,
        part: {type: 'output_text', text: ''},
      }),
    ).toThrow('event does not match a message item');
  });

  it('rejects replay of an earlier Copilot item alias', () => {
    const reducer = createResponsesStreamReducer(undefined, {
      providerProfile: 'github-copilot',
    });
    reducer.reduce({
      type: 'response.output_item.added',
      output_index: 0,
      item: message('message-added'),
    });
    reducer.reduce({
      type: 'response.content_part.added',
      output_index: 0,
      item_id: 'message-content',
      content_index: 0,
      part: {type: 'output_text', text: ''},
    });

    expect(() =>
      reducer.reduce({
        type: 'response.output_text.delta',
        output_index: 0,
        item_id: 'message-added',
        content_index: 0,
        delta: 'replayed',
      }),
    ).toThrow('event does not match a message item');
  });

  it.each([
    [
      'wrong item type',
      {
        type: 'response.content_part.added',
        output_index: 0,
        item_id: 'message-content',
        content_index: 0,
        part: {type: 'output_text', text: ''},
      },
    ],
    [
      'wrong output index',
      {
        type: 'response.reasoning_summary_text.delta',
        output_index: 1,
        item_id: 'reasoning-delta',
        summary_index: 0,
        delta: 'no',
      },
    ],
  ])('rejects Copilot item-scoped rotation with %s', (_label, event) => {
    const reducer = createResponsesStreamReducer(undefined, {
      providerProfile: 'github-copilot',
    });
    reducer.reduce({
      type: 'response.output_item.added',
      output_index: 0,
      item: {type: 'reasoning', id: 'reasoning-added', summary: []},
    });

    expect(() => reducer.reduce(event)).toThrow(ResponsesStreamProtocolError);
  });

  it('rejects a Copilot item-scoped id registered at another index', () => {
    const reducer = createResponsesStreamReducer(undefined, {
      providerProfile: 'github-copilot',
    });
    reducer.reduce({
      type: 'response.output_item.added',
      output_index: 0,
      item: message('message-zero'),
    });
    reducer.reduce({
      type: 'response.output_item.added',
      output_index: 1,
      item: message('message-one'),
    });

    expect(() =>
      reducer.reduce({
        type: 'response.content_part.added',
        output_index: 0,
        item_id: 'message-one',
        content_index: 0,
        part: {type: 'output_text', text: ''},
      }),
    ).toThrow('event does not match a message item');
  });

  it('backfills final snapshot-only content into result and projection', () => {
    const reducer = createResponsesStreamReducer();
    const snapshot = reducer.reduce({
      type: 'response.completed',
      response: {
        status: 'completed',
        output: [
          {
            ...message('snapshot-message', 'completed'),
            content: [{type: 'output_text', text: 'snapshot only'}],
          },
        ],
      },
    });

    expect(snapshot?.content).toBe('snapshot only');
    expect(reducer.finish(binding).result.content).toBe('snapshot only');
  });

  it('produces equivalent cumulative state with and without consuming callbacks', () => {
    const events = [
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: message('message-1'),
      },
      {
        type: 'response.content_part.added',
        output_index: 0,
        item_id: 'message-1',
        content_index: 0,
        part: {type: 'output_text', text: ''},
      },
      {
        type: 'response.output_text.delta',
        output_index: 0,
        item_id: 'message-1',
        content_index: 0,
        delta: 'one',
      },
      {
        type: 'response.completed',
        response: {
          status: 'completed',
          output: [
            {
              ...message('message-1', 'completed'),
              content: [{type: 'output_text', text: 'one two'}],
            },
          ],
        },
      },
    ];
    const withCallback = createResponsesStreamReducer();
    const callbackStates = events
      .map(event => withCallback.reduce(event))
      .filter(Boolean);
    const withoutCallback = createResponsesStreamReducer();
    events.forEach(event => {
      withoutCallback.reduce(event);
    });

    expect(callbackStates.at(-1)).toEqual(withoutCallback.snapshot());
    expect(withCallback.finish(binding)).toEqual(
      withoutCallback.finish(binding),
    );
  });

  it('preserves reasoning order, phase, annotations, and encrypted content', () => {
    const reducer = createResponsesStreamReducer();
    reducer.reduce({
      type: 'response.completed',
      response: {
        status: 'completed',
        output: [
          {
            type: 'reasoning',
            id: 'reasoning-1',
            encrypted_content: 'opaque-not-displayed',
            summary: [
              {type: 'summary_text', text: 'first '},
              {type: 'summary_text', text: 'second'},
            ],
          },
          {
            type: 'message',
            id: 'message-1',
            role: 'assistant',
            status: 'completed',
            phase: 'commentary',
            content: [
              {
                type: 'output_text',
                text: 'answer',
                annotations: [{type: 'url_citation', url: 'https://test'}],
              },
            ],
          },
        ],
      },
    });
    const finalized = reducer.finish(binding);

    expect(finalized.result.reasoning_content).toBe('first second');
    expect(finalized.result.content).toBe('answer');
    expect(finalized.replay?.output).toEqual([
      {
        type: 'reasoning',
        id: 'reasoning-1',
        encrypted_content: 'opaque-not-displayed',
        summary: [
          {type: 'summary_text', text: 'first '},
          {type: 'summary_text', text: 'second'},
        ],
      },
      {
        type: 'message',
        id: 'message-1',
        role: 'assistant',
        status: 'completed',
        phase: 'commentary',
        content: [
          {
            type: 'output_text',
            text: 'answer',
            annotations: [{type: 'url_citation', url: 'https://test'}],
          },
        ],
      },
    ]);
  });

  it('reconciles content, refusal, and reasoning done events authoritatively', () => {
    const reducer = createResponsesStreamReducer();
    reducer.reduce({
      type: 'response.output_item.added',
      output_index: 0,
      item: message('message-1'),
    });
    reducer.reduce({
      type: 'response.content_part.added',
      output_index: 0,
      item_id: 'message-1',
      content_index: 0,
      part: {type: 'refusal', refusal: ''},
    });
    reducer.reduce({
      type: 'response.refusal.delta',
      output_index: 0,
      item_id: 'message-1',
      content_index: 0,
      delta: 'No',
    });
    reducer.reduce({
      type: 'response.refusal.done',
      output_index: 0,
      item_id: 'message-1',
      content_index: 0,
      refusal: 'No thanks',
    });
    expect(
      reducer.reduce({
        type: 'response.content_part.done',
        output_index: 0,
        item_id: 'message-1',
        content_index: 0,
        part: {type: 'refusal', refusal: 'No thanks'},
      }),
    ).toBeUndefined();

    reducer.reduce({
      type: 'response.output_item.added',
      output_index: 1,
      item: {type: 'reasoning', id: 'reasoning-1', summary: []},
    });
    reducer.reduce({
      type: 'response.reasoning_summary_part.added',
      output_index: 1,
      item_id: 'reasoning-1',
      summary_index: 0,
      part: {type: 'summary_text', text: ''},
    });
    reducer.reduce({
      type: 'response.reasoning_summary_text.delta',
      output_index: 1,
      item_id: 'reasoning-1',
      summary_index: 0,
      delta: 'draft',
    });
    reducer.reduce({
      type: 'response.reasoning_summary_text.done',
      output_index: 1,
      item_id: 'reasoning-1',
      summary_index: 0,
      text: 'final summary',
    });
    expect(
      reducer.reduce({
        type: 'response.reasoning_summary_part.done',
        output_index: 1,
        item_id: 'reasoning-1',
        summary_index: 0,
        part: {type: 'summary_text', text: 'final summary'},
      }),
    ).toBeUndefined();

    expect(reducer.snapshot()).toMatchObject({
      content: 'No thanks',
      reasoning_content: 'final summary',
    });
  });

  it('keeps output item id separate from call_id and exposes completed tools only', () => {
    const reducer = createResponsesStreamReducer();
    reducer.reduce({
      type: 'response.output_item.added',
      output_index: 0,
      item: {
        type: 'function_call',
        id: 'output-item-id',
        call_id: 'call-id',
        name: 'lookup',
        arguments: '{}',
        status: 'in_progress',
      },
    });
    expect(reducer.snapshot().tool_calls).toEqual([
      {
        id: 'call-id',
        type: 'function',
        function: {name: 'lookup', arguments: '{}'},
      },
    ]);
    expect(
      reducer.reduce({
        type: 'response.function_call_arguments.delta',
        output_index: 0,
        item_id: 'output-item-id',
        delta: ' ',
      })?.tool_calls,
    ).toEqual([
      {
        id: 'call-id',
        type: 'function',
        function: {name: 'lookup', arguments: '{} '},
      },
    ]);
    reducer.reduce({
      type: 'response.completed',
      response: {
        status: 'completed',
        output: [
          {
            type: 'function_call',
            id: 'output-item-id',
            call_id: 'call-id',
            name: 'lookup',
            arguments: '{}',
            status: 'completed',
          },
        ],
      },
    });

    const finalized = reducer.finish(binding);
    expect(finalized.result.tool_calls?.[0].id).toBe('call-id');
    expect(finalized.replay?.output[0]).toMatchObject({
      id: 'output-item-id',
      call_id: 'call-id',
    });
  });

  it('returns typed incomplete output and never replay-completes its tools', () => {
    const reducer = createResponsesStreamReducer();
    reducer.reduce({
      type: 'response.incomplete',
      response: {
        status: 'incomplete',
        incomplete_details: {reason: 'max_output_tokens'},
        output: [
          {
            ...message('partial', 'completed'),
            content: [{type: 'output_text', text: 'partial'}],
          },
          {
            type: 'function_call',
            id: 'tool-item',
            call_id: 'call-partial',
            name: 'unsafe-to-run',
            arguments: '{}',
            status: 'incomplete',
          },
        ],
      },
    });
    const finalized = reducer.finish(binding);

    expect(finalized.replay).toBeUndefined();
    expect(finalized.result).toMatchObject({
      content: 'partial',
      terminal_status: 'incomplete',
      incomplete_reason: 'max_output_tokens',
      interrupted: true,
    });
    expect(finalized.result.tool_calls).toBeUndefined();
  });

  it('makes refusal visible and typed without completed status or tools', () => {
    const reducer = createResponsesStreamReducer();
    reducer.reduce({
      type: 'response.completed',
      response: {
        status: 'completed',
        output: [
          {
            type: 'message',
            id: 'refusal-message',
            role: 'assistant',
            status: 'completed',
            content: [{type: 'refusal', refusal: 'Synthetic refusal'}],
          },
          {
            type: 'function_call',
            id: 'tool-item',
            call_id: 'call-id',
            name: 'do_not_run',
            arguments: '{}',
            status: 'completed',
          },
        ],
      },
    });
    const finalized = reducer.finish(binding);

    expect(finalized.replay).toBeUndefined();
    expect(finalized.result).toMatchObject({
      content: 'Synthetic refusal',
      refusal: 'Synthetic refusal',
      terminal_status: 'incomplete',
      incomplete_reason: 'content_filter',
      interrupted: true,
    });
    expect(finalized.result.tool_calls).toBeUndefined();
  });

  it.each([
    ['response.failed', 'failed', 'response-failed'],
    ['response.cancelled', 'cancelled', 'response-cancelled'],
  ])('throws a safe typed partial error for %s', (type, status, code) => {
    const reducer = createResponsesStreamReducer();

    expect(() =>
      reducer.reduce({
        type,
        response: {
          status,
          output: [
            {
              ...message('partial', 'completed'),
              content: [{type: 'output_text', text: 'safe partial'}],
            },
          ],
          error: {message: 'secret body must not leak'},
        },
      }),
    ).not.toThrow();
    expect(() => reducer.finish(binding)).toThrow(
      expect.objectContaining({
        code,
        message: expect.not.stringContaining('secret body'),
        partialResult: expect.objectContaining({content: 'safe partial'}),
      }),
    );
  });

  it('throws a bounded typed error event with partial output', () => {
    const reducer = createResponsesStreamReducer();
    reducer.reduce({
      type: 'response.output_item.added',
      output_index: 0,
      item: {
        ...message('partial'),
        content: [{type: 'output_text', text: 'partial'}],
      },
    });
    let thrown: unknown;
    try {
      reducer.reduce({
        type: 'error',
        error: {
          message: 'server body must not leak',
          opaque_reasoning: 'must-not-appear',
        },
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ResponsesStreamProtocolError);
    const enumerableError = {...(thrown as ResponsesStreamProtocolError)};
    expect(thrown).toMatchObject({
      code: 'response-error',
      message: 'The Responses stream reported an error.',
      partialResult: expect.objectContaining({content: 'partial'}),
    });
    expect(Object.keys(thrown as ResponsesStreamProtocolError)).not.toContain(
      'partialResult',
    );
    expect(enumerableError).not.toHaveProperty('partialResult');
    expect(JSON.stringify(thrown)).not.toContain('partial');
  });

  it('errors on EOF or DONE without a terminal event', () => {
    const reducer = createResponsesStreamReducer();
    reducer.reduce({
      type: 'response.in_progress',
      response: {status: 'in_progress'},
    });

    expect(() => reducer.finish(binding)).toThrow(
      expect.objectContaining({code: 'premature-eof'}),
    );
  });

  it('safely ignores unknown informational events', () => {
    const reducer = createResponsesStreamReducer();
    expect(
      reducer.reduce({
        type: 'response.web_search_call.searching',
        opaque: {body: 'ignored'},
      }),
    ).toBeUndefined();
  });

  it('rejects unsupported semantic output explicitly', () => {
    const reducer = createResponsesStreamReducer();
    expect(() =>
      reducer.reduce({
        type: 'response.output_item.added',
        output_index: 0,
        item: {type: 'computer_call', id: 'unsupported'},
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'unsupported-output',
        message: expect.stringContaining('computer_call'),
      }),
    );
  });

  it('rejects duplicate call ids in completed replay output', () => {
    const reducer = createResponsesStreamReducer();
    reducer.reduce({
      type: 'response.completed',
      response: {
        status: 'completed',
        output: [
          {
            type: 'function_call',
            id: 'item-1',
            call_id: 'duplicate-call',
            name: 'first',
            arguments: '{}',
            status: 'completed',
          },
          {
            type: 'function_call',
            id: 'item-2',
            call_id: 'duplicate-call',
            name: 'second',
            arguments: '{}',
            status: 'completed',
          },
        ],
      },
    });

    expect(() => reducer.finish(binding)).toThrow(
      expect.objectContaining({code: 'invalid-completed-response'}),
    );
  });

  it.each([
    [{type: 'response.output_text.delta'}],
    [
      {
        type: 'response.output_item.added',
        output_index: '0',
        item: message('bad-index'),
      },
    ],
    [
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: {type: 'message', id: 'bad-role', role: 'user', content: []},
      },
    ],
    [
      {
        type: 'response.completed',
        response: {status: 'completed', output: {}},
      },
    ],
  ])('rejects malformed known event %#', event => {
    const reducer = createResponsesStreamReducer();
    expect(() => reducer.reduce(event)).toThrow(ResponsesStreamProtocolError);
  });
});
