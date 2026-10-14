import {openEventStream} from '../eventStream';
import type {EventStreamHandlers, SSEEvent} from '../eventStream';

type Handler = (() => void) | null;

class MockXHR {
  static instances: MockXHR[] = [];
  static HEADERS_RECEIVED = 2;
  static DONE = 4;

  method = '';
  url = '';
  requestHeaders: Record<string, string> = {};
  sent = false;
  requestBody: string | undefined;
  responseText = '';
  readyState = 0;
  status = 0;

  onreadystatechange: Handler = null;
  onprogress: Handler = null;
  onload: Handler = null;
  onerror: Handler = null;
  onabort: Handler = null;

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
    this.sent = true;
    this.requestBody = body;
  }

  abort() {
    this.onabort?.();
  }

  headers(status: number) {
    this.readyState = 2;
    this.status = status;
    this.onreadystatechange?.();
  }

  progress(text: string) {
    this.responseText += text;
    this.onprogress?.();
  }

  load() {
    this.readyState = 4;
    this.onload?.();
  }

  errorResponse(status: number, body: string) {
    this.headers(status);
    this.responseText = body;
    this.readyState = 4;
    this.onreadystatechange?.();
  }
}

function recordingHandlers() {
  const events: SSEEvent[] = [];
  const flushed: SSEEvent[] = [];
  const handlers: EventStreamHandlers = {
    onOpen: jest.fn(),
    onEvents: jest.fn((batch: Iterable<SSEEvent>) => {
      events.push(...batch);
    }),
    onLoad: jest.fn((batch: Iterable<SSEEvent>) => {
      flushed.push(...batch);
    }),
    onHttpError: jest.fn(),
    onNetworkError: jest.fn(),
    onConnectTimeout: jest.fn(),
    onAbort: jest.fn(),
  };
  return {handlers, events, flushed};
}

const options = {
  headers: {Accept: 'text/event-stream'},
  connectTimeoutMs: 1000,
};

describe('openEventStream', () => {
  let originalXHR: typeof XMLHttpRequest;

  beforeEach(() => {
    jest.useFakeTimers();
    MockXHR.instances = [];
    originalXHR = global.XMLHttpRequest;
    (global as any).XMLHttpRequest = MockXHR;
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    global.XMLHttpRequest = originalXHR;
  });

  it('opens the request with the given method, headers and body', () => {
    const {handlers} = recordingHandlers();
    openEventStream(
      'http://h/sse',
      {...options, method: 'POST', body: '{"a":1}'},
      handlers,
    );

    const xhr = MockXHR.instances[0];
    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe('http://h/sse');
    expect(xhr.requestHeaders).toEqual({Accept: 'text/event-stream'});
    expect(xhr.requestBody).toBe('{"a":1}');
  });

  it('delivers each event once across cumulative progress callbacks', () => {
    const {handlers, events} = recordingHandlers();
    openEventStream('http://h/sse', options, handlers);
    const xhr = MockXHR.instances[0];

    xhr.headers(200);
    xhr.progress('data: {"n":1}\n\n');
    xhr.progress('data: {"n":2}\n\n');

    expect(events).toEqual([{n: 1}, {n: 2}]);
    expect(handlers.onOpen).toHaveBeenCalledTimes(1);
  });

  it('flushes a trailing event without a newline on load', () => {
    const {handlers, events, flushed} = recordingHandlers();
    openEventStream('http://h/sse', options, handlers);
    const xhr = MockXHR.instances[0];

    xhr.headers(200);
    xhr.progress('data: {"n":1}\n\ndata: {"n":2}');
    xhr.load();

    expect(events).toEqual([{n: 1}]);
    expect(flushed).toEqual([{n: 2}]);
  });

  it('reports a non-2xx answer with its numeric status and body', () => {
    const {handlers} = recordingHandlers();
    openEventStream('http://h/sse', options, handlers);

    MockXHR.instances[0].errorResponse(404, '{"error":{"code":404}}');

    expect(handlers.onHttpError).toHaveBeenCalledWith(
      404,
      '{"error":{"code":404}}',
    );
    expect(handlers.onOpen).not.toHaveBeenCalled();
    expect(handlers.onAbort).not.toHaveBeenCalled();
  });

  it('hands bytes arriving after an abort to no handler', () => {
    const {handlers, events} = recordingHandlers();
    const controller = new AbortController();
    openEventStream(
      'http://h/sse',
      {...options, signal: controller.signal},
      handlers,
    );
    const xhr = MockXHR.instances[0];
    xhr.headers(200);
    xhr.progress('data: {"n":1}\n\n');

    controller.abort();
    xhr.progress('data: {"n":2}\n\n');
    xhr.load();

    expect(events).toEqual([{n: 1}]);
    expect(handlers.onAbort).toHaveBeenCalledTimes(1);
    expect(handlers.onLoad).not.toHaveBeenCalled();
  });

  it('times out the connect phase only before headers arrive', () => {
    const first = recordingHandlers();
    openEventStream('http://h/sse', options, first.handlers);
    jest.advanceTimersByTime(1000);
    expect(first.handlers.onConnectTimeout).toHaveBeenCalledTimes(1);
    expect(first.handlers.onAbort).not.toHaveBeenCalled();

    const second = recordingHandlers();
    openEventStream('http://h/sse', options, second.handlers);
    MockXHR.instances[1].headers(200);
    jest.advanceTimersByTime(10 * 60 * 1000);
    expect(second.handlers.onConnectTimeout).not.toHaveBeenCalled();
  });

  it('runs no handler after the caller closes it', () => {
    const {handlers} = recordingHandlers();
    const stream = openEventStream('http://h/sse', options, handlers);
    const xhr = MockXHR.instances[0];
    xhr.headers(200);

    stream.close();
    xhr.progress('data: {"n":1}\n\n');
    xhr.load();
    xhr.onerror?.();

    expect(handlers.onEvents).not.toHaveBeenCalled();
    expect(handlers.onLoad).not.toHaveBeenCalled();
    expect(handlers.onNetworkError).not.toHaveBeenCalled();
    expect(handlers.onAbort).not.toHaveBeenCalled();
  });

  it('does not send when the signal is already aborted', () => {
    const {handlers} = recordingHandlers();
    const controller = new AbortController();
    controller.abort();

    openEventStream(
      'http://h/sse',
      {...options, signal: controller.signal},
      handlers,
    );

    expect(MockXHR.instances[0].sent).toBe(false);
    expect(handlers.onAbort).toHaveBeenCalledTimes(1);
  });

  it('reports a transport failure as a network error', () => {
    const {handlers} = recordingHandlers();
    openEventStream('http://h/sse', options, handlers);

    MockXHR.instances[0].onerror?.();

    expect(handlers.onNetworkError).toHaveBeenCalledTimes(1);
  });
});
