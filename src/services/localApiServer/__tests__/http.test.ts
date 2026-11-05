import {Buffer as PackageBuffer} from 'buffer';

import {
  createRequestReader,
  decodeUtf8,
  MAX_BODY_BYTES,
  MAX_HEAD_BYTES,
  ReadResult,
  ResponseSink,
  SSE_DONE,
  writeJson,
  writeSseData,
  writeSseHead,
} from '../http';

jest.mock('buffer', () => jest.requireActual('buffer/'));

const bytes = (text: string) => new Uint8Array(Buffer.from(text));

/** The reader's result, with a request body shown as its decoded text. */
const feed = (...chunks: (string | Uint8Array)[]) => {
  const reader = createRequestReader();
  let result: ReadResult = {kind: 'pending'};
  for (const chunk of chunks) {
    result = reader.push(typeof chunk === 'string' ? bytes(chunk) : chunk);
  }
  return result.kind === 'request'
    ? {
        ...result,
        request: {...result.request, body: decodeUtf8(result.request.body)},
      }
    : result;
};

const post = (body: string, extra = '') =>
  `POST /v1/chat/completions HTTP/1.1\r\nHost: 127.0.0.1:8080\r\nContent-Length: ${Buffer.byteLength(body)}\r\n${extra}\r\n${body}`;

const recordingSink = () => {
  const writes: string[] = [];
  const sink: ResponseSink = {
    write: d => writes.push(d),
    end: jest.fn(),
  };
  return {sink, writes, text: () => writes.join('')};
};

describe('createRequestReader', () => {
  it('parses a GET with no body', () => {
    expect(
      feed('GET /v1/models?x=1 HTTP/1.1\r\nHost: localhost\r\n\r\n'),
    ).toEqual({
      kind: 'request',
      request: {
        method: 'GET',
        path: '/v1/models',
        headers: {host: 'localhost'},
        body: '',
      },
    });
  });

  it('reassembles a head and body split across chunks', () => {
    const raw = post('{"a":1}', 'Authorization: Bearer k\r\n');
    const chunks = raw.split('').map(c => c);
    const result = feed(...chunks);
    expect(result).toMatchObject({
      kind: 'request',
      request: {
        method: 'POST',
        headers: {authorization: 'Bearer k', 'content-length': '7'},
        body: '{"a":1}',
      },
    });
  });

  it('decodes a multi-byte character split across chunks', () => {
    const raw = bytes(post('"héllo 😀"'));
    const cut = raw.length - 4;
    expect(feed(raw.subarray(0, cut), raw.subarray(cut))).toMatchObject({
      kind: 'request',
      request: {body: '"héllo 😀"'},
    });
  });

  it('joins repeated headers', () => {
    expect(feed('GET / HTTP/1.1\r\nX-A: 1\r\nx-a: 2\r\n\r\n')).toMatchObject({
      request: {headers: {'x-a': '1, 2'}},
    });
  });

  it('ignores Expect: 100-continue and reads the body', () => {
    expect(feed(post('{}', 'Expect: 100-continue\r\n'))).toMatchObject({
      kind: 'request',
      request: {body: '{}'},
    });
  });

  it('stays pending until the whole body has arrived', () => {
    const head = 'POST / HTTP/1.1\r\nContent-Length: 4\r\n\r\n';
    expect(feed(`${head}ab`)).toEqual({kind: 'pending'});
    expect(feed(`${head}ab`, 'cd')).toMatchObject({request: {body: 'abcd'}});
  });

  it('ends the body at its Content-Length', () => {
    expect(feed(`${post('{}')}GET / HTTP/1.1\r\n\r\n`)).toMatchObject({
      request: {body: '{}'},
    });
  });

  it('reads only the bytes a chunk view covers', () => {
    const request = 'GET /v1/models HTTP/1.1\r\n\r\n';
    const backing = bytes(`junk${request}junk`);
    expect(feed(backing.subarray(4, 4 + request.length))).toMatchObject({
      kind: 'request',
      request: {method: 'GET', path: '/v1/models'},
    });
  });

  it.each([
    [
      'a POST without Content-Length',
      'POST / HTTP/1.1\r\nHost: localhost\r\n\r\n',
    ],
    [
      'a chunked body',
      'POST / HTTP/1.1\r\nTransfer-Encoding: chunked\r\n\r\n4\r\nabcd',
    ],
    [
      'a chunked body that also has a Content-Length',
      'POST / HTTP/1.1\r\nTransfer-Encoding: chunked\r\nContent-Length: 4\r\n\r\nabcd',
    ],
  ])('answers 411 for %s', (_, raw) => {
    expect(feed(raw)).toEqual({kind: 'error', status: 411});
  });

  it.each([
    'garbage\r\n\r\n',
    'GET / HTTP/2\r\n\r\n',
    'GET / HTTP/1.1\r\nno-colon\r\n\r\n',
    'POST / HTTP/1.1\r\nContent-Length: -1\r\n\r\n',
  ])('answers 400 for a malformed head %#', raw => {
    expect(feed(raw)).toEqual({kind: 'error', status: 400});
  });

  it('answers 400 for a head that is not UTF-8', () => {
    expect(
      feed(
        bytes('GET / HTTP/1.1\r\nX-A: '),
        new Uint8Array([0xc3, 0x28]),
        '\r\n\r\n',
      ),
    ).toEqual({kind: 'error', status: 400});
  });

  it('keeps the body as bytes, undecoded', () => {
    const head = bytes('POST / HTTP/1.1\r\nContent-Length: 2\r\n\r\n');
    expect(feed(head, new Uint8Array([0xc3, 0x28]))).toMatchObject({
      kind: 'request',
      request: {body: undefined},
    });
  });

  describe('head limit', () => {
    const headOf = (size: number) => {
      const start = 'GET / HTTP/1.1\r\nX-Pad: ';
      return `${start}${'a'.repeat(size - start.length - 4)}\r\n\r\n`;
    };

    it('accepts a head of exactly the limit', () => {
      expect(feed(headOf(MAX_HEAD_BYTES)).kind).toBe('request');
    });

    it('answers 413 one byte over the limit', () => {
      expect(feed(headOf(MAX_HEAD_BYTES + 1))).toEqual({
        kind: 'error',
        status: 413,
      });
    });

    it('parses a head sent one byte per chunk in linear time', () => {
      const raw = bytes(headOf(MAX_HEAD_BYTES));
      const chunks = Array.from(raw, byte => new Uint8Array([byte]));
      const reader = createRequestReader();
      const originalSet = Uint8Array.prototype.set;
      let copied = 0;
      const set = jest
        .spyOn(Uint8Array.prototype, 'set')
        .mockImplementation(function (this: Uint8Array, source, offset) {
          copied += (source as ArrayLike<number>).length;
          originalSet.call(this, source as ArrayLike<number>, offset);
        });
      let result: ReadResult = {kind: 'pending'};
      try {
        for (const chunk of chunks) {
          result = reader.push(chunk);
          set.mockClear();
        }
      } finally {
        set.mockRestore();
      }

      expect(result.kind).toBe('request');
      expect(copied).toBeLessThanOrEqual(4 * raw.length);
    });

    it.each([1, 2, 3])(
      'finds a head end split %i bytes into the terminator',
      split => {
        const raw = 'GET / HTTP/1.1\r\nHost: localhost\r\n\r\n';
        const cut = raw.length - 4 + split;
        expect(feed(raw.slice(0, cut), raw.slice(cut)).kind).toBe('request');
      },
    );

    it('answers 413 when no head end arrives within the limit', () => {
      expect(feed('GET / HTTP/1.1\r\n', 'a'.repeat(MAX_HEAD_BYTES))).toEqual({
        kind: 'error',
        status: 413,
      });
    });
  });

  describe('body limit', () => {
    const declared = (length: number) =>
      `POST / HTTP/1.1\r\nContent-Length: ${length}\r\n\r\n`;

    it('accepts a body of exactly the limit', () => {
      const result = feed(
        declared(MAX_BODY_BYTES),
        new Uint8Array(MAX_BODY_BYTES).fill(0x61),
      );
      expect(result.kind).toBe('request');
    });

    it('answers 413 for a declared body over the limit', () => {
      expect(feed(declared(MAX_BODY_BYTES + 1))).toEqual({
        kind: 'error',
        status: 413,
      });
    });
  });

  it('keeps its first answer for any later bytes', () => {
    const reader = createRequestReader();
    const first = reader.push(bytes('GET / HTTP/1.1\r\n\r\n'));
    expect(reader.push(bytes('GET /other HTTP/1.1\r\n\r\n'))).toBe(first);
  });
});

