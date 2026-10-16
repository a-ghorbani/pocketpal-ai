import type {ResponseChannel} from './chatCompletion';
import {createRequestReader, writeJson} from './http';
import {routeRequest, RouterDeps} from './router';
import {errorBody} from './wire';

export const MAX_OPEN_CONNECTIONS = 8;
export const MAX_ADMITTED_REQUESTS = 2;
export const READ_DEADLINE_MS = 30_000;

export interface ConnectionSocket {
  on(event: 'data', listener: (data: Uint8Array) => void): unknown;
  on(event: 'close' | 'error', listener: () => void): unknown;
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
  /** False when the chat requests in flight are at their cap. */
  admit(): boolean;
  release(): void;
  routerDeps: Omit<RouterDeps, 'handleChat'>;
  handleChat(body: unknown, channel: ResponseChannel): Promise<void>;
}

const READ_ERRORS: Record<number, string> = {
  400: 'Malformed request',
  408: 'Request not received in time',
  411: 'Content-Length is required',
  413: 'Request too large',
};

/** Serves the one request a connection carries, then closes it. */
export function handleConnection(
  socket: ConnectionSocket,
  ctx: ConnectionContext,
): void {
  if (ctx.openConnections.size >= MAX_OPEN_CONNECTIONS) {
    socket.destroy();
    return;
  }

  const reader = createRequestReader();
  const closeListeners = new Set<() => void>();
  let closed = false;
  let answered = false;
  let endRequested = false;
  let pendingWrites = 0;

  const onClosed = () => {
    if (closed) {
      return;
    }
    closed = true;
    clearTimeout(deadline);
    ctx.openConnections.delete(connection);
    const listeners = [...closeListeners];
    closeListeners.clear();
    listeners.forEach(listener => listener());
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
      closeListeners.add(listener);
      return () => closeListeners.delete(listener);
    },
  };

  const answerReadError = (status: number) => {
    answered = true;
    clearTimeout(deadline);
    writeJson(
      channel,
      status,
      errorBody({
        message: READ_ERRORS[status],
        type: 'invalid_request_error',
        code: 'bad_request',
      }),
    );
    channel.end();
  };

  const serveAdmitted = async (body: unknown) => {
    if (!ctx.admit()) {
      writeJson(
        channel,
        503,
        errorBody({
          message: 'The server is busy with other requests',
          type: 'server_error',
          code: 'server_busy',
        }),
      );
      return;
    }
    try {
      await ctx.handleChat(body, channel);
    } finally {
      ctx.release();
    }
  };

  const deadline = setTimeout(() => answerReadError(408), READ_DEADLINE_MS);
  ctx.openConnections.add(connection);

  socket.on('close', onClosed);
  socket.on('error', onClosed);
  socket.on('data', data => {
    if (answered || closed) {
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
    answered = true;
    clearTimeout(deadline);
    routeRequest(result.request, channel, {
      ...ctx.routerDeps,
      handleChat: serveAdmitted,
    })
      .catch(error => console.warn('[localApiServer] request failed:', error))
      .finally(() => channel.end());
  });
}
