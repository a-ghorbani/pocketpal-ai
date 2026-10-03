import {isSecretPlaceholder, secretPlaceholderName} from './validator';
import type {CustomToolDefinition, HttpMethod, JsonValue} from './types';

const PLACEHOLDER_PATTERN = /\{\{([^{}]*)\}\}/g;
const WHOLE_PLACEHOLDER_PATTERN = /^\{\{([^{}]+)\}\}$/;
const METHODS_ALLOWING_BODY = new Set<HttpMethod>([
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
]);

export type BuildFailure =
  | {code: 'invalid_url'}
  | {code: 'missing_required'; name: string}
  | {code: 'wrong_type'; name: string; expected: string}
  | {code: 'path_traversal'; name: string}
  | {code: 'header_newline'; header: string}
  | {code: 'secret_unset'; name: string}
  | {code: 'secret_misplaced'; name: string};

export interface BuiltRequest {
  url: string;
  method: HttpMethod;
  headers: Record<string, string>;
  body?: string;
}

export type BuildResult =
  | {ok: true; request: BuiltRequest}
  | {ok: false; failure: BuildFailure};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

function typeMatches(expected: string, value: unknown): boolean {
  switch (expected) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    default:
      return true;
  }
}

/**
 * Build the outbound request. Pure in `(def, args, secrets)`: secrets are read
 * per call by the engine and passed in, never cached here. Encoding is decided
 * by position — path segments and query values are encoded, header values are
 * raw, and body placeholders substitute whole JSON values.
 */
export function buildRequest(
  def: CustomToolDefinition,
  args: Record<string, unknown>,
  secrets: Record<string, string>,
): BuildResult {
  const failures: BuildFailure[] = [];
  const required = new Set(def.parameters.required ?? []);

  for (const name of required) {
    if (args[name] === undefined) {
      failures.push({code: 'missing_required', name});
    }
  }
  for (const [name, schema] of Object.entries(def.parameters.properties)) {
    const value = args[name];
    if (value === undefined) {
      continue;
    }
    const expected = (schema as {type?: unknown})?.type;
    if (typeof expected === 'string' && !typeMatches(expected, value)) {
      failures.push({code: 'wrong_type', name, expected});
    }
  }
  if (failures.length > 0) {
    return {ok: false, failure: failures[0]};
  }

  /** Raw substitution; `allowSecret` gates where a credential may appear. */
  const substitute = (template: string, allowSecret: boolean): string =>
    template.replace(PLACEHOLDER_PATTERN, (_match, rawName: string) => {
      const name = rawName.trim();
      if (isSecretPlaceholder(name)) {
        const secret = secretPlaceholderName(name);
        if (!allowSecret) {
          failures.push({code: 'secret_misplaced', name: secret});
          return '';
        }
        const value = secrets[secret];
        if (value === undefined || value === '') {
          failures.push({code: 'secret_unset', name: secret});
          return '';
        }
        return value;
      }
      const value = args[name];
      return value === undefined || value === null ? '' : String(value);
    });

  const scheme = /^https?:\/\//i.exec(def.request.url);
  if (!scheme) {
    return {ok: false, failure: {code: 'invalid_url'}};
  }
  const afterScheme = def.request.url.slice(scheme[0].length);
  const pathStart = afterScheme.search(/[/?#]/);
  const origin =
    scheme[0] +
    (pathStart === -1 ? afterScheme : afterScheme.slice(0, pathStart));
  const pathTemplate = pathStart === -1 ? '' : afterScheme.slice(pathStart);

  const path = pathTemplate.replace(
    PLACEHOLDER_PATTERN,
    (_match, rawName: string) => {
      const name = rawName.trim();
      if (isSecretPlaceholder(name)) {
        failures.push({
          code: 'secret_misplaced',
          name: secretPlaceholderName(name),
        });
        return '';
      }
      const value = args[name];
      const asString =
        value === undefined || value === null ? '' : String(value);
      if (asString === '.' || asString === '..') {
        failures.push({code: 'path_traversal', name});
        return '';
      }
      return encodeURIComponent(asString);
    },
  );

  const queryParts: string[] = [];
  for (const [key, template] of Object.entries(def.request.query ?? {})) {
    const whole = WHOLE_PLACEHOLDER_PATTERN.exec(template.trim());
    if (whole) {
      const name = whole[1].trim();
      if (
        !isSecretPlaceholder(name) &&
        args[name] === undefined &&
        !required.has(name)
      ) {
        continue;
      }
    }
    const value = substitute(template, true);
    queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  }

  const headers: Record<string, string> = {};
  for (const [name, template] of Object.entries(def.request.headers ?? {})) {
    const isAuthorization = name.toLowerCase() === 'authorization';
    const value = substitute(template, isAuthorization);
    if (/[\r\n]/.test(value)) {
      failures.push({code: 'header_newline', header: name});
      continue;
    }
    headers[name] = value;
  }

  let body: string | undefined;
  if (
    def.request.body !== undefined &&
    METHODS_ALLOWING_BODY.has(def.request.method)
  ) {
    const substituteBody = (
      value: JsonValue,
    ): {drop: true} | {value: JsonValue} => {
      if (typeof value === 'string') {
        const whole = WHOLE_PLACEHOLDER_PATTERN.exec(value.trim());
        if (!whole) {
          return {value};
        }
        const name = whole[1].trim();
        if (isSecretPlaceholder(name)) {
          failures.push({
            code: 'secret_misplaced',
            name: secretPlaceholderName(name),
          });
          return {drop: true};
        }
        const argValue = args[name];
        return argValue === undefined
          ? {drop: true}
          : {value: argValue as JsonValue};
      }
      if (Array.isArray(value)) {
        const items: JsonValue[] = [];
        for (const item of value) {
          const next = substituteBody(item);
          if (!('drop' in next)) {
            items.push(next.value);
          }
        }
        return {value: items};
      }
      if (isPlainObject(value)) {
        const out: Record<string, JsonValue> = {};
        for (const [key, item] of Object.entries(value)) {
          const next = substituteBody(item as JsonValue);
          if (!('drop' in next)) {
            out[key] = next.value;
          }
        }
        return {value: out};
      }
      return {value};
    };

    const built = substituteBody(def.request.body);
    body = JSON.stringify('drop' in built ? null : built.value);
    if (
      !Object.keys(headers).some(name => name.toLowerCase() === 'content-type')
    ) {
      headers['Content-Type'] = 'application/json';
    }
  }

  if (failures.length > 0) {
    return {ok: false, failure: failures[0]};
  }

  const query = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  return {
    ok: true,
    request: {
      url: `${origin}${path}${query}`,
      method: def.request.method,
      headers,
      ...(body === undefined ? {} : {body}),
    },
  };
}
