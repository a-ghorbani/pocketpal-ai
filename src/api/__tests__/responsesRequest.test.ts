import {
  encodeResponsesRequest,
  ResponsesRequestParams,
} from '../responsesRequest';

const baseParams = (): ResponsesRequestParams => ({
  model: 'model-test',
  messages: [{role: 'user', content: 'Hello'}],
});

describe('encodeResponsesRequest', () => {
  it('clones replay input without requiring structuredClone', () => {
    const input = [{role: 'user' as const, content: 'hello'}];
    const body = encodeResponsesRequest(baseParams(), {input});

    expect(body.input).toEqual(input);
    expect(body.input).not.toBe(input);
  });

  it('creates the minimal streaming, stateless Responses request', () => {
    expect(encodeResponsesRequest(baseParams())).toEqual({
      model: 'model-test',
      input: [{role: 'user', content: 'Hello'}],
      stream: true,
      store: false,
    });
  });

  it('encodes text and image content with a string image URL', () => {
    const params = baseParams();
    params.messages = [
      {
        role: 'user',
        content: [
          {type: 'text', text: 'Describe'},
          {type: 'image_url', image_url: {url: 'data:image/png;base64,AA=='}},
        ],
      },
    ];

    expect(encodeResponsesRequest(params).input).toEqual([
      {
        role: 'user',
        content: [
          {type: 'input_text', text: 'Describe'},
          {
            type: 'input_image',
            image_url: 'data:image/png;base64,AA==',
          },
        ],
      },
    ]);
  });

  it('maps assistant tool calls and tool outputs by call_id', () => {
    const params = baseParams();
    params.messages = [
      {
        role: 'assistant',
        content: 'Checking',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {name: 'weather', arguments: '{"city":"Oslo"}'},
          },
        ],
      },
      {role: 'tool', content: '{"temp":7}', tool_call_id: 'call_1'},
    ];

    expect(encodeResponsesRequest(params).input).toEqual([
      {role: 'assistant', content: 'Checking'},
      {
        type: 'function_call',
        call_id: 'call_1',
        name: 'weather',
        arguments: '{"city":"Oslo"}',
      },
      {
        type: 'function_call_output',
        call_id: 'call_1',
        output: '{"temp":7}',
      },
    ]);
  });

  it('allows a tool-call-only assistant message', () => {
    const params = baseParams();
    params.messages = [
      {
        role: 'assistant',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {name: 'clock', arguments: ''},
          },
        ],
      },
    ];

    expect(encodeResponsesRequest(params).input).toEqual([
      {
        type: 'function_call',
        call_id: 'call_1',
        name: 'clock',
        arguments: '',
      },
    ]);
  });

  it('flattens tools and retains explicit non-strict behavior', () => {
    const params = baseParams();
    params.tools = [
      {
        type: 'function',
        function: {
          name: 'weather',
          description: 'Get weather',
          parameters: {type: 'object'},
          strict: false,
        },
      } as any,
      {
        type: 'function',
        function: {name: 'clock', parameters: {type: 'object'}},
      },
    ];
    params.tool_choice = {
      type: 'function',
      function: {name: 'weather'},
    };

    const request = encodeResponsesRequest(params);
    expect(request.tools).toEqual([
      {
        type: 'function',
        name: 'weather',
        description: 'Get weather',
        parameters: {type: 'object'},
        strict: false,
      },
      {
        type: 'function',
        name: 'clock',
        parameters: {type: 'object'},
      },
    ]);
    expect(request.tool_choice).toEqual({type: 'function', name: 'weather'});
    expect(request.tools?.[1]).not.toHaveProperty('strict');
  });

  it('advertises every Scout talent as a Responses function', () => {
    const params = baseParams();
    params.tools = [
      'web_search',
      'read_url',
      'calculate',
      'datetime',
      'render_html',
    ].map(name => ({
      type: 'function' as const,
      function: {
        name,
        description: `${name} description`,
        parameters: {type: 'object'},
      },
    }));

    expect(
      encodeResponsesRequest(params).tools?.map(tool => tool.name),
    ).toEqual([
      'web_search',
      'read_url',
      'calculate',
      'datetime',
      'render_html',
    ]);
  });

  it.each([
    ['text', {type: 'text'}, {type: 'text'}],
    ['json object', {type: 'json_object'}, {type: 'json_object'}],
    [
      'JSON schema',
      {type: 'json_schema', json_schema: {schema: {type: 'object'}}},
      {
        type: 'json_schema',
        name: 'response',
        schema: {type: 'object'},
      },
    ],
  ])(
    'maps %s response format under text.format',
    (_label, source, expected) => {
      const params = baseParams();
      params.response_format = source as any;
      expect(encodeResponsesRequest(params).text).toEqual({format: expected});
    },
  );

  it('preserves a JSON schema name and strict false', () => {
    const params = baseParams();
    params.response_format = {
      type: 'json_schema',
      json_schema: {
        name: 'answer',
        strict: false,
        schema: {type: 'object'},
      },
    };
    expect(encodeResponsesRequest(params).text).toEqual({
      format: {
        type: 'json_schema',
        name: 'answer',
        strict: false,
        schema: {type: 'object'},
      },
    });
  });

  it.each([
    ['max_tokens', {max_tokens: 12}],
    ['n_predict', {n_predict: 13}],
  ])('maps a positive %s to max_output_tokens', (_label, extra) => {
    expect(
      encodeResponsesRequest({...baseParams(), ...extra}).max_output_tokens,
    ).toBe(Object.values(extra)[0]);
  });

  it.each([{max_tokens: -1}, {n_predict: -1}, {}])(
    'omits an unlimited or unset token limit',
    extra => {
      expect(
        encodeResponsesRequest({...baseParams(), ...extra}),
      ).not.toHaveProperty('max_output_tokens');
    },
  );

  it('encodes reasoning only according to the caller policy', () => {
    expect(
      encodeResponsesRequest(
        {...baseParams(), reasoning: {enabled: true, effort: 'high'}},
        {parameterPolicy: {reasoning: {supportsEffort: true}}},
      ),
    ).toMatchObject({reasoning: {effort: 'high'}});

    expect(
      encodeResponsesRequest(
        {...baseParams(), reasoning: {enabled: false}},
        {parameterPolicy: {reasoning: {disabledEffort: 'none'}}},
      ),
    ).toMatchObject({reasoning: {effort: 'none'}});
  });

  it('includes encrypted reasoning only when the policy supports it', () => {
    expect(
      encodeResponsesRequest(baseParams(), {
        parameterPolicy: {
          reasoning: {supportsEncryptedContent: true},
        },
        includeReasoningEncryptedContent: true,
      }).include,
    ).toEqual(['reasoning.encrypted_content']);

    expect(() =>
      encodeResponsesRequest(baseParams(), {
        includeReasoningEncryptedContent: true,
      }),
    ).toThrow(/not supported/);
  });

  it('does not mutate its input or forward local-only and stop fields', () => {
    const params = {
      ...baseParams(),
      stop: ['END'],
      stream: false,
      version: 2,
      include_thinking_in_context: true,
    } as ResponsesRequestParams & {
      version: number;
      include_thinking_in_context: boolean;
    };
    const snapshot = JSON.parse(JSON.stringify(params));
    const request = encodeResponsesRequest(params);

    expect(params).toEqual(snapshot);
    expect(request).not.toHaveProperty('stop');
    expect(request).not.toHaveProperty('version');
    expect(request).not.toHaveProperty('include_thinking_in_context');
    expect(request.stream).toBe(true);
  });

  it.each([
    ['temperature', 0, 'temperature'],
    ['top_p', 0, 'top_p'],
    ['n_predict', -1, 'max_output_tokens'],
  ] as const)(
    'omits %s from final Responses JSON when mode is Omit',
    (sourceKey, value, wireKey) => {
      const body = encodeResponsesRequest({
        ...baseParams(),
        [sourceKey]: value,
        generationParameterModes: {[sourceKey]: 'omit'},
      });

      expect(Object.prototype.hasOwnProperty.call(body, wireKey)).toBe(false);
    },
  );

  it.each([
    ['temperature', 0],
    ['top_p', 0],
  ] as const)('retains valid zero Send value for %s', (key, value) => {
    const body = encodeResponsesRequest({
      ...baseParams(),
      [key]: value,
      generationParameterModes: {[key]: 'send'},
    });

    expect(Object.prototype.hasOwnProperty.call(body, key)).toBe(true);
    expect(body[key]).toBe(0);
  });

  it('preserves legacy sampling fields when capability evidence is unknown', () => {
    const body = encodeResponsesRequest({
      ...baseParams(),
      temperature: 0.7,
      top_p: 0.9,
      n_predict: 100,
    });

    expect(Object.hasOwnProperty.call(body, 'temperature')).toBe(true);
    expect(Object.hasOwnProperty.call(body, 'top_p')).toBe(true);
    expect(Object.hasOwnProperty.call(body, 'max_output_tokens')).toBe(true);
  });

  it('suppresses the nested reasoning alias at the final encoder', () => {
    const body = encodeResponsesRequest(
      {
        ...baseParams(),
        reasoning: {enabled: true, effort: 'high'},
        generationParameterModes: {reasoning: 'omit'},
      },
      {
        parameterPolicy: {
          reasoning: {
            supportsEffort: true,
            supportsEncryptedContent: true,
          },
        },
        includeReasoningEncryptedContent: true,
      },
    );

    expect(Object.prototype.hasOwnProperty.call(body, 'reasoning')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(body, 'include')).toBe(false);
  });

  it.each([
    ['default', undefined, undefined, false],
    ['On without effort', {enabled: true}, undefined, false],
    ['Off without serialized effort', {enabled: false}, undefined, false],
    ['Off serialized as none', {enabled: false}, 'none', true],
    ['explicit effort', {enabled: true, effort: 'high'}, undefined, true],
  ] as const)(
    'applies conditional sampling evidence to effective %s reasoning',
    (_label, reasoning, disabledEffort, expectsTemperature) => {
      const body = encodeResponsesRequest(
        {
          ...baseParams(),
          temperature: 0.7,
          top_p: 0.9,
          reasoning,
        },
        {
          parameterPolicy: {
            reasoning: {
              supportsEffort: true,
              disabledEffort,
            },
            sampling: {
              temperature: {
                supported: false,
                source: 'provider-verification',
                reasoningModes: ['absent'],
              },
            },
          },
        },
      );

      expect(Object.hasOwnProperty.call(body, 'temperature')).toBe(
        expectsTemperature,
      );
      expect(body).toHaveProperty('top_p', 0.9);
    },
  );

  it('lets explicit Omit win over catalog support and preserves unknown fields', () => {
    const body = encodeResponsesRequest(
      {
        ...baseParams(),
        temperature: 0.7,
        top_p: 0.9,
        n_predict: 100,
        generationParameterModes: {temperature: 'omit'},
      },
      {
        parameterPolicy: {
          sampling: {
            temperature: {supported: true, source: 'live-catalog'},
          },
        },
      },
    );

    expect(body).not.toHaveProperty('temperature');
    expect(body).toHaveProperty('top_p', 0.9);
    expect(body).toHaveProperty('max_output_tokens', 100);
  });

  it.each([
    [
      'conflicting token limits',
      {...baseParams(), max_tokens: 10, n_predict: 20},
    ],
    ['invalid token limit', {...baseParams(), max_tokens: 0}],
    [
      'required tool choice without tools',
      {...baseParams(), tool_choice: 'required'},
    ],
    [
      'unknown pinned tool',
      {
        ...baseParams(),
        tools: [{type: 'function', function: {name: 'known'}}],
        tool_choice: {type: 'function', function: {name: 'unknown'}},
      },
    ],
    [
      'tool output without call id',
      {
        ...baseParams(),
        messages: [{role: 'tool', content: 'output'}],
      },
    ],
    [
      'effort while reasoning is disabled',
      {
        ...baseParams(),
        reasoning: {enabled: false, effort: 'high'},
      },
    ],
    ['empty input', {...baseParams(), messages: []}],
  ])('throws for %s', (_label, params) => {
    expect(() =>
      encodeResponsesRequest(params as ResponsesRequestParams),
    ).toThrow();
  });
});
