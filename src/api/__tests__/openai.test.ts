import {fetchModels, testConnection, streamChatCompletion} from '../openai';

// Helper to create a mock SSE Response with a ReadableStream body
function createMockSSEResponse(chunks: string[]) {
  let index = 0;
  const encoder = new TextEncoder();
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Map([['content-type', 'text/event-stream']]),
    text: jest.fn().mockResolvedValue(''),
    body: {
      getReader: () => ({
        read: jest.fn().mockImplementation(() => {
          if (index < chunks.length) {
            return Promise.resolve({
              done: false,
              value: encoder.encode(chunks[index++]),
            });
          }
          return Promise.resolve({done: true, value: undefined});
        }),
        cancel: jest.fn(),
      }),
    },
  };
}

describe('fetchModels', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns model list from server', async () => {
    const mockModels = [
      {id: 'model-1', object: 'model', owned_by: 'system'},
      {id: 'model-2', object: 'model', owned_by: 'library'},
    ];

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({data: mockModels}),
    });

    const result = await fetchModels('http://localhost:1234');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:1234/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: {'Content-Type': 'application/json'},
      }),
    );
    expect(result).toEqual(mockModels);
  });

  it('includes Authorization header when apiKey is provided', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({data: []}),
    });

    await fetchModels('http://localhost:1234', 'sk-test-key');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer sk-test-key',
        },
      }),
    );
  });

  it('handles 401 unauthorized error', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    await expect(
      fetchModels('http://localhost:1234', 'bad-key'),
    ).rejects.toThrow('Unauthorized: Invalid or missing API key');
  });

  it('handles other server errors', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    await expect(fetchModels('http://localhost:1234')).rejects.toThrow(
      'Server error: 500 Internal Server Error',
    );
  });

  it('handles empty data field', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const result = await fetchModels('http://localhost:1234');
    expect(result).toEqual([]);
  });

  it('normalizes trailing slashes in server URL', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({data: []}),
    });

    await fetchModels('http://localhost:1234///');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:1234/v1/models',
      expect.any(Object),
    );
  });
});

describe('testConnection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns ok with model count on success', async () => {
    const mockModels = [
      {id: 'model-1', object: 'model', owned_by: 'system'},
      {id: 'model-2', object: 'model', owned_by: 'system'},
      {id: 'model-3', object: 'model', owned_by: 'system'},
    ];

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({data: mockModels}),
    });

    const result = await testConnection('http://localhost:1234');
    expect(result).toEqual({ok: true, modelCount: 3});
  });

  it('returns error on failure', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    const result = await testConnection('http://localhost:1234', 'bad-key');
    expect(result).toEqual({
      ok: false,
      modelCount: 0,
      error: 'Unauthorized: Invalid or missing API key',
    });
  });

  it('returns error on network failure', async () => {
    global.fetch = jest.fn().mockRejectedValueOnce(new Error('Network error'));

    const result = await testConnection('http://localhost:1234');
    expect(result).toEqual({
      ok: false,
      modelCount: 0,
      error: 'Network error',
    });
  });
});

