import {fetchModels, testConnection, streamChatCompletion} from '../openai';

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

// Mock XMLHttpRequest for streaming tests
type XHREventHandler = (() => void) | null;

class MockXHR {
  static instances: MockXHR[] = [];
  static HEADERS_RECEIVED = 2;
  static DONE = 4;

  method = '';
  url = '';
  requestHeaders: Record<string, string> = {};
  requestBody = '';
  responseText = '';
  readyState = 0;
  status = 0;
  statusText = '';

  onreadystatechange: XHREventHandler = null;
  onprogress: XHREventHandler = null;
  onload: XHREventHandler = null;
  onerror: XHREventHandler = null;
  onabort: XHREventHandler = null;

  constructor() {
    MockXHR.instances.push(this);
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(key: string, value: string) {
    this.requestHeaders[key] = value;
  }

  send(body?: string) {
    this.requestBody = body || '';
  }

  abort() {
    this.onabort?.();
  }

  // Simulate receiving headers
  simulateHeaders(status: number, statusText = 'OK') {
    this.readyState = 2; // HEADERS_RECEIVED
    this.status = status;
    this.statusText = statusText;
    this.onreadystatechange?.();
  }

  // Simulate receiving a chunk of SSE data
  simulateProgress(text: string) {
    this.responseText += text;
    this.onprogress?.();
  }

  // Simulate request completion
  simulateLoad() {
    this.readyState = 4;
    this.onload?.();
  }

  // Simulate network error
  simulateError() {
    this.onerror?.();
  }
}

describe('streamChatCompletion', () => {
  let originalXHR: typeof XMLHttpRequest;

  beforeEach(() => {
    jest.clearAllMocks();
    MockXHR.instances = [];
    originalXHR = global.XMLHttpRequest;
    (global as any).XMLHttpRequest = MockXHR;
  });

  afterEach(() => {
    global.XMLHttpRequest = originalXHR;
  });

  it('streams tokens and returns full completion result', async () => {
    const onToken = jest.fn();
    const resultPromise = streamChatCompletion(
      {messages: [{role: 'user', content: 'Hi'}], model: 'test-model'},
      'http://localhost:1234',
      undefined,
      undefined,
      onToken,
    );

    // Get the mock XHR instance
    const xhr = MockXHR.instances[0];

    // Simulate successful headers
    xhr.simulateHeaders(200);

    // Simulate SSE chunks arriving
    xhr.simulateProgress(
      'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}\n\n',
    );
    xhr.simulateProgress(
      'data: {"choices":[{"delta":{"content":" world"},"finish_reason":null}]}\n\n',
    );
    xhr.simulateProgress(
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
    );
    xhr.simulateProgress('data: [DONE]\n\n');

    // Simulate completion
    xhr.simulateLoad();

    const result = await resultPromise;

    expect(result.text).toBe('Hello world');
    expect(result.content).toBe('Hello world');
    expect(result.stopped_eos).toBe(true);
    expect(result.tokens_predicted).toBe(2);

    expect(onToken).toHaveBeenCalledTimes(2);
    // content is accumulated (matching llama.rn behavior), token is delta
    expect(onToken).toHaveBeenCalledWith(
      expect.objectContaining({content: 'Hello', token: 'Hello'}),
    );
    expect(onToken).toHaveBeenCalledWith(
      expect.objectContaining({content: 'Hello world', token: ' world'}),
    );
  });

  it('sends correct request headers and body', async () => {
    const resultPromise = streamChatCompletion(
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

    const xhr = MockXHR.instances[0];

    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe('http://localhost:1234/v1/chat/completions');
    expect(xhr.requestHeaders['Content-Type']).toBe('application/json');
    expect(xhr.requestHeaders.Authorization).toBe('Bearer sk-key');

    const body = JSON.parse(xhr.requestBody);
    expect(body.model).toBe('test-model');
    expect(body.temperature).toBe(0.7);
    expect(body.top_p).toBe(0.9);
    expect(body.max_tokens).toBe(100);
    expect(body.stop).toEqual(['</s>']);
    expect(body.stream).toBe(true);

    // Complete the request
    xhr.simulateHeaders(200);
    xhr.simulateProgress(
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
    );
    xhr.simulateLoad();

    await resultPromise;
  });

  it('maps finish_reason "length" to stopped_limit', async () => {
    const resultPromise = streamChatCompletion(
      {messages: [{role: 'user', content: 'Hi'}], model: 'test-model'},
      'http://localhost:1234',
    );

    const xhr = MockXHR.instances[0];
    xhr.simulateHeaders(200);
    xhr.simulateProgress(
      'data: {"choices":[{"delta":{"content":"text"},"finish_reason":null}]}\n\n',
    );
    xhr.simulateProgress(
      'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n',
    );
    xhr.simulateLoad();

    const result = await resultPromise;
    expect(result.stopped_limit).toBe(1);
    expect(result.stopped_eos).toBeUndefined();
  });

  it('maps finish_reason "content_filter" to interrupted', async () => {
    const resultPromise = streamChatCompletion(
      {messages: [{role: 'user', content: 'Hi'}], model: 'test-model'},
      'http://localhost:1234',
    );

    const xhr = MockXHR.instances[0];
    xhr.simulateHeaders(200);
    xhr.simulateProgress(
      'data: {"choices":[{"delta":{"content":"filtered"},"finish_reason":null}]}\n\n',
    );
    xhr.simulateProgress(
      'data: {"choices":[{"delta":{},"finish_reason":"content_filter"}]}\n\ndata: [DONE]\n\n',
    );
    xhr.simulateLoad();

    const result = await resultPromise;
    expect(result.interrupted).toBe(true);
  });

  it('skips malformed SSE events', async () => {
    const onToken = jest.fn();
    const resultPromise = streamChatCompletion(
      {messages: [{role: 'user', content: 'Hi'}], model: 'test-model'},
      'http://localhost:1234',
      undefined,
      undefined,
      onToken,
    );

    const xhr = MockXHR.instances[0];
    xhr.simulateHeaders(200);
    xhr.simulateProgress('data: {"not_choices":"wrong structure"}\n\n');
    xhr.simulateProgress(
      'data: {"choices":[{"delta":{"content":"valid"},"finish_reason":null}]}\n\n',
    );
    xhr.simulateProgress('data: [DONE]\n\n');
    xhr.simulateLoad();

    const result = await resultPromise;
    expect(result.content).toBe('valid');
    expect(onToken).toHaveBeenCalledTimes(1);
  });

  it('handles reasoning_content in streaming delta', async () => {
    const onToken = jest.fn();
    const resultPromise = streamChatCompletion(
      {messages: [{role: 'user', content: 'Hi'}], model: 'test-model'},
      'http://localhost:1234',
      undefined,
      undefined,
      onToken,
    );

    const xhr = MockXHR.instances[0];
    xhr.simulateHeaders(200);
    xhr.simulateProgress(
      'data: {"choices":[{"delta":{"reasoning_content":"thinking..."},"finish_reason":null}]}\n\n',
    );
    xhr.simulateProgress(
      'data: {"choices":[{"delta":{"content":"answer"},"finish_reason":null}]}\n\n',
    );
    xhr.simulateProgress(
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
    );
    xhr.simulateLoad();

    const result = await resultPromise;
    expect(result.reasoning_content).toBe('thinking...');
    expect(result.content).toBe('answer');
    expect(onToken).toHaveBeenCalledTimes(2);
    expect(onToken).toHaveBeenCalledWith(
      expect.objectContaining({reasoning_content: 'thinking...'}),
    );
  });

  it('handles delta.reasoning field (LM Studio format)', async () => {
    const onToken = jest.fn();
    const resultPromise = streamChatCompletion(
      {messages: [{role: 'user', content: 'Hi'}], model: 'test-model'},
      'http://localhost:1234',
      undefined,
      undefined,
      onToken,
    );

    const xhr = MockXHR.instances[0];
    xhr.simulateHeaders(200);
    xhr.simulateProgress(
      'data: {"choices":[{"delta":{"reasoning":"let me think..."},"finish_reason":null}]}\n\n',
    );
    xhr.simulateProgress(
      'data: {"choices":[{"delta":{"content":"answer"},"finish_reason":null}]}\n\n',
    );
    xhr.simulateProgress(
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
    );
    xhr.simulateLoad();

    const result = await resultPromise;
    expect(result.reasoning_content).toBe('let me think...');
    expect(result.content).toBe('answer');
    expect(onToken).toHaveBeenCalledTimes(2);
    expect(onToken).toHaveBeenCalledWith(
      expect.objectContaining({reasoning_content: 'let me think...'}),
    );
  });

  it('rejects on 401 response', async () => {
    const resultPromise = streamChatCompletion(
      {messages: [{role: 'user', content: 'Hi'}], model: 'test-model'},
      'http://localhost:1234',
    );

    const xhr = MockXHR.instances[0];
    xhr.simulateHeaders(401, 'Unauthorized');

    await expect(resultPromise).rejects.toThrow(
      'Unauthorized: Invalid or missing API key',
    );
  });

  it('rejects on network error', async () => {
    const resultPromise = streamChatCompletion(
      {messages: [{role: 'user', content: 'Hi'}], model: 'test-model'},
      'http://localhost:1234',
    );

    const xhr = MockXHR.instances[0];
    xhr.simulateError();

    await expect(resultPromise).rejects.toThrow('Network error');
  });

  it('rejects on server error response', async () => {
    const resultPromise = streamChatCompletion(
      {messages: [{role: 'user', content: 'Hi'}], model: 'test-model'},
      'http://localhost:1234',
    );

    const xhr = MockXHR.instances[0];
    xhr.simulateHeaders(500, 'Internal Server Error');

    await expect(resultPromise).rejects.toThrow(
      'Server error: 500 Internal Server Error',
    );
  });

  it('handles abort via AbortController', async () => {
    const controller = new AbortController();
    const resultPromise = streamChatCompletion(
      {messages: [{role: 'user', content: 'Hi'}], model: 'test-model'},
      'http://localhost:1234',
      undefined,
      controller.signal,
    );

    const xhr = MockXHR.instances[0];
    xhr.simulateHeaders(200);
    xhr.simulateProgress(
      'data: {"choices":[{"delta":{"content":"partial"},"finish_reason":null}]}\n\n',
    );

    // Trigger abort
    controller.abort();

    const result = await resultPromise;
    expect(result.interrupted).toBe(true);
    expect(result.content).toBe('partial');
  });

  it('captures server-side timings from SSE events (llama.cpp)', async () => {
    const resultPromise = streamChatCompletion(
      {messages: [{role: 'user', content: 'Hi'}], model: 'test-model'},
      'http://localhost:1234',
    );

    const xhr = MockXHR.instances[0];
    xhr.simulateHeaders(200);
    xhr.simulateProgress(
      'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}\n\n',
    );
    // llama.cpp sends timings in the final event alongside finish_reason
    xhr.simulateProgress(
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"timings":{"predicted_per_token_ms":12.5,"predicted_per_second":80.0,"prompt_per_token_ms":1.2,"prompt_per_second":833.3}}\n\n',
    );
    xhr.simulateProgress('data: [DONE]\n\n');
    xhr.simulateLoad();

    const result = await resultPromise;
    expect(result.timings).toEqual({
      predicted_per_token_ms: 12.5,
      predicted_per_second: 80.0,
      prompt_per_token_ms: 1.2,
      prompt_per_second: 833.3,
    });
    expect(result.content).toBe('Hello');
    expect(result.stopped_eos).toBe(true);
  });

  it('returns no timings when server does not provide them', async () => {
    const resultPromise = streamChatCompletion(
      {messages: [{role: 'user', content: 'Hi'}], model: 'test-model'},
      'http://localhost:1234',
    );

    const xhr = MockXHR.instances[0];
    xhr.simulateHeaders(200);
    xhr.simulateProgress(
      'data: {"choices":[{"delta":{"content":"Hi"},"finish_reason":null}]}\n\n',
    );
    xhr.simulateProgress(
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
    );
    xhr.simulateLoad();

    const result = await resultPromise;
    expect(result.timings).toBeUndefined();
  });

  it('rejects immediately if signal already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      streamChatCompletion(
        {messages: [{role: 'user', content: 'Hi'}], model: 'test-model'},
        'http://localhost:1234',
        undefined,
        controller.signal,
      ),
    ).rejects.toThrow('Completion aborted');
  });
});
