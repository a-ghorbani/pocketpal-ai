import type {HttpRequest, ResponseSink} from '../http';
import {
  constantTimeEquals,
  isAllowedHost,
  routeRequest,
  RouterDeps,
} from '../router';

const request = (overrides: Partial<HttpRequest> = {}): HttpRequest => ({
  method: 'POST',
  path: '/v1/chat/completions',
  headers: {host: '127.0.0.1:8080'},
  body: '{"messages":[{"role":"user","content":"hi"}]}',
  ...overrides,
});

const route = async (
  req: HttpRequest,
  depsOverrides: Partial<RouterDeps> = {},
) => {
  const writes: string[] = [];
  const deps: RouterDeps = {
    getApiKey: () => undefined,
    getServedModelId: () => 'org/model.gguf',
    listenerStartedAt: 1700000000,
    handleChat: jest.fn(async () => {}),
    ...depsOverrides,
  };
  const sink: ResponseSink = {
    cors: deps.getApiKey() !== undefined,
    write: d => writes.push(d),
    end: jest.fn(),
  };
  await routeRequest(req, sink, deps);
  const text = writes.join('');
  const status = Number(text.split(' ')[1]);
  const json = text.includes('\r\n\r\n{')
    ? JSON.parse(text.slice(text.indexOf('\r\n\r\n') + 4))
    : undefined;
  return {deps, text, status, json};
};

describe('routeRequest', () => {
  it('dispatches a valid chat request with its parsed body', async () => {
    const {deps, text} = await route(request());
    expect(deps.handleChat).toHaveBeenCalledWith(
      {messages: [{role: 'user', content: 'hi'}]},
      expect.anything(),
    );
    expect(text).toBe('');
  });

  it('answers a preflight without auth or Host checks', async () => {
    const {status, text, deps} = await route(
      request({method: 'OPTIONS', headers: {host: 'evil.example'}}),
      {getApiKey: () => 'secret'},
    );
    expect(status).toBe(204);
    expect(text).toContain('Access-Control-Allow-Methods');
    expect(deps.handleChat).not.toHaveBeenCalled();
  });

  describe('without an API key', () => {
    it.each([
      ['POST', '/v1/chat/completions', 'https://evil.example'],
      ['GET', '/v1/models', 'https://evil.example'],
      ['OPTIONS', '/v1/chat/completions', 'https://evil.example'],
      ['POST', '/v1/chat/completions', 'null'],
    ])('refuses %s %s with Origin %s', async (method, path, origin) => {
      const {status, json, text, deps} = await route(
        request({
          method,
          path,
          headers: {
            host: '127.0.0.1',
            origin,
            'content-type': 'text/plain',
          },
        }),
      );
      expect(status).toBe(403);
      expect(json.error).toEqual({
        message: 'Browser requests need an API key',
        type: 'invalid_request_error',
        code: 'forbidden_origin',
      });
      expect(text).not.toContain('Access-Control-');
      expect(deps.handleChat).not.toHaveBeenCalled();
    });

    it('serves a request without Origin and sends no CORS headers', async () => {
      const {status, text} = await route(
        request({method: 'GET', path: '/v1/models', body: ''}),
      );
      expect(status).toBe(200);
      expect(text).not.toContain('Access-Control-');
    });

    it('answers a preflight without Origin with no CORS headers', async () => {
      const {status, text} = await route(request({method: 'OPTIONS'}));
      expect(status).toBe(204);
      expect(text).not.toContain('Access-Control-');
    });
  });

  it.each(['evil.example', 'evil.example:8080', undefined])(
    'rejects Host %s with 403',
    async host => {
      const {status, json, deps} = await route(
        request({headers: host ? {host} : {}}),
      );
      expect(status).toBe(403);
      expect(json.error.code).toBe('forbidden_host');
      expect(deps.handleChat).not.toHaveBeenCalled();
    },
  );

  describe('with an API key', () => {
    const withKey = {getApiKey: () => 'secret'};

    it.each([undefined, 'Bearer wrong', 'Bearer secre', 'Basic secret'])(
      'rejects Authorization %s with 401',
      async authorization => {
        const headers: Record<string, string> = {host: 'localhost'};
        if (authorization) {
          headers.authorization = authorization;
        }
        const {status, json, deps} = await route(request({headers}), withKey);
        expect(status).toBe(401);
        expect(json.error).toEqual({
          message: 'Missing or wrong API key',
          type: 'authentication_error',
          code: 'invalid_api_key',
        });
        expect(deps.handleChat).not.toHaveBeenCalled();
      },
    );

    it('serves the right Bearer key', async () => {
      const {deps} = await route(
        request({
          headers: {host: 'localhost', authorization: 'Bearer secret'},
        }),
        withKey,
      );
      expect(deps.handleChat).toHaveBeenCalled();
    });

    it('answers a browser preflight with CORS headers', async () => {
      const {status, text} = await route(
        request({
          method: 'OPTIONS',
          headers: {host: 'localhost', origin: 'https://app.example'},
        }),
        withKey,
      );
      expect(status).toBe(204);
      expect(text).toContain('Access-Control-Allow-Origin: *\r\n');
      expect(text).toContain('Access-Control-Allow-Methods');
    });

    it('serves a browser request that has the key, with CORS', async () => {
      const {status, text} = await route(
        request({
          method: 'GET',
          path: '/v1/models',
          body: '',
          headers: {
            host: 'localhost',
            origin: 'https://app.example',
            authorization: 'Bearer secret',
          },
        }),
        withKey,
      );
      expect(status).toBe(200);
      expect(text).toContain('Access-Control-Allow-Origin: *\r\n');
    });

    it('guards /v1/models too', async () => {
      const {status} = await route(
        request({method: 'GET', path: '/v1/models'}),
        withKey,
      );
      expect(status).toBe(401);
    });
  });

  it('answers 404 for an unknown path', async () => {
    const {status, json} = await route(request({path: '/api/chat'}));
    expect(status).toBe(404);
    expect(json.error.code).toBe('not_found');
  });

  it('answers 405 with Allow for a wrong method', async () => {
    const {status, text} = await route(request({method: 'GET'}));
    expect(status).toBe(405);
    expect(text).toContain('Allow: POST\r\n');
  });

  it('answers 400 for a body that is not JSON', async () => {
    const {status, json, deps} = await route(request({body: '{oops'}));
    expect(status).toBe(400);
    expect(json.error.code).toBe('invalid_json');
    expect(deps.handleChat).not.toHaveBeenCalled();
  });

  it('lists the served model', async () => {
    const {status, json} = await route(
      request({method: 'GET', path: '/v1/models', body: ''}),
    );
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
    const {json} = await route(
      request({method: 'GET', path: '/v1/models', body: ''}),
      {getServedModelId: () => undefined},
    );
    expect(json).toEqual({object: 'list', data: []});
  });
});

describe('isAllowedHost', () => {
  it.each([
    'localhost',
    'LOCALHOST:8080',
    '127.0.0.1',
    '192.168.1.23:8080',
    '[::1]',
    '[fe80::1]:8080',
  ])('allows %s', host => expect(isAllowedHost(host)).toBe(true));

  it.each(['example.com', '127.0.0.1.nip.io', '::1', 'localhost.evil', ''])(
    'refuses %s',
    host => expect(isAllowedHost(host)).toBe(false),
  );
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
