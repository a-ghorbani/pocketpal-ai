import {CUSTOM_TOOL_ERROR_CODES} from '../types';
import type {CustomToolErrorCode} from '../types';
import {validateDefinition} from '../validator';

/** The example from the approved request; the canonical accepted shape. */
const weatherExample = {
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
  response: {
    extract: '$.current',
    template: 'Temperature: {{temperature}}, condition: {{condition}}',
  },
};

const codesOf = (result: ReturnType<typeof validateDefinition>) =>
  result.ok ? [] : result.issues.map(issue => issue.code);

describe('validateDefinition', () => {
  it('accepts the documented example and applies the defaults', () => {
    const result = validateDefinition(weatherExample);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.timeoutMs).toBe(15000);
    expect(result.value.requiresConfirmation).toBe(true);
    expect(result.value.response?.extract).toBe('$.current');
  });

  it('does not treat response-template keys as request arguments', () => {
    const result = validateDefinition(weatherExample);
    expect(codesOf(result)).not.toContain('placeholder_undeclared');
  });

  it('clamps timeoutMs into the supported range', () => {
    const low = validateDefinition({...weatherExample, timeoutMs: 5});
    const high = validateDefinition({...weatherExample, timeoutMs: 999999});
    expect(low.ok && low.value.timeoutMs).toBe(1000);
    expect(high.ok && high.value.timeoutMs).toBe(120000);
  });

  it('refuses a secret in any header other than Authorization', () => {
    const result = validateDefinition({
      ...weatherExample,
      request: {
        ...weatherExample.request,
        headers: {'X-API-Key': '{{secret.K}}'},
      },
    });
    expect(codesOf(result)).toContain('secret_placement');
  });

  it('allows a secret in a query value and in Authorization', () => {
    const result = validateDefinition({
      ...weatherExample,
      request: {
        ...weatherExample.request,
        query: {city: '{{city}}', key: '{{secret.K}}'},
        headers: {authorization: 'Bearer {{secret.API_KEY}}'},
      },
    });
    expect(result.ok).toBe(true);
  });

  it('refuses a secret in the body', () => {
    const result = validateDefinition({
      ...weatherExample,
      request: {
        method: 'POST',
        url: 'https://api.example.com/weather',
        body: {key: '{{secret.K}}'},
      },
    });
    expect(codesOf(result)).toContain('secret_placement');
  });

  it('refuses a placeholder anywhere before the path', () => {
    const result = validateDefinition({
      ...weatherExample,
      request: {...weatherExample.request, url: 'https://{{host}}/weather'},
    });
    expect(codesOf(result)).toContain('url_placeholder_in_origin');
  });

  it('refuses userinfo and non-http schemes', () => {
    expect(
      codesOf(
        validateDefinition({
          ...weatherExample,
          request: {...weatherExample.request, url: 'https://u:p@api.x/we'},
        }),
      ),
    ).toContain('url_userinfo');
    expect(
      codesOf(
        validateDefinition({
          ...weatherExample,
          request: {...weatherExample.request, url: 'file:///etc/passwd'},
        }),
      ),
    ).toContain('url_scheme');
  });

  it('refuses a body placeholder surrounded by text', () => {
    const result = validateDefinition({
      ...weatherExample,
      request: {
        method: 'POST',
        url: 'http://127.0.0.1:8765/notes',
        body: {text: 'hello {{city}}'},
      },
    });
    expect(codesOf(result)).toContain('body_placeholder_mixed');
  });

  it('accepts a body placeholder that is the whole value', () => {
    const result = validateDefinition({
      ...weatherExample,
      request: {
        method: 'POST',
        url: 'http://127.0.0.1:8765/notes',
        body: {text: '{{city}}'},
      },
    });
    expect(result.ok).toBe(true);
  });

  it('refuses a body on GET', () => {
    const result = validateDefinition({
      ...weatherExample,
      request: {...weatherExample.request, body: {a: 'b'}},
    });
    expect(codesOf(result)).toContain('body_not_allowed');
  });

  it('refuses a built-in name and a peer name', () => {
    expect(
      codesOf(validateDefinition({...weatherExample, name: 'calculate'})),
    ).toContain('name_builtin');
    expect(
      codesOf(validateDefinition(weatherExample, {peerNames: ['get_weather']})),
    ).toContain('name_taken');
  });

  it('refuses a name outside the supported pattern', () => {
    expect(
      codesOf(validateDefinition({...weatherExample, name: 'bad name!'})),
    ).toContain('name_invalid');
  });

  it('refuses an undeclared argument and an undeclared required entry', () => {
    expect(
      codesOf(
        validateDefinition({
          ...weatherExample,
          request: {...weatherExample.request, query: {q: '{{missing}}'}},
        }),
      ),
    ).toContain('placeholder_undeclared');
    expect(
      codesOf(
        validateDefinition({
          ...weatherExample,
          parameters: {
            type: 'object',
            properties: {city: {type: 'string'}},
            required: ['city', 'nope'],
          },
        }),
      ),
    ).toContain('required_not_declared');
  });

  it('reports a shape failure as a code rather than throwing', () => {
    expect(codesOf(validateDefinition({name: 'x'}))).toEqual(['shape_invalid']);
    expect(codesOf(validateDefinition(null))).toEqual(['shape_invalid']);
  });

  it('only ever reports codes declared in CUSTOM_TOOL_ERROR_CODES', () => {
    const known = new Set<CustomToolErrorCode>(CUSTOM_TOOL_ERROR_CODES);
    const result = validateDefinition({
      ...weatherExample,
      name: 'calculate',
      request: {
        method: 'GET',
        url: 'ftp://{{host}}/x',
        headers: {'X-Key': '{{secret.K}}'},
        body: {a: 'mixed {{city}}'},
      },
    });
    const codes = codesOf(result);
    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) {
      expect(known.has(code)).toBe(true);
    }
  });

  it('never returns English prose in an issue', () => {
    const result = validateDefinition({...weatherExample, name: 'calculate'});
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    for (const issue of result.issues) {
      expect(issue.code).toMatch(/^[a-z_]+$/);
    }
  });
});
