import {
  fetchModels,
  fetchModelsWithHeaders,
  detectServerType,
  testConnection,
  streamChatCompletion,
  buildReasoningPayload,
} from '../openai';

/** Build a minimal Headers-like object for fetch mocks. */
function mockHeaders(entries: Record<string, string> = {}) {
  const map = new Map(Object.entries(entries));
  return {
    forEach: (cb: (v: string, k: string) => void) =>
      map.forEach((v, k) => cb(v, k)),
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
      headers: mockHeaders(),
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
      headers: mockHeaders(),
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
      headers: mockHeaders(),
      json: () => Promise.resolve({}),
    });

    const result = await fetchModels('http://localhost:1234');
    expect(result).toEqual([]);
  });

  it('normalizes trailing slashes in server URL', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      headers: mockHeaders(),
      json: () => Promise.resolve({data: []}),
    });

    await fetchModels('http://localhost:1234///');

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:1234/v1/models',
      expect.any(Object),
    );
  });

  // fetchModels forwards a supplied timeoutMs down to the underlying request:
  // a slow server that never answers aborts at the configured deadline.
  it('forwards timeoutMs to the underlying request (aborts at configured value)', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn().mockImplementation(
      (_url: string, opts: {signal: AbortSignal}) =>
        new Promise((_resolve, reject) => {
          opts.signal.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    );

    const promise = fetchModels('http://localhost:1234', undefined, 7000);
    jest.advanceTimersByTime(7000);
    await expect(promise).rejects.toThrow('Connection timed out');
    jest.useRealTimers();
  });
});

describe('fetchModelsWithHeaders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns models and response headers', async () => {
    const mockModels = [{id: 'model-1', object: 'model', owned_by: 'system'}];

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      headers: mockHeaders({server: 'llama.cpp'}),
      json: () => Promise.resolve({data: mockModels}),
    });

    const result = await fetchModelsWithHeaders('http://localhost:8080');

    expect(result.models).toEqual(mockModels);
    expect(result.headers.server).toBe('llama.cpp');
  });

  // An undefined timeoutMs (e.g. a persisted ServerConfig from a prior version
  // with no requestTimeoutMs) is forwarded raw and must not crash; it behaves
  // identically to today (default applies).
  it('accepts an undefined timeoutMs without crashing', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      headers: mockHeaders(),
      json: () => Promise.resolve({data: []}),
    });

    await expect(
      fetchModelsWithHeaders('http://localhost:8080', undefined, undefined),
    ).resolves.toEqual({models: [], headers: {}});
  });

  // The connection-phase guard on the models probe honours a supplied
  // timeoutMs: an unanswered request aborts at the configured deadline.
  it('aborts the models request at the configured timeout', async () => {
    jest.useFakeTimers();
    const abortSpy = jest.spyOn(AbortController.prototype, 'abort');
    // fetch never resolves — only the timeout can settle this.
    global.fetch = jest.fn().mockImplementation(
      (_url: string, opts: {signal: AbortSignal}) =>
        new Promise((_resolve, reject) => {
          opts.signal.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    );

    const promise = fetchModelsWithHeaders(
      'http://localhost:8080',
      undefined,
      5000,
    );
    jest.advanceTimersByTime(5000);
    await expect(promise).rejects.toThrow('Connection timed out');

    expect(abortSpy).toHaveBeenCalled();
    abortSpy.mockRestore();
    jest.useRealTimers();
  });
});

