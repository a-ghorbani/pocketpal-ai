import {
  buildChatCompletionResponse,
  buildDeltaChunk,
  buildFinalChunk,
  buildModelsResponse,
  buildRoleChunk,
  mapCompletionResult,
  mapMessagesToLlama,
  mapRequestToLlamaParams,
  openAiError,
  parseChatCompletionRequest,
  RequestValidationError,
} from '../mapper';

describe('parseChatCompletionRequest', () => {
  it('parses a valid request', () => {
    const body = JSON.stringify({
      model: 'gpt-x',
      messages: [{role: 'user', content: 'Hello'}],
      temperature: 0.5,
      stream: true,
    });
    const request = parseChatCompletionRequest(body);
    expect(request.messages).toHaveLength(1);
    expect(request.stream).toBe(true);
  });

  it('throws RequestValidationError on invalid JSON', () => {
    expect(() => parseChatCompletionRequest('not json')).toThrow(
      RequestValidationError,
    );
  });

  it('throws RequestValidationError when messages missing', () => {
    const body = JSON.stringify({temperature: 0.5});
    expect(() => parseChatCompletionRequest(body)).toThrow(
      RequestValidationError,
    );
  });

  it('throws RequestValidationError on empty messages array', () => {
    const body = JSON.stringify({messages: []});
    expect(() => parseChatCompletionRequest(body)).toThrow(
      RequestValidationError,
    );
  });

  it('converts legacy functions/function_call into tools/tool_choice', () => {
    const body = JSON.stringify({
      messages: [{role: 'user', content: 'hi'}],
      functions: [
        {
          name: 'get_weather',
          description: 'Get weather',
          parameters: {type: 'object', properties: {}},
        },
      ],
      function_call: {name: 'get_weather'},
    });
    const request = parseChatCompletionRequest(body);
    expect(request.functions).toBeUndefined();
    expect(request.tools).toHaveLength(1);
    expect(request.tools![0].function.name).toBe('get_weather');
    expect(request.tool_choice).toBe('required');
  });

  it('maps function_call none to tool_choice none', () => {
    const body = JSON.stringify({
      messages: [{role: 'user', content: 'hi'}],
      functions: [{name: 'a'}],
      function_call: 'none',
    });
    const request = parseChatCompletionRequest(body);
    expect(request.tool_choice).toBe('none');
  });

  it('allows unknown fields (passthrough)', () => {
    const body = JSON.stringify({
      messages: [{role: 'user', content: 'hi'}],
      some_future_field: {a: 1},
    });
    const request = parseChatCompletionRequest(body) as any;
    expect(request.some_future_field).toEqual({a: 1});
  });
});

describe('mapMessagesToLlama', () => {
  it('passes through plain text messages', () => {
    const mapped = mapMessagesToLlama([
      {role: 'system', content: 'You are helpful'},
      {role: 'user', content: 'Hi'},
    ]);
    expect(mapped).toEqual([
      {role: 'system', content: 'You are helpful'},
      {role: 'user', content: 'Hi'},
    ]);
  });

  it('keeps assistant tool_calls, tool_call_id and reasoning_content', () => {
    const mapped = mapMessagesToLlama([
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {name: 'get_weather', arguments: '{"city":"SF"}'},
          },
        ],
      },
      {
        role: 'tool',
        tool_call_id: 'call_1',
        content: '{"temp": 20}',
      },
      {
        role: 'assistant',
        content: 'Answer',
        reasoning_content: 'I thought hard',
      },
    ] as any);
    expect(mapped[0].content).toBe('');
    expect(mapped[0].tool_calls).toHaveLength(1);
    expect(mapped[0].tool_calls![0].id).toBe('call_1');
    expect(mapped[1].tool_call_id).toBe('call_1');
    expect(mapped[2].reasoning_content).toBe('I thought hard');
  });

  it('maps content arrays keeping text and image parts', () => {
    const mapped = mapMessagesToLlama([
      {
        role: 'user',
        content: [
          {type: 'text', text: 'Look'},
          {type: 'image_url', image_url: {url: 'file:///tmp/a.png'}},
        ],
      },
    ] as any);
    expect(Array.isArray(mapped[0].content)).toBe(true);
    expect(mapped[0].content[0]).toEqual({type: 'text', text: 'Look'});
    expect(mapped[0].content[1].type).toBe('image_url');
  });
});

