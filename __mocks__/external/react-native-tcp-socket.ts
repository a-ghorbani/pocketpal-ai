import {EventEmitter} from 'events';

/**
 * A socket the test drives: `receive` delivers bytes, `peerClose` closes from
 * the client side, `writes` records what the app wrote. Like the native
 * socket, `end` and `destroy` lead to one asynchronous `close`.
 */
export class FakeSocket extends EventEmitter {
  writes: string[] = [];
  ended = false;
  destroyed = false;
  private closed = false;

  get output(): string {
    return this.writes.join('');
  }

  write(data: string, _encoding?: string, cb?: (err?: Error) => void) {
    if (this.destroyed) {
      throw new Error('Socket is closed.');
    }
    this.writes.push(String(data));
    if (cb) {
      Promise.resolve().then(() => cb());
    }
    return true;
  }

  end() {
    if (!this.ended && !this.destroyed) {
      this.ended = true;
      Promise.resolve().then(() => this.emitClose());
    }
    return this;
  }

  destroy() {
    if (!this.destroyed) {
      this.destroyed = true;
      Promise.resolve().then(() => this.emitClose());
    }
    return this;
  }

  receive(data: string | Uint8Array) {
    this.emit(
      'data',
      typeof data === 'string' ? new Uint8Array(Buffer.from(data)) : data,
    );
  }

  peerClose() {
    this.emitClose();
  }

  private emitClose() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.emit('close', false);
  }
}

export class FakeServer extends EventEmitter {
  listenOptions: {port: number; host?: string} | undefined;
  closed = false;

  constructor(readonly options: {allowHalfOpen?: boolean} = {}) {
    super();
  }

  listen = jest.fn((options: {port: number; host?: string}) => {
    this.listenOptions = options;
    return this;
  });

  close = jest.fn(() => {
    this.closed = true;
    return this;
  });

  emitListening() {
    this.emit('listening');
  }

  emitError(error: Error) {
    this.emit('error', error);
  }

  connect(socket: FakeSocket = new FakeSocket()): FakeSocket {
    this.emit('connection', socket);
    return socket;
  }
}

export const createdServers: FakeServer[] = [];

export const createServer = jest.fn(
  (
    options: {allowHalfOpen?: boolean},
    connectionListener?: (socket: FakeSocket) => void,
  ) => {
    const server = new FakeServer(options);
    if (connectionListener) {
      server.on('connection', connectionListener);
    }
    createdServers.push(server);
    return server;
  },
);

export default {createServer};
