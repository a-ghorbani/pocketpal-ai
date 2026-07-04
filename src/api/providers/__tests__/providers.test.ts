/**
 * Tests for multi-provider engine factory and adapters.
 */

// Mock fetch for streaming tests
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

// Mock ReadableStream for SSE testing
class MockReadableStream {
  private chunks: string[];
  private index = 0;

  constructor(chunks: string[]) {
    this.chunks = chunks;
  }

  getReader() {
    return {
      read: async () => {
        if (this.index < this.chunks.length) {
          return {done: false, value: this.chunks[this.index++]};
        }
        return {done: true, value: undefined};
      },
    };
  }
}

function createSSEResponse(events: string[]): Response {
  const encoder = new TextEncoder();
  const chunks = events.map(e => encoder.encode(e));
  const stream = new MockReadableStream(chunks) as any;
  return {
    ok: true,
    body: stream,
    status: 200,
  } as Response;
}

describe('Provider types', () => {
  it('exports all 4 providers', () => {
    const {PROVIDERS} = require('../types');
    expect(Object.keys(PROVIDERS)).toHaveLength(4);
    expect(PROVIDERS.openai).toBeDefined();
    expect(PROVIDERS.anthropic).toBeDefined();
    expect(PROVIDERS.gemini).toBeDefined();
    expect(PROVIDERS.groq).toBeDefined();
  });

  it('each provider has required fields', () => {
    const {getAllProviders} = require('../types');
    const providers = getAllProviders();
    for (const p of providers) {
      expect(p.id).toBeDefined();
      expect(p.name).toBeDefined();
      expect(p.baseUrl).toMatch(/^https?:\/\//);
      expect(p.defaultModels.length).toBeGreaterThan(0);
      expect(p.apiKeyPlaceholder).toBeTruthy();
      expect(p.apiKeyHelpUrl).toMatch(/^https?:\/\//);
    }
  });

  it('gemini and groq have free tier', () => {
    const {PROVIDERS} = require('../types');
    expect(PROVIDERS.gemini.hasFreeTier).toBe(true);
    expect(PROVIDERS.groq.hasFreeTier).toBe(true);
  });
});

describe('createProviderEngine factory', () => {
  it('creates OpenAI engine', () => {
    const {createProviderEngine} = require('../index');
    const engine = createProviderEngine('openai', 'sk-test', 'gpt-4o');
    expect(engine).toBeDefined();
    expect(typeof engine.completion).toBe('function');
    expect(typeof engine.stopCompletion).toBe('function');
  });

  it('creates Anthropic engine', () => {
    const {createProviderEngine} = require('../index');
    const engine = createProviderEngine('anthropic', 'sk-ant-test', 'claude-sonnet-4-20250514');
    expect(engine).toBeDefined();
    expect(typeof engine.completion).toBe('function');
  });

  it('creates Gemini engine', () => {
    const {createProviderEngine} = require('../index');
    const engine = createProviderEngine('gemini', 'AIza-test', 'gemini-2.0-flash');
    expect(engine).toBeDefined();
    expect(typeof engine.completion).toBe('function');
  });

  it('creates Groq engine', () => {
    const {createProviderEngine} = require('../index');
    const engine = createProviderEngine('groq', 'gsk_test', 'llama-3.3-70b-versatile');
    expect(engine).toBeDefined();
    expect(typeof engine.completion).toBe('function');
  });

  it('throws for unknown provider', () => {
    const {createProviderEngine} = require('../index');
    expect(() => createProviderEngine('unknown' as any, 'key', 'model')).toThrow(
      /Unknown provider/,
    );
  });
});

describe('AnthropicCompletionEngine', () => {
  const {AnthropicCompletionEngine} = require('../AnthropicCompletionEngine');

  it('streams content from SSE events', async () => {
    const engine = new AnthropicCompletionEngine(
      'sk-ant-test',
      'claude-sonnet-4-20250514',
    );

    mockFetch.mockResolvedValueOnce(
      createSSEResponse([
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n\n',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":" world"}}\n\n',
        'data: {"type":"message_delta","message":{"stop_reason":"end_turn"}}\n\n',
      ]),
    );

    const tokens: string[] = [];
    const result = await engine.completion(
      {messages: [{role: 'user', content: 'Hi'}]} as any,
      (data: any) => {
        if (data.token) tokens.push(data.token);
      },
    );

    expect(tokens).toEqual(['Hello', ' world']);
    expect(result.content).toBe('Hello world');
    expect(result.stopped_eos).toBe(true);
  });

  it('extracts system prompt separately', async () => {
    const engine = new AnthropicCompletionEngine(
      'sk-ant-test',
      'claude-sonnet-4-20250514',
    );

    let capturedBody: any;
    mockFetch.mockImplementationOnce(async (url: string, opts: any) => {
      capturedBody = JSON.parse(opts.body);
      return createSSEResponse([
        'data: {"type":"message_delta","message":{"stop_reason":"end_turn"}}\n\n',
      ]);
    });

    await engine.completion({
      messages: [
        {role: 'system', content: 'You are helpful'},
        {role: 'user', content: 'Hi'},
      ],
    } as any);

    expect(capturedBody.system).toBe('You are helpful');
    expect(capturedBody.messages).toHaveLength(1);
    expect(capturedBody.messages[0].role).toBe('user');
  });

  it('sends correct headers', async () => {
    const engine = new AnthropicCompletionEngine(
      'sk-ant-test',
      'claude-sonnet-4-20250514',
    );

    let capturedHeaders: any;
    mockFetch.mockImplementationOnce(async (url: string, opts: any) => {
      capturedHeaders = opts.headers;
      return createSSEResponse([
        'data: {"type":"message_delta","message":{"stop_reason":"end_turn"}}\n\n',
      ]);
    });

    await engine.completion({messages: [{role: 'user', content: 'Hi'}]} as any);

    expect(capturedHeaders['x-api-key']).toBe('sk-ant-test');
    expect(capturedHeaders['anthropic-version']).toBe('2023-06-01');
    expect(capturedHeaders['Content-Type']).toBe('application/json');
  });

  it('handles API error', async () => {
    const engine = new AnthropicCompletionEngine(
      'sk-ant-test',
      'claude-sonnet-4-20250514',
    );

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });

    await expect(
      engine.completion({messages: [{role: 'user', content: 'Hi'}]} as any),
    ).rejects.toThrow(/Anthropic API error 401/);
  });

  it('stopCompletion aborts the request', async () => {
    const engine = new AnthropicCompletionEngine(
      'sk-ant-test',
      'claude-sonnet-4-20250514',
    );

    // Simulate a fetch that rejects with AbortError when aborted
    mockFetch.mockImplementationOnce(
      (_url: string, opts: any) =>
        new Promise((_, reject) => {
          opts.signal.addEventListener('abort', () => {
            const err = new Error('Aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    );

    const promise = engine.completion({
      messages: [{role: 'user', content: 'Hi'}],
    } as any);

    await engine.stopCompletion();

    const result = await promise;
    expect(result.interrupted).toBe(true);
  });
});

describe('GeminiCompletionEngine', () => {
  const {GeminiCompletionEngine} = require('../GeminiCompletionEngine');

  it('streams content from SSE events', async () => {
    const engine = new GeminiCompletionEngine(
      'AIza-test',
      'gemini-2.0-flash',
    );

    mockFetch.mockResolvedValueOnce(
      createSSEResponse([
        'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}\n\n',
        'data: {"candidates":[{"content":{"parts":[{"text":" world"}]},"finishReason":"STOP"}]}\n\n',
      ]),
    );

    const tokens: string[] = [];
    const result = await engine.completion(
      {messages: [{role: 'user', content: 'Hi'}]} as any,
      (data: any) => {
        if (data.token) tokens.push(data.token);
      },
    );

    expect(tokens).toEqual(['Hello', ' world']);
    expect(result.content).toBe('Hello world');
    expect(result.stopped_eos).toBe(true);
  });

  it('uses API key in query parameter', async () => {
    const engine = new GeminiCompletionEngine(
      'AIza-test-key',
      'gemini-2.0-flash',
    );

    let capturedUrl: string;
    mockFetch.mockImplementationOnce(async (url: string) => {
      capturedUrl = url;
      return createSSEResponse([
        'data: {"candidates":[{"finishReason":"STOP"}]}\n\n',
      ]);
    });

    await engine.completion({messages: [{role: 'user', content: 'Hi'}]} as any);

    expect(capturedUrl!).toContain('key=AIza-test-key');
    expect(capturedUrl!).toContain('streamGenerateContent');
  });

  it('converts assistant role to model', async () => {
    const engine = new GeminiCompletionEngine(
      'AIza-test',
      'gemini-2.0-flash',
    );

    let capturedBody: any;
    mockFetch.mockImplementationOnce(async (url: string, opts: any) => {
      capturedBody = JSON.parse(opts.body);
      return createSSEResponse([
        'data: {"candidates":[{"finishReason":"STOP"}]}\n\n',
      ]);
    });

    await engine.completion({
      messages: [
        {role: 'user', content: 'Hi'},
        {role: 'assistant', content: 'Hello'},
        {role: 'user', content: 'How are you?'},
      ],
    } as any);

    expect(capturedBody.contents[0].role).toBe('user');
    expect(capturedBody.contents[1].role).toBe('model');
    expect(capturedBody.contents[2].role).toBe('user');
  });

  it('extracts system instruction separately', async () => {
    const engine = new GeminiCompletionEngine(
      'AIza-test',
      'gemini-2.0-flash',
    );

    let capturedBody: any;
    mockFetch.mockImplementationOnce(async (url: string, opts: any) => {
      capturedBody = JSON.parse(opts.body);
      return createSSEResponse([
        'data: {"candidates":[{"finishReason":"STOP"}]}\n\n',
      ]);
    });

    await engine.completion({
      messages: [
        {role: 'system', content: 'Be concise'},
        {role: 'user', content: 'Hi'},
      ],
    } as any);

    expect(capturedBody.systemInstruction).toBeDefined();
    expect(capturedBody.systemInstruction.parts[0].text).toBe('Be concise');
  });
});

describe('GroqCompletionEngine', () => {
  // Mock streamChatCompletion since Groq delegates to it
  jest.mock('../../openai', () => ({
    streamChatCompletion: jest.fn(),
  }));

  it('delegates to streamChatCompletion with correct params', async () => {
    const {streamChatCompletion} = require('../../openai');
    const {GroqCompletionEngine} = require('../GroqCompletionEngine');

    const mockResult = {
      text: 'Hello',
      content: 'Hello',
      stopped_eos: true,
    };
    (streamChatCompletion as jest.Mock).mockResolvedValueOnce(mockResult);

    const engine = new GroqCompletionEngine('gsk_test', 'llama-3.3-70b-versatile');
    const callback = jest.fn();
    const params = {
      messages: [{role: 'user', content: 'Hi'}],
      n_predict: 100,
      temperature: 0.7,
    };

    const result = await engine.completion(params as any, callback);

    expect(streamChatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'llama-3.3-70b-versatile',
        stream: true,
        max_tokens: 100,
        temperature: 0.7,
      }),
      'https://api.groq.com/openai',
      'gsk_test',
      expect.any(AbortSignal),
      callback,
    );
    expect(result).toBe(mockResult);
  });

  it('stopCompletion aborts', async () => {
    const {GroqCompletionEngine} = require('../GroqCompletionEngine');
    const engine = new GroqCompletionEngine('gsk_test', 'llama-3.3-70b-versatile');
    await engine.stopCompletion();
    // Should not throw
  });
});
