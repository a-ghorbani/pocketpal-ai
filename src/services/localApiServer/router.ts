import {
  HttpRequest,
  RequestHead,
  ResponseSink,
  writeJson,
  writePreflight,
} from './http';
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

const HOST_PATTERN =
  /^(localhost|\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:.]+\])(:\d{1,5})?$/i;

export function isAllowedHost(host: string | undefined): boolean {
  return host !== undefined && HOST_PATTERN.test(host);
}

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

export type HeadDeps = Omit<RouterDeps, 'handleChat'>;

function writeModels(sink: ResponseSink, deps: HeadDeps) {
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
 * Runs every guard that needs only the head, and answers the routes that need
 * no body. True when it wrote the answer; the body is then never read.
 */
export function answerHead(
  head: RequestHead,
  sink: ResponseSink,
  deps: HeadDeps,
): boolean {
  const apiKey = deps.getApiKey();
  if (apiKey === undefined && head.headers.origin !== undefined) {
    writeError(
      sink,
      403,
      'Browser requests need an API key',
      'invalid_request_error',
      'forbidden_origin',
    );
    return true;
  }
  if (head.method === 'OPTIONS') {
    writePreflight(sink);
    return true;
  }
  if (!isAllowedHost(head.headers.host)) {
    writeError(
      sink,
      403,
      'Host must be an IP address or localhost',
      'invalid_request_error',
      'forbidden_host',
    );
    return true;
  }
  if (apiKey && !isAuthorized(head.headers.authorization, apiKey)) {
    writeError(
      sink,
      401,
      'Missing or wrong API key',
      'authentication_error',
      'invalid_api_key',
    );
    return true;
  }
  const allowedMethod = ROUTES[head.path];
  if (!allowedMethod) {
    writeError(sink, 404, 'Not found', 'invalid_request_error', 'not_found');
    return true;
  }
  if (head.method !== allowedMethod) {
    writeError(
      sink,
      405,
      'Method not allowed',
      'invalid_request_error',
      'method_not_allowed',
      {Allow: allowedMethod},
    );
    return true;
  }
  if (head.path === '/v1/models') {
    writeModels(sink, deps);
    return true;
  }
  return false;
}

/**
 * Serves a chat request whose head passed `answerHead`. A body that is not
 * JSON is answered here, so it never waits for the model.
 */
export async function routeBody(
  request: HttpRequest,
  sink: ResponseSink,
  deps: RouterDeps,
): Promise<void> {
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
