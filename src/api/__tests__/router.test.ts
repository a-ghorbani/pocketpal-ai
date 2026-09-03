import {
  openRouterEventStream,
  routerDownload,
  routerErrorMessage,
  routerLoad,
  routerUnload,
  RouterStreamError,
} from '../router';
import {
  routerWireEvents,
  routerWireJson,
  routerWireResponse,
  routerWireText,
} from '../../../jest/fixtures/routerWire';

const notRunning = routerWireJson('unload-not-running-400.json');
const notFound = routerWireJson('unload-not-found-400.json');
const unregistered = routerWireResponse('sse-unregistered-404.txt');
const unauthorized = routerWireResponse('sse-unauthorized-401.txt');
const shiftedControl = routerWireResponse('sse-shifted-control-200.txt');
const authorizedControl = routerWireResponse('sse-authorized-control-200.txt');

const mockFetch = (status: number, body: unknown) =>
  jest.fn().mockResolvedValue({
    status,
    json: async () => body,
  });

describe('router operations', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('posts the model id verbatim with the api key', async () => {
    const fetchMock = mockFetch(200, {success: true});
    (global as any).fetch = fetchMock;

    await routerDownload(
      'http://desktop:8080/',
      'ggml-org/gemma-3-270m-it-GGUF:Q8_0',
      'secret',
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://desktop:8080/models');
    expect(JSON.parse(init.body)).toEqual({
      model: 'ggml-org/gemma-3-270m-it-GGUF:Q8_0',
    });
    expect(init.headers.Authorization).toBe('Bearer secret');
  });

  it.each([
    ['not running', notRunning],
    ['not found', notFound],
  ])('resolves a 400 (%s) instead of throwing', async (_label, body) => {
    (global as any).fetch = mockFetch(400, body);

    const result = await routerUnload('http://desktop:8080', 'alpha');

    expect(result.status).toBe(400);
    expect(result.body).toEqual(body);
  });

  it('resolves the accepted-but-unvalidated 200 without inspecting it', async () => {
    (global as any).fetch = mockFetch(200, {success: true});

    const result = await routerLoad('http://desktop:8080', 'alpha');

    expect(result.status).toBe(200);
  });

  it('reads a reason only where the server gave one', () => {
    expect(routerErrorMessage(notRunning)).toBe('model is not running');
    expect(routerErrorMessage({success: true})).toBeUndefined();
  });
});

type XHRHandler = (() => void) | null;

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

  onreadystatechange: XHRHandler = null;
  onprogress: XHRHandler = null;
  onload: XHRHandler = null;
  onerror: XHRHandler = null;
  ontimeout: XHRHandler = null;

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

describe('openRouterEventStream', () => {
  let originalXHR: typeof XMLHttpRequest;

  beforeEach(() => {
    MockXHR.instances = [];
    originalXHR = global.XMLHttpRequest;
    (global as any).XMLHttpRequest = MockXHR;
  });

  afterEach(() => {
    global.XMLHttpRequest = originalXHR;
  });

  const open = (handlers: Parameters<typeof openRouterEventStream>[2]) => {
    const handle = openRouterEventStream(
      'http://desktop:8080',
      undefined,
      handlers,
    );
    return {handle, xhr: MockXHR.instances[0]};
  };

  it('delivers every captured payload in order', () => {
    const events: any[] = [];
    const {xhr} = open({onEvent: e => events.push(e)});

    xhr.respondHead(shiftedControl.status);
    const capture = routerWireText('sse-load-sequence.txt');
    xhr.pushChunk(capture.slice(0, 200));
    xhr.pushChunk(capture.slice(200));
    xhr.finish();

    expect(events).toEqual(routerWireEvents('sse-load-sequence.txt'));
  });

  it.each([
    ['unregistered route', unregistered, 404],
    ['missing api key', unauthorized, 401],
  ])('surfaces the %s status as a number', (_label, capture, expected) => {
    const onClose = jest.fn();
    const {xhr} = open({onClose});

    xhr.respondFailure(capture.status, capture.body);

    const error: RouterStreamError = onClose.mock.calls[0][0];
    expect(error.status).toBe(expected);
    expect(typeof error.status).toBe('number');
  });

  // A 500 or 400 is what separates a status-carrying implementation from one
  // matching English text: the captured 401 message contains no number, so a
  // regex over it lands on the right answer for the wrong reason.
  it.each([500, 400])('surfaces a %i as a number too', status => {
    const onClose = jest.fn();
    const {xhr} = open({onClose});

    xhr.respondFailure(status, '');

    expect(onClose.mock.calls[0][0].status).toBe(status);
  });

  it.each([
    ['shifted path', shiftedControl],
    ['authorized', authorizedControl],
  ])('reports the %s control as open with no error', (_label, capture) => {
    // Each control is the same server answering 200 where its sibling capture
    // answered 404 or 401, so those two are about the route and the key rather
    // than about a stream this build cannot serve.
    expect(capture.headers['content-type']).toBe('text/event-stream');

    const onOpen = jest.fn();
    const onClose = jest.fn();
    const {xhr} = open({onOpen, onClose});

    xhr.respondHead(capture.status);

    expect(onOpen).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes once the byte budget is reached', () => {
    const onClose = jest.fn();
    const handle = openRouterEventStream(
      'http://desktop:8080',
      undefined,
      {onClose},
      {maxBytes: 64},
    );
    const xhr = MockXHR.instances[0];

    xhr.respondHead(200);
    xhr.pushChunk(routerWireText('sse-load-sequence.txt'));

    expect(onClose).toHaveBeenCalledWith(undefined);
    expect(xhr.aborted).toBe(true);
    handle.close();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