describe('mapRequestToLlamaParams', () => {
  it('maps core sampling and length params', () => {
    const params = mapRequestToLlamaParams({
      messages: [{role: 'user', content: 'Hi'}],
      temperature: 0.2,
      top_p: 0.9,
      top_k: 30,
      min_p: 0.1,
      max_tokens: 256,
      stop: 'END',
      seed: 42,
      frequency_penalty: 0.5,
      presence_penalty: 0.4,
    });
    expect(params.jinja).toBe(true);
    expect(params.temperature).toBe(0.2);
    expect(params.top_p).toBe(0.9);
    expect(params.top_k).toBe(30);
    expect(params.min_p).toBe(0.1);
    expect(params.n_predict).toBe(256);
    expect(params.stop).toEqual(['END']);
    expect(params.seed).toBe(42);
    expect(params.penalty_freq).toBe(0.5);
    expect(params.penalty_present).toBe(0.4);
  });

  it('prefers max_completion_tokens over max_tokens', () => {
    const params = mapRequestToLlamaParams({
      messages: [{role: 'user', content: 'Hi'}],
      max_tokens: 100,
      max_completion_tokens: 200,
    });
    expect(params.n_predict).toBe(200);
  });

  it('passes tools/tool_choice/parallel_tool_calls', () => {
    const params = mapRequestToLlamaParams({
      messages: [{role: 'user', content: 'Hi'}],
      tools: [
        {
          type: 'function',
          function: {name: 't1', description: '', parameters: {}},
        },
      ],
      tool_choice: 'auto',
      parallel_tool_calls: true,
    });
    expect(params.tools).toHaveLength(1);
    expect(params.tool_choice).toBe('auto');
    expect(params.parallel_tool_calls).toBe(true);
  });

  it('maps tool_choice {name} to required and skips invalid strings', () => {
    const byName = mapRequestToLlamaParams({
      messages: [{role: 'user', content: 'Hi'}],
      tool_choice: {type: 'function', function: {name: 't1'}},
    });
    expect(byName.tool_choice).toBe('required');

    const invalid = mapRequestToLlamaParams({
      messages: [{role: 'user', content: 'Hi'}],
      tool_choice: 'weird',
    });
    expect(invalid.tool_choice).toBeUndefined();
  });

  it('defaults reasoning_format to auto and honors explicit thinking flags', () => {
    const defaulted = mapRequestToLlamaParams({
      messages: [{role: 'user', content: 'Hi'}],
    });
    expect(defaulted.reasoning_format).toBe('auto');

    const disabled = mapRequestToLlamaParams({
      messages: [{role: 'user', content: 'Hi'}],
      enable_thinking: false,
    });
    expect(disabled.enable_thinking).toBe(false);
    expect(disabled.reasoning_format).toBeUndefined();

    const explicit = mapRequestToLlamaParams({
      messages: [{role: 'user', content: 'Hi'}],
      reasoning_format: 'deepseek',
    });
    expect(explicit.reasoning_format).toBe('deepseek');
  });

  it('uses default stop words when request has none', () => {
    const params = mapRequestToLlamaParams(
      {messages: [{role: 'user', content: 'Hi'}]},
      {defaultStopWords: ['</s>']},
    );
    expect(params.stop).toEqual(['</s>']);

    const withEmptyStop = mapRequestToLlamaParams(
      {messages: [{role: 'user', content: 'Hi'}], stop: []},
      {defaultStopWords: ['</s>']},
    );
    expect(withEmptyStop.stop).toEqual(['</s>']);
  });

  it('passes custom chat template when provided', () => {
    const params = mapRequestToLlamaParams(
      {messages: [{role: 'user', content: 'Hi'}]},
      {chatTemplate: '{{messages}}'},
    );
    expect(params.chat_template).toBe('{{messages}}');
  });

  it('passes response_format for json modes only', () => {
    const jsonSchema = mapRequestToLlamaParams({
      messages: [{role: 'user', content: 'Hi'}],
      response_format: {
        type: 'json_schema',
        json_schema: {schema: {type: 'object'}},
      },
    });
    expect(jsonSchema.response_format).toBeDefined();

    const text = mapRequestToLlamaParams({
      messages: [{role: 'user', content: 'Hi'}],
      response_format: {type: 'text'},
    });
    expect(text.response_format).toBeUndefined();
  });
});