describe('decodeUtf8', () => {
  it("runs on the buffer package, not Node's Buffer", () => {
    expect(PackageBuffer).not.toBe(global.Buffer);
  });

  it.each(['', 'a%b', 'é', '中文', '😀', '\uFFFD'])('round-trips %j', text => {
    expect(decodeUtf8(PackageBuffer.from(text))).toBe(text);
  });

  it.each([
    [[0xc3, 0x28]],
    [[0xff]],
    [[0xc0, 0xaf]],
    [[0xed, 0xa0, 0x80]],
    [[0xe6, 0x97]],
  ])('refuses the invalid sequence %j', sequence => {
    expect(decodeUtf8(PackageBuffer.from(sequence))).toBeUndefined();
  });
});

describe('writers', () => {
  it('writes JSON with close and a byte-exact length', () => {
    const {sink, text} = recordingSink();
    writeJson(sink, 404, {error: 'é'});
    expect(text()).toBe(
      'HTTP/1.1 404 Not Found\r\nConnection: close\r\n' +
        'Content-Type: application/json\r\nContent-Length: 14\r\n\r\n{"error":"é"}',
    );
  });

  it('writes an event stream', () => {
    const {sink, text} = recordingSink();
    writeSseHead(sink);
    writeSseData(sink, {a: 1});
    writeSseData(sink, SSE_DONE);
    expect(text()).toContain('Content-Type: text/event-stream\r\n');
    expect(text()).toContain('Connection: close\r\n');
    expect(text()).not.toContain('Access-Control-');
    expect(text().endsWith('data: {"a":1}\n\ndata: [DONE]\n\n')).toBe(true);
  });
});
