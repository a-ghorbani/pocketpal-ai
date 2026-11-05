import {FakeSocket} from '../../../../__mocks__/external/react-native-tcp-socket';
import {ResponseChannel, serveChatCompletion} from '../chatCompletion';
import {
  ConnectionContext,
  constantTimeEquals,
  handleConnection,
  MAX_ADMITTED_REQUESTS,
  MAX_OPEN_CONNECTIONS,
  OpenConnection,
  READ_DEADLINE_MS,
} from '../connection';
import {MAX_HEAD_BYTES} from '../http';

jest.mock('buffer', () => jest.requireActual('buffer/'));
jest.mock('../chatCompletion', () => ({serveChatCompletion: jest.fn()}));

const serveChat = serveChatCompletion as jest.Mock;

const raw = ({
  method = 'POST',
  path = '/v1/chat/completions',
  headers = {host: '127.0.0.1:8080'},
  body = '{"messages":[{"role":"user","content":"hi"}]}',
}: {
  method?: string;
  path?: string;
  headers?: Record<string, string>;
  body?: string;
} = {}) => {
  const lines = Object.entries({
    ...headers,
    'content-length': String(Buffer.byteLength(body)),
  }).map(([name, value]) => `${name}: ${value}\r\n`);
  return `${method} ${path} HTTP/1.1\r\n${lines.join('')}\r\n${body}`;
};

const CHAT = raw();
const MODELS = raw({method: 'GET', path: '/v1/models', body: ''});

const flush = async () => {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
};

const contexts: ConnectionContext[] = [];

const makeContext = (apiKey?: string) => {
  let admitted = 0;
  const ctx: ConnectionContext & {admitted(): number} = {
    openConnections: new Set<OpenConnection>(),
    getApiKey: () => apiKey,
    getServedModelId: () => 'org/model.gguf',
    listenerStartedAt: 1700000000,
    admit: jest.fn(() => {
      if (admitted >= MAX_ADMITTED_REQUESTS) {
        return false;
      }
      admitted += 1;
      return true;
    }),
    release: jest.fn(() => {
      admitted -= 1;
    }),
    admitted: () => admitted,
  };
  contexts.push(ctx);
  return ctx;
};

const connect = (ctx: ConnectionContext) => {
  const socket = new FakeSocket();
  handleConnection(socket, ctx);
  return socket;
};

const send = async (request: string, ctx = makeContext()) => {
  const socket = connect(ctx);
  socket.receive(request);
  await flush();
  const text = socket.output;
  const json = text.includes('\r\n\r\n{')
    ? JSON.parse(text.slice(text.indexOf('\r\n\r\n') + 4))
    : undefined;
  return {text, status: Number(text.split(' ')[1]), json};
};

/** Chat requests held open until the test finishes them. */
const heldChat = () => {
  const channels: ResponseChannel[] = [];
  const finishers: (() => void)[] = [];
  serveChat.mockImplementation(
    (_body: unknown, channel: ResponseChannel) =>
      new Promise<void>(resolve => {
        channels.push(channel);
        finishers.push(resolve);
      }),
  );
  return {channels, finish: (i: number) => finishers[i]()};
};

beforeEach(() => {
  serveChat.mockReset();
  serveChat.mockImplementation(
    async (_body: unknown, channel: ResponseChannel) => {
      channel.write('served');
    },
  );
});

afterEach(() => {
  contexts.forEach(ctx => ctx.openConnections.forEach(c => c.destroy()));
  contexts.length = 0;
  jest.useRealTimers();
});