describe('streamChatCompletion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('streams tokens and returns full completion result', async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ];

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createMockSSEResponse(chunks));

    const onToken = jest.fn();
    const resultPromise = streamChatCompletion(
      {messages: [{role: 'user', content: 'Hi'}], model: 'test-model'},
      'http://localhost:1234',
      undefined,
      undefined,
      onToken,
    );

    const result = await resultPromise;

    expect(result.text).toBe('Hello world');
    expect(result.content).toBe('Hello world');
    expect(result.stopped_eos).toBe(true);
    expect(result.tokens_predicted).toBe(2);

    expect(onToken).toHaveBeenCalledTimes(2);
    expect(onToken).toHaveBeenCalledWith(
      expect.objectContaining({content: 'Hello', token: 'Hello'}),
    );
    expect(onToken).toHaveBeenCalledWith(
      expect.objectContaining({content: ' world', token: ' world'}),
    );
  });

  it('handles abort via AbortController', async () => {
    const controller = new AbortController();
    let readCallCount = 0;

    const mockResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Map(),
      text: jest.fn().mockResolvedValue(''),
      body: {
        getReader: () => ({
          read: jest.fn().mockImplementation(() => {
            readCallCount++;
            if (readCallCount === 1) {
              // First read returns a valid chunk
              return Promise.resolve({
                done: false,
                value: new TextEncoder().encode(
                  'data: {"choices":[{"delta":{"content":"partial"},"finish_reason":null}]}\n\n',
                ),
              });
            }
            // Second read: abort signal is triggered before this read
            controller.abort();
            return Promise.resolve({
              done: false,
              value: new TextEncoder().encode(
                'data: {"choices":[{"delta":{"content":" more"},"finish_reason":null}]}\n\n',
              ),
            });
          }),
          cancel: jest.fn(),
        }),
      },
    };

    global.fetch = jest.fn().mockResolvedValueOnce(mockResponse);

    const result = await streamChatCompletion(
      {messages: [{role: 'user', content: 'Hi'}], model: 'test-model'},
      'http://localhost:1234',
      undefined,
      controller.signal,
    );

    expect(result.interrupted).toBe(true);
    expect(result.content).toBe('partial');
  });

  it('sends correct request body', async () => {
    const chunks = [
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ];

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createMockSSEResponse(chunks));

    await streamChatCompletion(
      {
        messages: [{role: 'user', content: 'Hi'}],
        model: 'test-model',
        temperature: 0.7,
        top_p: 0.9,
        max_tokens: 100,
        stop: ['</s>'],
      },
      'http://localhost:1234',
      'sk-key',
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:1234/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer sk-key',
        },
        body: JSON.stringify({
          model: 'test-model',
          messages: [{role: 'user', content: 'Hi'}],
          temperature: 0.7,
          top_p: 0.9,
          max_tokens: 100,
          stop: ['</s>'],
          stream: true,
        }),
      }),
    );
  });

  it('maps finish_reason "length" to stopped_limit', async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"text"},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n',
      'data: [DONE]\n\n',
    ];

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createMockSSEResponse(chunks));

    const result = await streamChatCompletion(
      {messages: [{role: 'user', content: 'Hi'}], model: 'test-model'},
      'http://localhost:1234',
    );

    expect(result.stopped_limit).toBe(1);
    expect(result.stopped_eos).toBeUndefined();
  });

  it('maps finish_reason "content_filter" to interrupted', async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"filtered"},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"content_filter"}]}\n\n',
      'data: [DONE]\n\n',
    ];

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createMockSSEResponse(chunks));

    const result = await streamChatCompletion(
      {messages: [{role: 'user', content: 'Hi'}], model: 'test-model'},
      'http://localhost:1234',
    );

    expect(result.interrupted).toBe(true);
  });

  it('skips malformed SSE events with valid JSON but wrong structure', async () => {
    // Suppress __DEV__ console.warn for this test
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

    const chunks = [
      'data: {"not_choices":"wrong structure"}\n\n',
      'data: {"choices":[{"delta":{"content":"valid"},"finish_reason":null}]}\n\n',
      'data: [DONE]\n\n',
    ];

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createMockSSEResponse(chunks));

    const onToken = jest.fn();
    const result = await streamChatCompletion(
      {messages: [{role: 'user', content: 'Hi'}], model: 'test-model'},
      'http://localhost:1234',
      undefined,
      undefined,
      onToken,
    );

    expect(result.content).toBe('valid');
    expect(onToken).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });

  it('handles reasoning_content in streaming delta', async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"reasoning_content":"thinking..."},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{"content":"answer"},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ];

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(createMockSSEResponse(chunks));

    const onToken = jest.fn();
    const result = await streamChatCompletion(
      {messages: [{role: 'user', content: 'Hi'}], model: 'test-model'},
      'http://localhost:1234',
      undefined,
      undefined,
      onToken,
    );

    expect(result.reasoning_content).toBe('thinking...');
    expect(result.content).toBe('answer');
    expect(onToken).toHaveBeenCalledTimes(2);
    expect(onToken).toHaveBeenCalledWith(
      expect.objectContaining({reasoning_content: 'thinking...'}),
    );
  });

  it('throws on non-ok response', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: jest.fn().mockResolvedValue('Invalid API key'),
    });

    await expect(
      streamChatCompletion(
        {messages: [{role: 'user', content: 'Hi'}], model: 'test-model'},
        'http://localhost:1234',
      ),
    ).rejects.toThrow('Unauthorized: Invalid or missing API key');
  });

  it('throws error when response body is not readable', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Map(),
      body: null,
    });

    await expect(
      streamChatCompletion(
        {messages: [{role: 'user', content: 'Hi'}], model: 'test-model'},
        'http://localhost:1234',
      ),
    ).rejects.toThrow('Response body is not readable');
  });
});