describe('detectServerType', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('detects llama.cpp from Server header', async () => {
    const result = await detectServerType(
      'http://localhost:8080',
      [{id: 'model-1', object: 'model', owned_by: 'system'}],
      {server: 'llama.cpp'},
    );
    expect(result).toBe('llama.cpp');
  });

  it('detects LM Studio from owned_by field', async () => {
    const result = await detectServerType(
      'http://localhost:1234',
      [{id: 'model-1', object: 'model', owned_by: 'organization_owner'}],
      {},
    );
    expect(result).toBe('LM Studio');
  });

  it('detects Ollama from GET / response', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      text: () => Promise.resolve('Ollama is running'),
    });

    const result = await detectServerType(
      'http://localhost:11434',
      [{id: 'model-1', object: 'model', owned_by: 'ollama'}],
      {},
    );
    expect(result).toBe('Ollama');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:11434',
      expect.objectContaining({method: 'GET'}),
    );
  });

  it('returns empty string for unknown server', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      text: () => Promise.resolve('<html>Not Ollama</html>'),
    });

    const result = await detectServerType(
      'http://localhost:9999',
      [{id: 'model-1', object: 'model', owned_by: 'custom'}],
      {},
    );
    expect(result).toBe('');
  });

  it('returns empty string when Ollama probe fails', async () => {
    global.fetch = jest.fn().mockRejectedValueOnce(new Error('Network error'));

    const result = await detectServerType(
      'http://localhost:9999',
      [{id: 'model-1', object: 'model', owned_by: 'custom'}],
      {},
    );
    expect(result).toBe('');
  });

  it('prefers llama.cpp header over LM Studio owned_by', async () => {
    const result = await detectServerType(
      'http://localhost:8080',
      [{id: 'model-1', object: 'model', owned_by: 'organization_owner'}],
      {server: 'llama.cpp'},
    );
    expect(result).toBe('llama.cpp');
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
      headers: mockHeaders(),
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

  // testConnection forwards a supplied timeoutMs and reports the timeout as a
  // connection failure (rather than red-X-ing early) when the server is slow.
  it('forwards timeoutMs and reports a timeout as a failed probe', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn().mockImplementation(
      (_url: string, opts: {signal: AbortSignal}) =>
        new Promise((_resolve, reject) => {
          opts.signal.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    );

    const promise = testConnection('http://localhost:1234', undefined, 8000);
    jest.advanceTimersByTime(8000);

    await expect(promise).resolves.toEqual({
      ok: false,
      modelCount: 0,
      error: 'Connection timed out',
    });
    jest.useRealTimers();
  });

  // An undefined timeoutMs (old persisted config) is forwarded raw and the
  // probe still succeeds, identical to today.
  it('accepts an undefined timeoutMs without crashing', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      headers: mockHeaders(),
      json: () =>
        Promise.resolve({data: [{id: 'm', object: 'model', owned_by: 'x'}]}),
    });

    await expect(
      testConnection('http://localhost:1234', undefined, undefined),
    ).resolves.toEqual({ok: true, modelCount: 1});
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

  // Simulate a complete error response (headers + body + done)
  simulateErrorResponse(
    status: number,
    body: string | object,
    statusText = '',
  ) {
    this.readyState = 2;
    this.status = status;
    this.statusText = statusText;
    this.responseText = typeof body === 'string' ? body : JSON.stringify(body);
    this.onreadystatechange?.();
    this.readyState = 4;
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
    expect(body.max_completion_tokens).toBe(100);
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

  it('forwards response_format and injects json_schema.name for OpenAI compatibility', async () => {
    const schema = {type: 'object', properties: {name: {type: 'string'}}};
    const resultPromise = streamChatCompletion(
      {
        messages: [{role: 'user', content: 'Hi'}],
        model: 'test-model',
        response_format: {
          type: 'json_schema',
          json_schema: {strict: true, schema},
        },
      },
      'http://localhost:1234',
    );

    const xhr = MockXHR.instances[0];
    const body = JSON.parse(xhr.requestBody);
    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: {strict: true, schema, name: 'response'},
    });

    xhr.simulateHeaders(200);
    xhr.simulateProgress(
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
    );
    xhr.simulateLoad();
    await resultPromise;
  });

  it('preserves caller-supplied json_schema.name', async () => {
    const schema = {type: 'object', properties: {x: {type: 'number'}}};
    const resultPromise = streamChatCompletion(
      {
        messages: [{role: 'user', content: 'Hi'}],
        model: 'test-model',
        response_format: {
          type: 'json_schema',
          json_schema: {name: 'custom', strict: false, schema},
        },
      },
      'http://localhost:1234',
    );

    const xhr = MockXHR.instances[0];
    const body = JSON.parse(xhr.requestBody);
    expect(body.response_format.json_schema.name).toBe('custom');

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
    xhr.simulateErrorResponse(401, {error: {message: 'Invalid API key'}});

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

  it('rejects on server error response with body', async () => {
    const resultPromise = streamChatCompletion(
      {messages: [{role: 'user', content: 'Hi'}], model: 'test-model'},
      'http://localhost:1234',
    );

    const xhr = MockXHR.instances[0];
    xhr.simulateErrorResponse(500, {
      error: {message: 'Internal Server Error'},
    });

    await expect(resultPromise).rejects.toThrow(
      'Server error: 500 — Internal Server Error',
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

  // PACT support over OpenAI-compatible remote engines.
  describe('tool support', () => {
    const calculateTool = {
      type: 'function' as const,
      function: {
        name: 'calculate',
        description: 'Evaluate a math expression',
        parameters: {
          type: 'object',
          properties: {expression: {type: 'string'}},
          required: ['expression'],
        },
      },
    };

    it('forwards tools and tool_choice in the request body', async () => {
      const resultPromise = streamChatCompletion(
        {
          messages: [{role: 'user', content: 'What is 2+2?'}],
          model: 'test-model',
          tools: [calculateTool],
          tool_choice: 'auto',
        },
        'http://localhost:1234',
      );

      const xhr = MockXHR.instances[0];
      const body = JSON.parse(xhr.requestBody);
      expect(body.tools).toEqual([calculateTool]);
      expect(body.tool_choice).toBe('auto');

      // Drain so the promise resolves cleanly.
      xhr.simulateHeaders(200);
      xhr.simulateProgress(
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
      );
      xhr.simulateLoad();
      await resultPromise;
    });

    it('omits tools/tool_choice from the body when caller did not supply them', async () => {
      const resultPromise = streamChatCompletion(
        {messages: [{role: 'user', content: 'hi'}], model: 'test-model'},
        'http://localhost:1234',
      );
      const xhr = MockXHR.instances[0];
      const body = JSON.parse(xhr.requestBody);
      expect(body.tools).toBeUndefined();
      expect(body.tool_choice).toBeUndefined();

      xhr.simulateHeaders(200);
      xhr.simulateProgress(
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
      );
      xhr.simulateLoad();
      await resultPromise;
    });

    it('omits empty tools array (some servers reject it)', async () => {
      const resultPromise = streamChatCompletion(
        {
          messages: [{role: 'user', content: 'hi'}],
          model: 'test-model',
          tools: [],
        },
        'http://localhost:1234',
      );
      const xhr = MockXHR.instances[0];
      const body = JSON.parse(xhr.requestBody);
      expect(body.tools).toBeUndefined();

      xhr.simulateHeaders(200);
      xhr.simulateProgress(
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
      );
      xhr.simulateLoad();
      await resultPromise;
    });

    it('reassembles streamed tool_call deltas into a single complete call', async () => {
      const onToken = jest.fn();
      const resultPromise = streamChatCompletion(
        {
          messages: [{role: 'user', content: 'What is 2+2?'}],
          model: 'test-model',
          tools: [calculateTool],
        },
        'http://localhost:1234',
        undefined,
        undefined,
        onToken,
      );

      const xhr = MockXHR.instances[0];
      xhr.simulateHeaders(200);

      // Chunk 1: id + name arrive on the first delta for index 0.
      xhr.simulateProgress(
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_abc","type":"function","function":{"name":"calculate","arguments":""}}]},"finish_reason":null}]}\n\n',
      );
      // Chunk 2: arguments start streaming.
      xhr.simulateProgress(
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"expression\\":\\"2"}}]},"finish_reason":null}]}\n\n',
      );
      // Chunk 3: arguments finish streaming.
      xhr.simulateProgress(
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"+2\\"}"}}]},"finish_reason":null}]}\n\n',
      );
      // Final chunk: finish_reason="tool_calls".
      xhr.simulateProgress(
        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\ndata: [DONE]\n\n',
      );
      xhr.simulateLoad();

      const result = await resultPromise;

      // Final result carries the assembled call.
      expect(result.tool_calls).toEqual([
        {
          id: 'call_abc',
          type: 'function',
          function: {
            name: 'calculate',
            arguments: '{"expression":"2+2"}',
          },
        },
      ]);
      // tool_calls finish_reason maps to stopped_eos so the agent
      // loop treats it as a normal step end.
      expect(result.stopped_eos).toBe(true);

      // Per-chunk callbacks carry only THIS chunk's arguments fragment
      // (not the accumulated string); the assembled args live on the
      // final result.tool_calls. Keeps assembly out of the hot path.
      const toolCallEvents = onToken.mock.calls.filter(
        ([data]) => data.tool_calls && data.tool_calls.length > 0,
      );
      expect(toolCallEvents.length).toBe(3);
      const calls = toolCallEvents.map(c => c[0].tool_calls[0]);
      expect(calls[0]).toMatchObject({
        id: 'call_abc',
        function: {name: 'calculate', arguments: ''},
      });
      expect(calls[1]).toMatchObject({
        id: 'call_abc',
        function: {name: 'calculate', arguments: '{"expression":"2'},
      });
      expect(calls[2]).toMatchObject({
        id: 'call_abc',
        function: {name: 'calculate', arguments: '+2"}'},
      });
    });

    it('handles parallel tool_calls indexed across chunks', async () => {
      const resultPromise = streamChatCompletion(
        {
          messages: [{role: 'user', content: 'Hi'}],
          model: 'test-model',
          tools: [calculateTool],
        },
        'http://localhost:1234',
      );

      const xhr = MockXHR.instances[0];
      xhr.simulateHeaders(200);
      xhr.simulateProgress(
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_a","type":"function","function":{"name":"calculate","arguments":"{\\"x\\":1}"}},{"index":1,"id":"call_b","type":"function","function":{"name":"calculate","arguments":"{\\"x\\":2}"}}]},"finish_reason":null}]}\n\n',
      );
      xhr.simulateProgress(
        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\ndata: [DONE]\n\n',
      );
      xhr.simulateLoad();

      const result = await resultPromise;
      expect(result.tool_calls).toHaveLength(2);
      expect(result.tool_calls?.[0].id).toBe('call_a');
      expect(result.tool_calls?.[1].id).toBe('call_b');
    });
  });

  // Per-server configurable timeout: a single timeoutMs overrides BOTH the
  // connection-phase guard (default 30s) and the idle-between-chunks guard
  // (default 60s). The two-phase structure stays intact — only the durations
  // change. Driven with fake timers so we assert on the configured deadline.
  describe('configurable timeout', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    // A raised connection timeout lets a slow cold-start server deliver
    // headers well past the 30s default without a premature reject.
    it('honours a raised connection timeout (does not abort before configured value)', async () => {
      const resultPromise = streamChatCompletion(
        {messages: [{role: 'user', content: 'Hi'}], model: 'test-model'},
        'http://localhost:1234',
        undefined,
        undefined,
        undefined,
        600000,
      );
      // Surface any rejection deterministically without an unhandled promise.
      let rejected: Error | null = null;
      resultPromise.catch((e: Error) => {
        rejected = e;
      });

      const xhr = MockXHR.instances[0];

      // Past the 30s default, but well within the configured 600s window.
      jest.advanceTimersByTime(31000);
      await Promise.resolve();
      expect(rejected).toBeNull();
      expect(xhr.status).toBe(0); // never aborted yet

      // Headers finally arrive at ~200s — stream proceeds.
      jest.advanceTimersByTime(170000);
      xhr.simulateHeaders(200);
      xhr.simulateProgress(
        'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}]}\n\n',
      );
      xhr.simulateProgress(
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
      );
      xhr.simulateLoad();

      const result = await resultPromise;
      expect(result.content).toBe('ok');
      expect(rejected).toBeNull();
    });

    // With no timeoutMs supplied, the connection guard still fires at the
    // existing 30s default.
    it('aborts at the 30s default connection timeout when timeoutMs is omitted', async () => {
      const resultPromise = streamChatCompletion(
        {messages: [{role: 'user', content: 'Hi'}], model: 'test-model'},
        'http://localhost:1234',
      );

      // Drive past the 30s default — no headers received.
      jest.advanceTimersByTime(30000);

      await expect(resultPromise).rejects.toThrow('Connection timed out');
    });

    // Once connected, an idle stall longer than the configured value aborts
    // via the idle guard (not the connection guard).
    it('aborts at the configured idle timeout after connecting', async () => {
      const resultPromise = streamChatCompletion(
        {messages: [{role: 'user', content: 'Hi'}], model: 'test-model'},
        'http://localhost:1234',
        undefined,
        undefined,
        undefined,
        120000,
      );

      const xhr = MockXHR.instances[0];
      // Connect (clears the connection guard, arms the idle guard at 120s).
      xhr.simulateHeaders(200);
      xhr.simulateProgress(
        'data: {"choices":[{"delta":{"content":"first"},"finish_reason":null}]}\n\n',
      );

      // No further chunks for >120s → idle guard fires.
      jest.advanceTimersByTime(120000);

      await expect(resultPromise).rejects.toThrow(
        'Idle timeout: no data received',
      );
    });

    // The idle timer resets on each chunk; a healthy stream emitting within
    // the interval runs past the total wall-clock of the timeout. Only the
    // durations changed, not the per-chunk reset structure.
    it('resets the idle timer on each chunk (healthy stream outlives total timeout)', async () => {
      const resultPromise = streamChatCompletion(
        {messages: [{role: 'user', content: 'Hi'}], model: 'test-model'},
        'http://localhost:1234',
        undefined,
        undefined,
        undefined,
        100000,
      );
      let rejected: Error | null = null;
      resultPromise.catch((e: Error) => {
        rejected = e;
      });

      const xhr = MockXHR.instances[0];
      xhr.simulateHeaders(200);

      // Emit a chunk every 80s (under the 100s idle window) five times —
      // total 400s, far beyond the 100s timeout, yet no idle abort because
      // each chunk resets the timer.
      for (let i = 0; i < 5; i++) {
        xhr.simulateProgress(
          `data: {"choices":[{"delta":{"content":"t${i}"},"finish_reason":null}]}\n\n`,
        );
        jest.advanceTimersByTime(80000);
        await Promise.resolve();
        expect(rejected).toBeNull();
      }

      xhr.simulateProgress(
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
      );
      xhr.simulateLoad();

      const result = await resultPromise;
      expect(result.content).toBe('t0t1t2t3t4');
      expect(rejected).toBeNull();
    });

    // Normalization happens exactly once inside openai.ts: a timeoutMs that is
    // undefined, NaN, non-finite, or <= 0 falls back to the default (here the
    // 30s connection guard); a positive finite value passes through. Asserted
    // via the observable connection-deadline behaviour.
    describe('normalization of invalid timeoutMs', () => {
      // For each invalid input, the connection guard must still fire at the
      // 30s default — i.e. the API never sets a 0/negative/NaN deadline.
      it.each([
        ['undefined', undefined],
        ['zero', 0],
        ['negative', -5000],
        ['NaN', NaN],
        ['Infinity', Infinity],
      ])(
        'falls back to the 30s default when timeoutMs is %s',
        async (_label, badValue) => {
          const resultPromise = streamChatCompletion(
            {messages: [{role: 'user', content: 'Hi'}], model: 'test-model'},
            'http://localhost:1234',
            undefined,
            undefined,
            undefined,
            badValue as number | undefined,
          );
          let rejected: Error | null = null;
          resultPromise.catch((e: Error) => {
            rejected = e;
          });

          // Just before the default deadline: still pending (not aborted at 0).
          jest.advanceTimersByTime(29000);
          await Promise.resolve();
          expect(rejected).toBeNull();

          // Crossing the 30s default fires the guard.
          jest.advanceTimersByTime(1000);
          await expect(resultPromise).rejects.toThrow('Connection timed out');
        },
      );

      // A positive finite value passes through untouched — the guard fires at
      // the configured value, not the default.
      it('passes a positive finite timeoutMs through (guard fires at configured value)', async () => {
        const resultPromise = streamChatCompletion(
          {messages: [{role: 'user', content: 'Hi'}], model: 'test-model'},
          'http://localhost:1234',
          undefined,
          undefined,
          undefined,
          5000,
        );
        let rejected: Error | null = null;
        resultPromise.catch((e: Error) => {
          rejected = e;
        });

        // Before the configured 5s: pending.
        jest.advanceTimersByTime(4000);
        await Promise.resolve();
        expect(rejected).toBeNull();

        // At the configured 5s (well before the 30s default): aborts.
        jest.advanceTimersByTime(1000);
        await expect(resultPromise).rejects.toThrow('Connection timed out');
      });
    });
  });
});

