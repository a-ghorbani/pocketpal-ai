import {buildRequest} from '../requestBuilder';
import type {CustomToolDefinition} from '../types';

const weatherTool = (
  overrides: Partial<CustomToolDefinition> = {},
): CustomToolDefinition => ({
  id: 'tool-1',
  name: 'get_weather',
  description: 'Get weather for a city',
  parameters: {
    type: 'object',
    properties: {city: {type: 'string'}},
    required: ['city'],
  },
  request: {
    method: 'GET',
    url: 'https://api.example.com/weather',
    query: {city: '{{city}}'},
    headers: {Authorization: 'Bearer {{secret.API_KEY}}'},
  },
  timeoutMs: 15000,
  requiresConfirmation: true,
  ...overrides,
});

const notesTool = (): CustomToolDefinition => ({
  id: 'tool-2',
  name: 'add_note',
  description: 'Add a note',
  parameters: {
    type: 'object',
    properties: {
      id: {type: 'string'},
      text: {type: 'string'},
      pin: {type: 'boolean'},
    },
    required: ['id'],
  },
  request: {
    method: 'POST',
    url: 'http://127.0.0.1:8765/notes/{{id}}',
    body: {text: '{{text}}', pin: '{{pin}}'},
  },
  timeoutMs: 15000,
  requiresConfirmation: true,
});

const built = (result: ReturnType<typeof buildRequest>) => {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error('expected a built request');
  }
  return result.request;
};

const failure = (result: ReturnType<typeof buildRequest>) => {
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error('expected a failure');
  }
  return result.failure;
};

describe('buildRequest', () => {
  it('encodes a query value and puts the secret only in Authorization', () => {
    const request = built(
      buildRequest(weatherTool(), {city: 'São Paulo'}, {API_KEY: 'k-123'}),
    );

    expect(request.method).toBe('GET');
    expect(request.url).toBe(
      'https://api.example.com/weather?city=S%C3%A3o%20Paulo',
    );
    expect(request.headers.Authorization).toBe('Bearer k-123');
    expect(request.body).toBeUndefined();
  });

  it('never places a secret outside the query string and Authorization', () => {
    const request = built(
      buildRequest(weatherTool(), {city: 'Paris'}, {API_KEY: 'k-123'}),
    );

    const [, queryString = ''] = request.url.split('?');
    expect(request.url.split('?')[0]).not.toContain('k-123');
    expect(queryString).not.toContain('k-123');
    for (const [name, value] of Object.entries(request.headers)) {
      if (name.toLowerCase() !== 'authorization') {
        expect(value).not.toContain('k-123');
      }
    }
  });

  it('encodes a path segment and substitutes body placeholders as JSON values', () => {
    const request = built(
      buildRequest(notesTool(), {id: 'a/b', text: 'hi "x"', pin: true}, {}),
    );

    expect(request.url).toBe('http://127.0.0.1:8765/notes/a%2Fb');
    expect(JSON.parse(request.body!)).toEqual({text: 'hi "x"', pin: true});
    expect(request.headers['Content-Type']).toBe('application/json');
  });

  it('refuses a dot or dot-dot path segment, sending nothing', () => {
    expect(failure(buildRequest(notesTool(), {id: '..'}, {}))).toEqual({
      code: 'path_traversal',
      name: 'id',
    });
    expect(failure(buildRequest(notesTool(), {id: '.'}, {}))).toEqual({
      code: 'path_traversal',
      name: 'id',
    });
  });

  it('drops an absent optional whole-value query entry', () => {
    const tool = weatherTool({
      parameters: {
        type: 'object',
        properties: {city: {type: 'string'}, units: {type: 'string'}},
        required: ['city'],
      },
      request: {
        method: 'GET',
        url: 'https://api.example.com/weather',
        query: {city: '{{city}}', units: '{{units}}'},
      },
    });

    const request = built(buildRequest(tool, {city: 'Paris'}, {}));
    expect(request.url).toBe('https://api.example.com/weather?city=Paris');
  });

  it('drops an absent optional body key but keeps supplied ones', () => {
    const request = built(
      buildRequest(notesTool(), {id: 'n1', pin: false}, {}),
    );
    expect(JSON.parse(request.body!)).toEqual({pin: false});
  });

  it('refuses a missing required argument and a wrong primitive type', () => {
    expect(failure(buildRequest(weatherTool(), {}, {API_KEY: 'k'}))).toEqual({
      code: 'missing_required',
      name: 'city',
    });
    expect(
      failure(buildRequest(weatherTool(), {city: 42}, {API_KEY: 'k'})),
    ).toEqual({code: 'wrong_type', name: 'city', expected: 'string'});
  });

  it('refuses an unset secret rather than sending an empty credential', () => {
    expect(failure(buildRequest(weatherTool(), {city: 'Paris'}, {}))).toEqual({
      code: 'secret_unset',
      name: 'API_KEY',
    });
  });

  it('refuses a header value that resolves to one carrying CR or LF', () => {
    const tool = weatherTool({
      request: {
        method: 'GET',
        url: 'https://api.example.com/weather',
        headers: {'X-Note': '{{city}}'},
      },
    });
    expect(failure(buildRequest(tool, {city: 'a\r\nInjected: 1'}, {}))).toEqual(
      {code: 'header_newline', header: 'X-Note'},
    );
  });

  it('refuses a secret placeholder outside query and Authorization', () => {
    const tool = weatherTool({
      request: {
        method: 'GET',
        url: 'https://api.example.com/weather',
        headers: {'X-API-Key': '{{secret.K}}'},
      },
    });
    expect(failure(buildRequest(tool, {city: 'Paris'}, {K: 'k-123'}))).toEqual({
      code: 'secret_misplaced',
      name: 'K',
    });
  });

  it('allows a secret in a query value', () => {
    const tool = weatherTool({
      request: {
        method: 'GET',
        url: 'https://api.example.com/weather',
        query: {key: '{{secret.API_KEY}}'},
      },
    });
    const request = built(
      buildRequest(tool, {city: 'Paris'}, {API_KEY: 'k/1'}),
    );
    expect(request.url).toBe('https://api.example.com/weather?key=k%2F1');
    expect(request.headers).toEqual({});
  });

  it('omits a body on GET even when the definition carries one', () => {
    const tool = weatherTool({
      request: {
        method: 'GET',
        url: 'https://api.example.com/weather',
        body: {a: 'b'},
      },
    });
    expect(built(buildRequest(tool, {city: 'Paris'}, {})).body).toBeUndefined();
  });
});
