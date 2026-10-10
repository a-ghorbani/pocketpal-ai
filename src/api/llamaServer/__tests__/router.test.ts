import {openRouterEvents, postLoad, postUnload} from '../router';
import {serverReason} from '../routerWire';
import {
  routerWireEvents,
  routerWireJson,
  routerWireResponse,
  routerWireText,
} from '../../../../jest/fixtures/routerWire';

const notFound = routerWireJson('unload-not-found-400.json');
const unregistered = routerWireResponse('sse-unregistered-404.txt');
const unauthorized = routerWireResponse('sse-unauthorized-401.txt');
const shiftedControl = routerWireResponse('sse-shifted-control-200.txt');
const authorizedControl = routerWireResponse('sse-authorized-control-200.txt');

const mockFetch = (status: number, body: unknown) =>
  jest.fn().mockResolvedValue({status, json: async () => body});

const target = {url: 'http://desktop:8080/', apiKey: 'secret'};

describe('router operations', () => {
  it('posts the model id verbatim with the api key', async () => {
    const fetchMock = mockFetch(200, {success: true});
    global.fetch = fetchMock;

    await postLoad(target, 'org/model-GGUF:Q8_0', new AbortController().signal);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://desktop:8080/models/load');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({model: 'org/model-GGUF:Q8_0'});
    expect(init.headers.Authorization).toBe('Bearer secret');
  });

  it('posts an unload to its own route', async () => {
    const fetchMock = mockFetch(200, {success: true});
    global.fetch = fetchMock;

    await postUnload(target, 'alpha', new AbortController().signal);

    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://desktop:8080/models/unload',
    );
  });

  it('resolves a 400 with its body, which surfaces as the reason', async () => {
    global.fetch = mockFetch(400, notFound);

    const result = await postUnload(
      target,
      'nope',
      new AbortController().signal,
    );

    expect(result.status).toBe(400);
    expect(serverReason(result.body)).toBe('model is not found');
  });

  it('resolves a body that is not JSON as no body', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 502,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    });

    const result = await postLoad(
      target,
      'alpha',
      new AbortController().signal,
    );

    expect(result).toEqual({status: 502, body: null});
  });

  it('aborts the request with the given signal', async () => {
    global.fetch = jest.fn().mockImplementation(
      (_url: string, init: {signal: AbortSignal}) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );
    const controller = new AbortController();

    const pending = postLoad(target, 'alpha', controller.signal);
    controller.abort();

    await expect(pending).rejects.toMatchObject({name: 'AbortError'});
  });
});

type Handler = (() => void) | null;

class MockXHR {
  static instances: MockXHR[] = [];
  static HEADERS_RECEIVED = 2;
  static DONE = 4;

  url = '';
  requestHeaders: Record<string, string> = {};
  responseText = '';
  readyState = 0;
  status = 0;
  aborted = false;

  onreadystatechange: Handler = null;
  onprogress: Handler = null;
  onload: Handler = null;
  onerror: Handler = null;
  onabort: Handler = null;

  constructor() {
    MockXHR.instances.push(this);
  }

  open(_method: string, url: string) {
    this.url = url;
  }

  setRequestHeader(key: string, value: string) {
    this.requestHeaders[key] = value;
  }

  send() {}

  abort() {
    this.aborted = true;
    this.onabort?.();
  }

  respondHead(status: number) {
    this.readyState = 2;
    this.status = status;
    this.onreadystatechange?.();
  }

  respondFailure(status: number, body: string) {
    this.respondHead(status);
    this.readyState = 4;
    this.responseText = body;
    this.onreadystatechange?.();
  }

  pushChunk(text: string) {
    this.responseText += text;
    this.onprogress?.();
  }

  finish() {
    this.readyState = 4;
    this.onload?.();
  }
}

describe('openRouterEvents', () => {
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

  const open = () => {
    const handlers = {onOpen: jest.fn(), onEvent: jest.fn(), onEnd: jest.fn()};
    const handle = openRouterEvents(target, handlers);
    return {handle, handlers, xhr: MockXHR.instances[0]};
  };

  it('asks for the event stream with the api key', () => {
    const {xhr} = open();

    expect(xhr.url).toBe('http://desktop:8080/models/sse');
    expect(xhr.requestHeaders.Accept).toBe('text/event-stream');
    expect(xhr.requestHeaders.Authorization).toBe('Bearer secret');
  });

  it('delivers every captured payload in order', () => {
    const {handlers, xhr} = open();

    xhr.respondHead(shiftedControl.status);
    const capture = routerWireText('sse-load-sequence.txt');
    xhr.pushChunk(capture.slice(0, 200));
    xhr.pushChunk(capture.slice(200));
    xhr.finish();

    expect(handlers.onEvent.mock.calls.map(([event]) => event)).toEqual(
      routerWireEvents('sse-load-sequence.txt'),
    );
  });

  it.each([
    ['unregistered route', unregistered, 404],
    ['missing api key', unauthorized, 401],
  ])('reports the %s status as a number', (_label, capture, expected) => {
    const {handlers, xhr} = open();

    xhr.respondFailure(capture.status, capture.body);

    expect(handlers.onEnd).toHaveBeenCalledTimes(1);
    expect(handlers.onEnd).toHaveBeenCalledWith(expected);
    expect(handlers.onOpen).not.toHaveBeenCalled();
  });

  it.each([
    ['shifted path', shiftedControl],
    ['authorized', authorizedControl],
  ])('reports the %s control as open', (_label, capture) => {
    // Each control is the same server answering 200 where its sibling capture
    // answered 404 or 401, so those two are about the route and the key.
    expect(capture.headers['content-type']).toBe('text/event-stream');
    const {handlers, xhr} = open();

    xhr.respondHead(capture.status);

    expect(handlers.onOpen).toHaveBeenCalled();
    expect(handlers.onEnd).not.toHaveBeenCalled();
  });

  it('applies no idle timeout once open', () => {
    const {handlers, xhr} = open();
    xhr.respondHead(200);

    jest.advanceTimersByTime(10 * 60 * 1000);

    expect(handlers.onEnd).not.toHaveBeenCalled();
    expect(xhr.aborted).toBe(false);
  });

  it('ends without a status when the connect phase times out', () => {
    const {handlers} = open();

    jest.advanceTimersByTime(30000);

    expect(handlers.onEnd).toHaveBeenCalledWith();
  });

  it('tells nobody about a close the caller asked for', () => {
    const {handle, handlers, xhr} = open();
    xhr.respondHead(200);

    handle.close();

    expect(xhr.aborted).toBe(true);
    expect(handlers.onEnd).not.toHaveBeenCalled();
  });

  it('reports a stream that ended on its own', () => {
    const {handlers, xhr} = open();
    xhr.respondHead(200);

    xhr.finish();

    expect(handlers.onEnd).toHaveBeenCalledWith();
  });
});