describe('handleConnection', () => {
  it('serves a chat request, then ends the socket after the last write', async () => {
    const ctx = makeContext();
    const socket = connect(ctx);
    socket.receive(CHAT);
    await flush();

    expect(serveChat).toHaveBeenCalledWith(
      {messages: [{role: 'user', content: 'hi'}]},
      expect.anything(),
    );
    expect(socket.output).toBe('served');
    expect(socket.ended).toBe(true);
    expect(ctx.openConnections.size).toBe(0);
    expect(ctx.admitted()).toBe(0);
  });

  it('does not end the socket before pending writes are flushed', async () => {
    const socket = new FakeSocket();
    const callbacks: (() => void)[] = [];
    socket.write = jest.fn((data: string, _enc, cb) => {
      socket.writes.push(data);
      callbacks.push(() => cb?.());
      return true;
    });
    handleConnection(socket, makeContext());
    socket.receive(CHAT);
    await flush();

    expect(socket.ended).toBe(false);
    callbacks.forEach(cb => cb());
    expect(socket.ended).toBe(true);
  });

  it('answers read errors without routing', async () => {
    const socket = connect(makeContext());
    socket.receive('POST / HTTP/1.1\r\nHost: localhost\r\n\r\n');
    await flush();

    expect(socket.output).toMatch(/^HTTP\/1\.1 411 /);
    expect(serveChat).not.toHaveBeenCalled();
    expect(socket.ended).toBe(true);
  });

  it('destroys connections over the cap without an answer', () => {
    const ctx = makeContext();
    const sockets = Array.from({length: MAX_OPEN_CONNECTIONS}, () =>
      connect(ctx),
    );
    const extra = connect(ctx);

    expect(extra.destroyed).toBe(true);
    expect(extra.writes).toEqual([]);
    expect(sockets.every(s => !s.destroyed)).toBe(true);
    expect(ctx.openConnections.size).toBe(MAX_OPEN_CONNECTIONS);
  });

  it('answers 408 when the request does not arrive in time', async () => {
    jest.useFakeTimers();
    const socket = connect(makeContext());
    socket.receive('POST / HTTP/1.1\r\n');
    jest.advanceTimersByTime(READ_DEADLINE_MS - 1);
    expect(socket.writes).toEqual([]);
    jest.advanceTimersByTime(1);
    await flush();

    expect(socket.output).toMatch(/^HTTP\/1\.1 408 /);
    expect(socket.ended).toBe(true);
  });

  it('clears the deadline once the request is read', async () => {
    jest.useFakeTimers();
    const held = heldChat();
    const socket = connect(makeContext());
    socket.receive(CHAT);
    await flush();
    jest.advanceTimersByTime(READ_DEADLINE_MS * 2);

    expect(socket.writes).toEqual([]);
    held.finish(0);
  });

  it('answers 503 server_busy to a third concurrent chat request', async () => {
    const held = heldChat();
    const ctx = makeContext();
    connect(ctx).receive(CHAT);
    connect(ctx).receive(CHAT);
    const third = connect(ctx);
    third.receive(CHAT);
    await flush();

    expect(third.output).toMatch(/^HTTP\/1\.1 503 /);
    expect(third.output).toContain('"code":"server_busy"');
    expect(serveChat).toHaveBeenCalledTimes(2);

    held.finish(0);
    held.finish(1);
    await flush();
    expect(ctx.admitted()).toBe(0);
  });

  it.each([
    ['closes', (socket: FakeSocket) => socket.peerClose()],
    [
      'errors',
      (socket: FakeSocket) => socket.emit('error', new Error('reset')),
    ],
  ])(
    'tells the handler once and releases once when the client %s',
    async (_, leave) => {
      const held = heldChat();
      const ctx = makeContext();
      const socket = connect(ctx);
      socket.receive(CHAT);
      await flush();
      const onClose = jest.fn();
      held.channels[0].onClose(onClose);
      leave(socket);
      leave(socket);

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(held.channels[0].closed).toBe(true);
      expect(ctx.openConnections.size).toBe(0);
      held.channels[0].write('ignored');
      expect(socket.writes).toEqual([]);

      held.finish(0);
      await flush();
      expect(ctx.release).toHaveBeenCalledTimes(1);
      expect(ctx.admitted()).toBe(0);
    },
  );

  it('closes at once when its open connection is destroyed', async () => {
    const held = heldChat();
    const ctx = makeContext();
    const socket = connect(ctx);
    socket.receive(CHAT);
    await flush();
    const onClose = jest.fn();
    held.channels[0].onClose(onClose);
    [...ctx.openConnections].forEach(c => c.destroy());

    expect(socket.destroyed).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(ctx.openConnections.size).toBe(0);
    held.finish(0);
  });

  it('ignores bytes after the request', async () => {
    const socket = connect(makeContext());
    socket.receive(CHAT);
    socket.receive(CHAT);
    await flush();
    expect(serveChat).toHaveBeenCalledTimes(1);
  });

  it('still answers a client that half-closes after sending', async () => {
    const held = heldChat();
    const socket = connect(makeContext());
    socket.receive(CHAT);
    socket.emit('end');
    await flush();

    expect(held.channels[0].closed).toBe(false);
    held.channels[0].write('late reply');
    held.finish(0);
    await flush();
    expect(socket.output).toBe('late reply');
    expect(socket.ended).toBe(true);
    expect(socket.destroyed).toBe(false);
  });

  it('frees the slot at once when a client half-closes before sending anything', async () => {
    jest.useFakeTimers();
    const ctx = makeContext();
    const silent = Array.from({length: MAX_OPEN_CONNECTIONS}, () =>
      connect(ctx),
    );
    silent.forEach(socket => socket.emit('end'));

    expect(silent.every(socket => socket.destroyed)).toBe(true);
    expect(silent.every(socket => socket.writes.length === 0)).toBe(true);
    expect(ctx.openConnections.size).toBe(0);

    const next = connect(ctx);
    next.receive(MODELS);
    await flush();
    expect(next.destroyed).toBe(false);
    expect(next.output).toMatch(/^HTTP\/1\.1 200 /);
  });

  it('closes the connection when a write hits a closed socket', async () => {
    const held = heldChat();
    const ctx = makeContext();
    const socket = connect(ctx);
    socket.receive(CHAT);
    await flush();
    const onClose = jest.fn();
    held.channels[0].onClose(onClose);
    socket.write = jest.fn(() => {
      throw new Error('Socket is closed.');
    });
    held.channels[0].write('x');

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(held.channels[0].closed).toBe(true);
    expect(ctx.openConnections.size).toBe(0);
    held.finish(0);
    await flush();
    expect(ctx.admitted()).toBe(0);
  });

  it('reads a refused upload to its end, then answers once, undecoded', async () => {
    const socket = connect(makeContext('secret'));
    socket.receive(
      'POST /v1/chat/completions HTTP/1.1\r\nHost: localhost\r\n' +
        'Authorization: Bearer wrong\r\nContent-Length: 900000\r\n\r\n',
    );
    const chunk = new Uint8Array(100000).fill(0xff);
    for (let i = 0; i < 8; i++) {
      socket.receive(chunk);
    }
    socket.receive(chunk.subarray(0, 99999));
    await flush();
    expect(socket.writes).toEqual([]);

    socket.receive(new Uint8Array([0xff]));
    await flush();
    expect(socket.output.match(/HTTP\/1\.1 \d{3}/g)).toEqual(['HTTP/1.1 401']);
    expect(socket.ended).toBe(true);
    expect(serveChat).not.toHaveBeenCalled();
  });

  it('ends the socket even when the handler throws', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    serveChat.mockRejectedValue(new Error('boom'));
    const ctx = makeContext();
    const socket = connect(ctx);
    socket.receive(CHAT);
    await flush();
    await flush();

    expect(socket.ended).toBe(true);
    expect(ctx.admitted()).toBe(0);
    warn.mockRestore();
  });
});