describe('mapCompletionResult', () => {
  it('maps content-only result to finish_reason stop', () => {
    const result = mapCompletionResult({
      content: 'Hello!',
      tokens_evaluated: 10,
      tokens_predicted: 5,
    });
    expect(result.content).toBe('Hello!');
    expect(result.finish_reason).toBe('stop');
    expect(result.usage).toEqual({
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    });
  });

  it('maps tool calls to finish_reason tool_calls', () => {
    const result = mapCompletionResult({
      content: '',
      tool_calls: [
        {
          id: 'call_9',
          function: {name: 'get_weather', arguments: '{"city":"SF"}'},
        },
      ],
    });
    expect(result.finish_reason).toBe('tool_calls');
    expect(result.tool_calls![0].id).toBe('call_9');
  });

  it('generates ids for tool calls without one', () => {
    const result = mapCompletionResult({
      content: '',
      tool_calls: [{function: {name: 't', arguments: ''}}],
    });
    expect(result.tool_calls![0].id).toBe('call_0');
  });

  it('maps length stops', () => {
    const result = mapCompletionResult({
      content: 'partial',
      stopped_limit: true,
    });
    expect(result.finish_reason).toBe('length');
  });

  it('falls back to text when content missing', () => {
    const result = mapCompletionResult({text: 'raw'});
    expect(result.content).toBe('raw');
  });
});

describe('response builders', () => {
  it('builds non-streaming chat completion response', () => {
    const response = buildChatCompletionResponse({
      id: 'chatcmpl-1',
      created: 123,
      model: 'm',
      result: {
        content: 'Hi',
        reasoning_content: 'thinking...',
        finish_reason: 'stop',
        usage: {prompt_tokens: 1, completion_tokens: 2, total_tokens: 3},
      },
    });
    expect(response.object).toBe('chat.completion');
    expect(response.choices[0].message.content).toBe('Hi');
    expect(response.choices[0].message.reasoning_content).toBe('thinking...');
    expect(response.choices[0].finish_reason).toBe('stop');
    expect(response.usage.total_tokens).toBe(3);
  });

  it('includes tool_calls in message when present', () => {
    const response = buildChatCompletionResponse({
      id: 'id',
      created: 1,
      model: 'm',
      result: {
        content: '',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {name: 't', arguments: '{}'},
          },
        ],
        finish_reason: 'tool_calls',
        usage: {prompt_tokens: 1, completion_tokens: 1, total_tokens: 2},
      },
    });
    expect(response.choices[0].message.tool_calls).toHaveLength(1);
  });

  it('builds role chunk, delta chunk and final chunk', () => {
    const role = buildRoleChunk({id: 'id', created: 1, model: 'm'});
    expect(role.choices[0].delta.role).toBe('assistant');
    expect(role.choices[0].finish_reason).toBeNull();

    const delta = buildDeltaChunk({
      id: 'id',
      created: 1,
      model: 'm',
      delta: {content: 'a'},
    });
    expect(delta.choices[0].delta.content).toBe('a');

    const toolDelta = buildDeltaChunk({
      id: 'id',
      created: 1,
      model: 'm',
      delta: {
        tool_calls: [{index: 0, function: {arguments: '{"x'}}],
      },
    });
    expect(toolDelta.choices[0].delta.tool_calls![0].index).toBe(0);

    const final = buildFinalChunk({
      id: 'id',
      created: 1,
      model: 'm',
      finishReason: 'stop',
      usage: {prompt_tokens: 1, completion_tokens: 1, total_tokens: 2},
    });
    expect(final.choices[0].finish_reason).toBe('stop');
    expect(final.usage?.total_tokens).toBe(2);
  });

  it('builds models list response', () => {
    const response = buildModelsResponse([{id: 'model-1'}]);
    expect(response.object).toBe('list');
    expect(response.data[0].id).toBe('model-1');
    expect(response.data[0].object).toBe('model');
  });

  it('builds OpenAI error body', () => {
    const body = openAiError('bad', 'invalid_request_error', 'x');
    expect(body.error.message).toBe('bad');
    expect(body.error.type).toBe('invalid_request_error');
    expect(body.error.code).toBe('x');
  });
});
