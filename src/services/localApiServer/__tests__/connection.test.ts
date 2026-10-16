import {FakeSocket} from '../../../../__mocks__/external/react-native-tcp-socket';
import type {ResponseChannel} from '../chatCompletion';
import {
  ConnectionContext,
  handleConnection,
  MAX_ADMITTED_REQUESTS,
  MAX_OPEN_CONNECTIONS,
  OpenConnection,
  READ_DEADLINE_MS,
} from '../connection';

const CHAT =
  'POST /v1/chat/completions HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 2\r\n\r\n{}';

const flush = async () => {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
};

const makeContext = (
  handleChat: ConnectionContext['handleChat'] = async (_body, channel) => {
    channel.write('served');
  },
) => {
  let admitted = 0;
  const ctx: ConnectionContext & {admitted(): number} = {
    openConnections: new Set<OpenConnection>(),
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
    routerDeps: {
      getApiKey: () => undefined,
      getServedModelId: () => 'm',
      listenerStartedAt: 0,
    },
    handleChat: jest.fn(handleChat),
    admitted: () => admitted,
  };
  return ctx;
};

const connect = (ctx: ConnectionContext) => {
  const socket = new FakeSocket();
  handleConnection(socket, ctx);
  return socket;
};

/** A chat handler held open until the test resolves it. */
const heldChat = () => {
  const channels: ResponseChannel[] = [];
  const finishers: (() => void)[] = [];
  const handleChat = (_body: unknown, channel: ResponseChannel) =>
    new Promise<void>(resolve => {
      channels.push(channel);
      finishers.push(resolve);
    });
  return {handleChat, channels, finish: (i: number) => finishers[i]()};
};

afterEach(() => {
  jest.useRealTimers();
});

describe('handleConnection', () => {
  it('routes a request, then ends the socket after the last write', async () => {
    const ctx = makeContext();
    const socket = connect(ctx);
    socket.receive(CHAT);
    await flush();

    expect(ctx.handleChat).toHaveBeenCalledWith({}, expect.anything());
    expect(socket.output).toBe('served');
    expect(socket.ended).toBe(true);
    expect(ctx.openConnections.size).toBe(0);
    expect(ctx.admitted()).toBe(0);
  });

  it('does not end the socket before pending writes are flushed', async () => {
    const ctx = makeContext();
    const socket = new FakeSocket();
    const callbacks: (() => void)[] = [];
    socket.write = jest.fn((data: string, _enc, cb) => {
      socket.writes.push(data);
      callbacks.push(() => cb?.());
      return true;
    });
    handleConnection(socket, ctx);
    socket.receive(CHAT);
    await flush();

    expect(socket.ended).toBe(false);
    callbacks.forEach(cb => cb());
    expect(socket.ended).toBe(true);
  });

  it('answers read errors without routing', async () => {
    const ctx = makeContext();
    const socket = connect(ctx);
    socket.receive('POST / HTTP/1.1\r\nHost: localhost\r\n\r\n');
    await flush();

    expect(socket.output).toMatch(/^HTTP\/1\.1 411 /);
    expect(ctx.handleChat).not.toHaveBeenCalled();
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
    const ctx = makeContext();
    const socket = connect(ctx);
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
    const ctx = makeContext(held.handleChat);
    const socket = connect(ctx);
    socket.receive(CHAT);
    await flush();
    jest.advanceTimersByTime(READ_DEADLINE_MS * 2);

    expect(socket.writes).toEqual([]);
    held.finish(0);
  });

  it('answers 503 server_busy to a third concurrent chat request', async () => {
    const held = heldChat();
    const ctx = makeContext(held.handleChat);
    connect(ctx).receive(CHAT);
    connect(ctx).receive(CHAT);
    const third = connect(ctx);
    third.receive(CHAT);
    await flush();

    expect(third.output).toMatch(/^HTTP\/1\.1 503 /);
    expect(third.output).toContain('"code":"server_busy"');
    expect(ctx.handleChat).toHaveBeenCalledTimes(2);

    held.finish(0);
    held.finish(1);
    await flush();
    expect(ctx.admitted()).toBe(0);
  });

  it('tells the handler when the client disconnects, and releases once', async () => {
    const held = heldChat();
    const ctx = makeContext(held.handleChat);
    const socket = connect(ctx);
    socket.receive(CHAT);
    await flush();
    const onClose = jest.fn();
    held.channels[0].onClose(onClose);
    socket.peerClose();
    socket.peerClose();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(held.channels[0].closed).toBe(true);
    expect(ctx.openConnections.size).toBe(0);
    held.channels[0].write('ignored');
    expect(socket.writes).toEqual([]);

    held.finish(0);
    await flush();
    expect(ctx.release).toHaveBeenCalledTimes(1);
    expect(ctx.admitted()).toBe(0);
  });

  it('treats a socket error as a close', async () => {
    const held = heldChat();
    const ctx = makeContext(held.handleChat);
    const socket = connect(ctx);
    socket.receive(CHAT);
    await flush();
    socket.emit('error', new Error('reset'));

    expect(held.channels[0].closed).toBe(true);
    held.finish(0);
  });

  it('closes at once when its open connection is destroyed', async () => {
    const held = heldChat();
    const ctx = makeContext(held.handleChat);
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
    const ctx = makeContext();
    const socket = connect(ctx);
    socket.receive(CHAT);
    socket.receive(CHAT);
    await flush();
    expect(ctx.handleChat).toHaveBeenCalledTimes(1);
  });
});