describe('routing', () => {
  describe('without an API key', () => {
    it.each([
      ['POST', '/v1/chat/completions', 'https://evil.example'],
      ['GET', '/v1/models', 'https://evil.example'],
      ['OPTIONS', '/v1/chat/completions', 'https://evil.example'],
      ['POST', '/v1/chat/completions', 'null'],
    ])('refuses %s %s with Origin %s', async (method, path, origin) => {
      const {status, json, text} = await send(
        raw({
          method,
          path,
          headers: {host: '127.0.0.1', origin, 'content-type': 'text/plain'},
        }),
      );
      expect(status).toBe(403);
      expect(json.error).toEqual({
        message: 'Browser requests need an API key',
        type: 'invalid_request_error',
        code: 'forbidden_origin',
      });
      expect(text).not.toContain('Access-Control-');
      expect(serveChat).not.toHaveBeenCalled();
    });

    it.each(['phone.local:8080', 'pocketpal.lan', undefined])(
      'serves Host %s',
      async host => {
        const {status} = await send(
          raw({
            method: 'GET',
            path: '/v1/models',
            body: '',
            headers: host ? {host} : {},
          }),
        );
        expect(status).toBe(200);
      },
    );

    it('answers OPTIONS by its route, with no CORS headers', async () => {
      const {status, text} = await send(raw({method: 'OPTIONS'}));
      expect(status).toBe(405);
      expect(text).toContain('Allow: POST\r\n');
      expect(text).not.toContain('Access-Control-');
    });
  });

  describe('with an API key', () => {
    const keyed = () => makeContext('secret');

    it.each([undefined, 'Bearer wrong', 'Bearer secre', 'Basic secret'])(
      'rejects Authorization %s with 401',
      async authorization => {
        const headers: Record<string, string> = {host: 'localhost'};
        if (authorization) {
          headers.authorization = authorization;
        }
        const {status, json} = await send(raw({headers}), keyed());
        expect(status).toBe(401);
        expect(json.error).toEqual({
          message: 'Missing or wrong API key',
          type: 'authentication_error',
          code: 'invalid_api_key',
        });
        expect(serveChat).not.toHaveBeenCalled();
      },
    );

    it('serves the right Bearer key', async () => {
      await send(
        raw({headers: {host: 'localhost', authorization: 'Bearer secret'}}),
        keyed(),
      );
      expect(serveChat).toHaveBeenCalled();
    });

    it('serves a browser request that has the key, without CORS', async () => {
      const {status, text} = await send(
        raw({
          method: 'GET',
          path: '/v1/models',
          body: '',
          headers: {
            host: 'localhost',
            origin: 'https://app.example',
            authorization: 'Bearer secret',
          },
        }),
        keyed(),
      );
      expect(status).toBe(200);
      expect(text).not.toContain('Access-Control-');
    });

    it('answers a browser preflight without the key with 401, no CORS', async () => {
      const {status, text} = await send(
        raw({
          method: 'OPTIONS',
          body: '',
          headers: {
            host: 'localhost',
            origin: 'https://app.example',
            'access-control-request-method': 'POST',
          },
        }),
        keyed(),
      );
      expect(status).toBe(401);
      expect(text).not.toContain('Access-Control-');
    });

    it('guards /v1/models too', async () => {
      const {status} = await send(MODELS, keyed());
      expect(status).toBe(401);
    });

    it('serves a key with an inner space', async () => {
      const {status} = await send(
        raw({
          method: 'GET',
          path: '/v1/models',
          body: '',
          headers: {host: 'localhost', authorization: 'Bearer my secret'},
        }),
        makeContext('my secret'),
      );
      expect(status).toBe(200);
    });

    it('refuses a backtracking-bait Authorization header in under 50 ms', async () => {
      const bait = raw({
        method: 'GET',
        path: '/v1/models',
        body: '',
        headers: {
          host: 'localhost',
          authorization: `Bearer${' '.repeat(16_000)}a\nb`,
        },
      });
      expect(Buffer.byteLength(bait)).toBeLessThanOrEqual(MAX_HEAD_BYTES);
      const elapsed: number[] = [];
      for (let i = 0; i < 3; i++) {
        const socket = connect(keyed());
        const start = Date.now();
        socket.receive(bait);
        elapsed.push(Date.now() - start);
        await flush();
        expect(socket.output).toMatch(/^HTTP\/1\.1 401 /);
        expect(socket.output).toContain('"code":"invalid_api_key"');
      }
      expect(Math.min(...elapsed)).toBeLessThan(50);
    });
  });

  it('answers 400 bad_request for an authorized body that is not UTF-8', async () => {
    const head =
      'POST /v1/chat/completions HTTP/1.1\r\nAuthorization: Bearer secret\r\n' +
      'Content-Length: 2\r\n\r\n';
    const socket = connect(makeContext('secret'));
    socket.receive(head);
    socket.receive(new Uint8Array([0xc3, 0x28]));
    await flush();

    expect(socket.output).toMatch(/^HTTP\/1\.1 400 /);
    expect(
      JSON.parse(socket.output.slice(socket.output.indexOf('\r\n\r\n') + 4)),
    ).toEqual({
      error: {
        message: 'Malformed request',
        type: 'invalid_request_error',
        code: 'bad_request',
      },
    });
    expect(serveChat).not.toHaveBeenCalled();
  });

  it('answers 400 for a body that is not JSON', async () => {
    const {status, json} = await send(raw({body: '{oops'}));
    expect(status).toBe(400);
    expect(json.error.code).toBe('invalid_json');
    expect(serveChat).not.toHaveBeenCalled();
  });

  it.each([
    [
      'auth before route',
      raw({path: '/nope', headers: {host: 'localhost'}}),
      'secret',
      'invalid_api_key',
    ],
    [
      'route before method',
      raw({method: 'PUT', path: '/nope'}),
      undefined,
      'not_found',
    ],
    [
      'method before the body',
      raw({method: 'GET', body: '{oops'}),
      undefined,
      'method_not_allowed',
    ],
  ])('checks %s', async (_name, request, key, expected) => {
    const {json} = await send(request, makeContext(key));
    expect(json.error.code).toBe(expected);
  });

  it('lists the served model', async () => {
    const {status, json} = await send(MODELS);
    expect(status).toBe(200);
    expect(json).toEqual({
      object: 'list',
      data: [
        {
          id: 'org/model.gguf',
          object: 'model',
          created: 1700000000,
          owned_by: 'pocketpal',
        },
      ],
    });
  });

  it('lists no model when none is served', async () => {
    const ctx = makeContext();
    ctx.getServedModelId = () => undefined;
    const {json} = await send(MODELS, ctx);
    expect(json).toEqual({object: 'list', data: []});
  });
});

describe('constantTimeEquals', () => {
  it.each([
    ['abc', 'abc', true],
    ['abc', 'abd', false],
    ['abc', 'ab', false],
    ['ab', 'abc', false],
    ['abc\0', 'abc', false],
    ['', '', true],
  ])('%j vs %j → %s', (a, b, expected) => {
    expect(constantTimeEquals(a, b)).toBe(expected);
  });
});