describe('buildReasoningPayload (per-serverType gating)', () => {
  it('returns empty when no reasoning intent', () => {
    expect(buildReasoningPayload('llama.cpp', undefined)).toEqual({});
  });

  it('llama.cpp ON sends reasoning_format auto', () => {
    expect(buildReasoningPayload('llama.cpp', {enabled: true})).toEqual({
      reasoning_format: 'auto',
    });
  });

  it('llama.cpp OFF sends enable_thinking:false + reasoning_format none', () => {
    expect(buildReasoningPayload('llama.cpp', {enabled: false})).toEqual({
      reasoning_format: 'none',
      chat_template_kwargs: {enable_thinking: false},
    });
  });

  it('LM Studio OFF sends enable_thinking:false, ON sends nothing', () => {
    expect(buildReasoningPayload('LM Studio', {enabled: false})).toEqual({
      chat_template_kwargs: {enable_thinking: false},
    });
    expect(buildReasoningPayload('LM Studio', {enabled: true})).toEqual({});
  });

  it('vLLM behaves like LM Studio', () => {
    expect(buildReasoningPayload('vLLM', {enabled: false})).toEqual({
      chat_template_kwargs: {enable_thinking: false},
    });
  });

  it('Ollama OFF sends only reasoning_effort none and never think:true', () => {
    const off = buildReasoningPayload('Ollama', {enabled: false});
    expect(off).toEqual({reasoning_effort: 'none'});
    expect(off).not.toHaveProperty('think');
    // ON sends nothing — never think:true, never a non-none effort.
    const on = buildReasoningPayload('Ollama', {enabled: true, effort: 'high'});
    expect(on).toEqual({});
    expect(on).not.toHaveProperty('think');
    expect(on).not.toHaveProperty('reasoning_effort');
  });

  it('OpenAI sends reasoning_effort only when effort is known', () => {
    expect(
      buildReasoningPayload('OpenAI', {enabled: true, effort: 'medium'}),
    ).toEqual({reasoning_effort: 'medium'});
    // No effort known → omit everything (no enable_thinking, no 400 bait).
    expect(buildReasoningPayload('OpenAI', {enabled: true})).toEqual({});
    expect(buildReasoningPayload('OpenAI', {enabled: false})).toEqual({});
  });

  it('unknown serverType omits everything', () => {
    expect(buildReasoningPayload(undefined, {enabled: false})).toEqual({});
    expect(
      buildReasoningPayload('something-else', {enabled: false, effort: 'low'}),
    ).toEqual({});
  });
});

