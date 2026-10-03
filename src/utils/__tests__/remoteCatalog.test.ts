import {
  normalizeRemoteCatalogModel,
  normalizeRemoteEndpoint,
} from '../remoteCatalog';

describe('normalizeRemoteEndpoint', () => {
  it.each([
    ['/chat/completions', 'chat-completions'],
    ['/v1/chat/completions', 'chat-completions'],
    ['/responses', 'responses'],
    ['/v1/responses', 'responses'],
  ])('recognizes %s', (endpoint, wireApi) => {
    expect(normalizeRemoteEndpoint(endpoint)).toBe(wireApi);
  });

  it.each([
    'https://api.example.com/responses',
    'responses',
    '/responses/',
    '/v2/responses',
    '/v1/messages',
    undefined,
  ])('does not recognize %p', endpoint => {
    expect(normalizeRemoteEndpoint(endpoint)).toBeUndefined();
  });
});

describe('normalizeRemoteCatalogModel', () => {
  it('normalizes and deduplicates recognized endpoints', () => {
    const result = normalizeRemoteCatalogModel({
      supported_endpoints: [
        '/responses',
        '/v1/responses',
        '/v1/messages',
        '/chat/completions',
      ],
    });

    expect(result).toMatchObject({
      capabilities: {
        advertisedEndpoints: ['responses', 'chat-completions'],
      },
      endpointSupport: 'known',
      provenance: 'live',
    });
  });

  it.each([
    ['missing', {}],
    ['empty', {supported_endpoints: []}],
    ['wrong container', {supported_endpoints: '/responses'}],
    ['mixed types', {supported_endpoints: ['/responses', false]}],
    ['empty endpoint', {supported_endpoints: ['']}],
  ])('leaves %s endpoint metadata unknown', (_label, row) => {
    expect(normalizeRemoteCatalogModel(row)).toMatchObject({
      capabilities: {},
      endpointSupport: 'unknown',
    });
  });

  it('keeps a valid unsupported-only endpoint list known', () => {
    expect(
      normalizeRemoteCatalogModel({supported_endpoints: ['/v1/messages']}),
    ).toMatchObject({
      capabilities: {advertisedEndpoints: []},
      endpointSupport: 'known',
    });
  });

  it('normalizes correctly typed nested Copilot capabilities', () => {
    expect(
      normalizeRemoteCatalogModel({
        capabilities: {
          supports: {
            vision: true,
            tool_calls: false,
            structured_outputs: true,
            reasoning_effort: ['none', 'low', 'high', 'low'],
            temperature: false,
            top_p: true,
            max_output_tokens: true,
          },
          limits: {
            max_context_window_tokens: 128000,
            max_output_tokens: 32768,
          },
        },
      }).capabilities,
    ).toEqual({
      supportsVision: true,
      supportsTools: false,
      supportsStructuredOutput: true,
      contextLength: 128000,
      maxOutputTokens: 32768,
      reasoningEffortValues: ['none', 'low', 'high'],
      responsesSampling: {
        temperature: {supported: false, source: 'live-catalog'},
        topP: {supported: true, source: 'live-catalog'},
        maxOutputTokens: {supported: true, source: 'live-catalog'},
      },
    });
  });

  it('preserves cached catalog provenance on sampling evidence', () => {
    expect(
      normalizeRemoteCatalogModel(
        {capabilities: {supports: {temperature: false}}},
        'cached',
      ).capabilities.responsesSampling,
    ).toEqual({
      temperature: {supported: false, source: 'cached-catalog'},
    });
  });

  it('leaves malformed nested Copilot fields unknown independently', () => {
    expect(
      normalizeRemoteCatalogModel({
        capabilities: {
          supports: {
            vision: 'true',
            tool_calls: 1,
            structured_outputs: null,
            reasoning_effort: ['low', 2],
            temperature: 'false',
            top_p: 1,
            max_output_tokens: null,
          },
          limits: {
            max_context_window_tokens: '128000',
            max_output_tokens: -1,
          },
        },
      }).capabilities,
    ).toEqual({});
  });

  it.each([
    [
      ['completion', 'multimodal', 'tool_calls', 'structured_output'],
      {
        supportsVision: true,
        supportsTools: true,
        supportsStructuredOutput: true,
      },
    ],
    [
      ['completion'],
      {
        supportsVision: false,
        supportsTools: false,
        supportsStructuredOutput: false,
      },
    ],
  ])(
    'normalizes llama.cpp string-array capabilities',
    (capabilities, expected) => {
      expect(normalizeRemoteCatalogModel({capabilities}).capabilities).toEqual(
        expected,
      );
    },
  );

  it('does not partially trust a malformed llama.cpp capability array', () => {
    expect(
      normalizeRemoteCatalogModel({
        capabilities: ['multimodal', {tool_calls: true}],
      }).capabilities,
    ).toEqual({});
  });

  it('does not reinterpret object capabilities as llama.cpp labels', () => {
    expect(
      normalizeRemoteCatalogModel({
        capabilities: {
          vision: true,
          tools: true,
          structured_output: true,
          contextLength: 999,
        },
      }).capabilities,
    ).toEqual({});
  });

  it('returns immutable output without mutating the catalog row', () => {
    const row = {
      supported_endpoints: ['/responses', '/responses'],
      capabilities: {
        supports: {reasoning_effort: ['low', 'low', 'high']},
      },
    };
    const original = JSON.parse(JSON.stringify(row));
    const result = normalizeRemoteCatalogModel(row, 'cached');

    expect(row).toEqual(original);
    expect(result.provenance).toBe('cached');
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.capabilities)).toBe(true);
    expect(Object.isFrozen(result.capabilities.advertisedEndpoints)).toBe(true);
    expect(Object.isFrozen(result.capabilities.reasoningEffortValues)).toBe(
      true,
    );
  });
});
