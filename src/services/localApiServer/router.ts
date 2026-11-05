import {HttpRequest, ResponseSink, writeJson} from './http';
import {errorBody} from './wire';

export interface RouterDeps {
  getApiKey(): string | undefined;
  getServedModelId(): string | undefined;
  /** Unix seconds. */
  listenerStartedAt: number;
  handleChat(body: unknown, sink: ResponseSink): Promise<void>;
}

const ROUTES: Record<string, string> = {
  '/v1/models': 'GET',
  '/v1/chat/completions': 'POST',
};

/** Walks the longer string whatever the inputs, so timing reveals no prefix. */
export function constantTimeEquals(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  const left = a.padEnd(length, '\0');
  const right = b.padEnd(length, '\0');
  let difference = a.length === b.length ? 0 : 1;
  for (let i = 0; i < length; i++) {
    difference += Math.abs(left.charCodeAt(i) - right.charCodeAt(i));
  }
  return difference === 0;
}

function isAuthorized(header: string | undefined, apiKey: string): boolean {
  const match = /^Bearer\s+(.+)$/i.exec(header ?? '');
  return constantTimeEquals(match?.[1] ?? '', apiKey);
}

function writeError(
  sink: ResponseSink,
  status: number,
  message: string,
  type: string,
  code: string,
  headers?: Record<string, string>,
) {
  writeJson(sink, status, errorBody({message, type, code}), headers);
}

function writeModels(sink: ResponseSink, deps: RouterDeps) {
  const id = deps.getServedModelId();
  writeJson(sink, 200, {
    object: 'list',
    data: id
      ? [
          {
            id,
            object: 'model',
            created: deps.listenerStartedAt,
            owned_by: 'pocketpal',
          },
        ]
      : [],
  });
}

/**
 * Answers one fully read request: Origin, auth, route and method first, then
 * the models list, or the JSON body handed to `handleChat`.
 */
export async function routeRequest(
  request: HttpRequest,
  sink: ResponseSink,
  deps: RouterDeps,
): Promise<void> {
  const apiKey = deps.getApiKey();
  if (apiKey === undefined && request.headers.origin !== undefined) {
    writeError(
      sink,
      403,
      'Browser requests need an API key',
      'invalid_request_error',
      'forbidden_origin',
    );
    return;
  }
  if (apiKey && !isAuthorized(request.headers.authorization, apiKey)) {
    writeError(
      sink,
      401,
      'Missing or wrong API key',
      'authentication_error',
      'invalid_api_key',
    );
    return;
  }
  const allowedMethod = ROUTES[request.path];
  if (!allowedMethod) {
    writeError(sink, 404, 'Not found', 'invalid_request_error', 'not_found');
    return;
  }
  if (request.method !== allowedMethod) {
    writeError(
      sink,
      405,
      'Method not allowed',
      'invalid_request_error',
      'method_not_allowed',
      {Allow: allowedMethod},
    );
    return;
  }
  if (request.path === '/v1/models') {
    writeModels(sink, deps);
    return;
  }
  let body: unknown;
  try {
    body = JSON.parse(request.body);
  } catch {
    writeError(
      sink,
      400,
      'Request body is not valid JSON',
      'invalid_request_error',
      'invalid_json',
    );
    return;
  }
  await deps.handleChat(body, sink);
}