describe('streamChatCompletion reasoning payload', () => {
  let originalXHR: typeof XMLHttpRequest;
  beforeEach(() => {
    originalXHR = global.XMLHttpRequest;
    (global as any).XMLHttpRequest = MockXHR;
    MockXHR.instances = [];
  });
  afterEach(() => {
    global.XMLHttpRequest = originalXHR;
  });

  it('attaches the gated payload by serverType', async () => {
    const resultPromise = streamChatCompletion(
      {
        messages: [{role: 'user', content: 'Hi'}],
        model: 'm',
        reasoning: {enabled: false},
      },
      'http://localhost:1234',
      undefined,
      undefined,
      undefined,
      undefined,
      'llama.cpp',
    );
    const xhr = MockXHR.instances[0];
    const body = JSON.parse(xhr.requestBody);
    expect(body.reasoning_format).toBe('none');
    expect(body.chat_template_kwargs).toEqual({enable_thinking: false});
    // The internal carrier is never sent on the wire.
    expect(body).not.toHaveProperty('reasoning');

    xhr.simulateHeaders(200);
    xhr.simulateProgress(
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
    );
    xhr.simulateLoad();
    await resultPromise;
  });

  it('omits reasoning controls for an unknown serverType', async () => {
    const resultPromise = streamChatCompletion(
      {
        messages: [{role: 'user', content: 'Hi'}],
        model: 'm',
        reasoning: {enabled: false, effort: 'high'},
      },
      'http://localhost:1234',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );
    const xhr = MockXHR.instances[0];
    const body = JSON.parse(xhr.requestBody);
    expect(body).not.toHaveProperty('reasoning_format');
    expect(body).not.toHaveProperty('chat_template_kwargs');
    expect(body).not.toHaveProperty('reasoning_effort');
    expect(body).not.toHaveProperty('think');

    xhr.simulateHeaders(200);
    xhr.simulateProgress(
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
    );
    xhr.simulateLoad();
    await resultPromise;
  });
});
