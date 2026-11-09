import {ResponseChannel, serveChatCompletion} from './chatCompletion';
import {
  createRequestReader,
  decodeUtf8,
  HttpRequest,
  writeError,
  writeJson,
} from './http';

export const MAX_OPEN_CONNECTIONS = 8;
export const MAX_ADMITTED_REQUESTS = 2;
export const READ_DEADLINE_MS = 30_000;

export interface ConnectionSocket {
  on(event: 'data', listener: (data: Uint8Array) => void): unknown;
  on(event: 'close' | 'end' | 'error', listener: () => void): unknown;
  write(
    data: string,
    encoding: 'utf8',
    callback: (error?: Error) => void,
  ): unknown;
  end(): unknown;
  destroy(): unknown;
}

export interface OpenConnection {
  /** Closes the socket and treats the connection as closed at once. */
  destroy(): void;
}

export interface ConnectionContext {
  openConnections: Set<OpenConnection>;
  getApiKey(): string | undefined;
  getServedModelId(): string | undefined;
  /** Unix seconds. */
  listenerStartedAt: number;
  /** False when the chat requests in flight are at their cap. */
  admit(): boolean;
  release(): void;
}

const ROUTES: Record<string, string> = {
  '/v1/models': 'GET',
  '/v1/chat/completions': 'POST',
};

const READ_ERRORS: Record<number, string> = {
  400: 'Malformed request',
  408: 'Request not received in time',
  411: 'Content-Length is required',
  413: 'Request too large',
};

const readError = (status: number) => ({
  message: READ_ERRORS[status],
  type: 'invalid_request_error',
  code: 'bad_request',
});

const invalidRequest = (message: string, code: string) => ({
  message,
  type: 'invalid_request_error',
  code,
});

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
  const match = /^Bearer\s+(\S.*)$/i.exec(header ?? '');
  return constantTimeEquals(match?.[1] ?? '', apiKey);
}

function writeModels(channel: ResponseChannel, ctx: ConnectionContext) {
  const id = ctx.getServedModelId();
  writeJson(channel, 200, {
    object: 'list',
    data: id
      ? [
          {
            id,
            object: 'model',
            created: ctx.listenerStartedAt,
            owned_by: 'pocketpal',
          },
        ]
      : [],
  });
}

/** Origin, auth, route and method are all checked before the body is decoded. */
async function route(
  request: HttpRequest,
  channel: ResponseChannel,
  ctx: ConnectionContext,
): Promise<void> {
  const apiKey = ctx.getApiKey();
  if (apiKey === undefined && request.headers.origin !== undefined) {
    writeError(
      channel,
      403,
      invalidRequest('Browser requests need an API key', 'forbidden_origin'),
    );
    return;
  }
  if (apiKey && !isAuthorized(request.headers.authorization, apiKey)) {
    writeError(channel, 401, {
      message: 'Missing or wrong API key',
      type: 'authentication_error',
      code: 'invalid_api_key',
    });
    return;
  }
  const allowedMethod = ROUTES[request.path];
  if (!allowedMethod) {
    writeError(channel, 404, invalidRequest('Not found', 'not_found'));
    return;
  }
  if (request.method !== allowedMethod) {
    writeError(
      channel,
      405,
      invalidRequest('Method not allowed', 'method_not_allowed'),
      {Allow: allowedMethod},
    );
    return;
  }
  if (request.path === '/v1/models') {
    writeModels(channel, ctx);
    return;
  }
  const text = decodeUtf8(request.body);
  if (text === undefined) {
    writeError(channel, 400, readError(400));
    return;
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    writeError(
      channel,
      400,
      invalidRequest('Request body is not valid JSON', 'invalid_json'),
    );
    return;
  }
  if (!ctx.admit()) {
    writeError(channel, 503, {
      message: 'The server is busy with other requests',
      type: 'server_error',
      code: 'server_busy',
    });
    return;
  }
  try {
    await serveChatCompletion(body, channel);
  } finally {
    ctx.release();
  }
}

/** Serves the one request a connection carries, then closes it. */
export function handleConnection(
  socket: ConnectionSocket,
  ctx: ConnectionContext,
): void {
  if (ctx.openConnections.size >= MAX_OPEN_CONNECTIONS) {
    socket.destroy();
    return;
  }

  let closeListener: (() => void) | undefined;
  let closed = false;
  let settled = false;
  let receivedAny = false;
  let endRequested = false;
  let pendingWrites = 0;

  const onClosed = () => {
    if (closed) {
      return;
    }
    closed = true;
    clearTimeout(deadline);
    ctx.openConnections.delete(connection);
    const listener = closeListener;
    closeListener = undefined;
    listener?.();
  };

  const connection: OpenConnection = {
    destroy: () => {
      socket.destroy();
      onClosed();
    },
  };

  const endWhenFlushed = () => {
    if (!closed && endRequested && pendingWrites === 0) {
      socket.end();
    }
  };

  const channel: ResponseChannel = {
    get closed() {
      return closed;
    },
    write(data) {
      if (closed || endRequested) {
        return;
      }
      pendingWrites += 1;
      try {
        socket.write(data, 'utf8', () => {
          pendingWrites -= 1;
          endWhenFlushed();
        });
      } catch {
        connection.destroy();
      }
    },
    end() {
      endRequested = true;
      endWhenFlushed();
    },
    onClose(listener) {
      closeListener = listener;
      return () => {
        closeListener = undefined;
      };
    },
  };

  const reader = createRequestReader();

  const answerReadError = (status: number) => {
    settled = true;
    clearTimeout(deadline);
    writeError(channel, status, readError(status));
    channel.end();
  };

  const deadline = setTimeout(() => answerReadError(408), READ_DEADLINE_MS);
  ctx.openConnections.add(connection);

  socket.on('close', onClosed);
  socket.on('error', onClosed);
  socket.on('end', () => {
    if (!receivedAny) {
      connection.destroy();
    }
  });
  socket.on('data', data => {
    receivedAny = true;
    if (settled || closed) {
      return;
    }
    const result = reader.push(data);
    if (result.kind === 'pending') {
      return;
    }
    if (result.kind === 'error') {
      answerReadError(result.status);
      return;
    }
    settled = true;
    clearTimeout(deadline);
    route(result.request, channel, ctx)
      .catch(error => console.warn('[localApiServer] request failed:', error))
      .finally(() => channel.end());
  });
}
