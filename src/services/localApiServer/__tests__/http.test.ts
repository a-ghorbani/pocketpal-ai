import {
  createRequestReader,
  decodeUtf8,
  MAX_BODY_BYTES,
  MAX_HEAD_BYTES,
  ReadResult,
  ResponseSink,
  SSE_DONE,
  utf8ByteLength,
  writeJson,
  writePreflight,
  writeSseData,
  writeSseHead,
} from '../http';

const bytes = (text: string) => new Uint8Array(Buffer.from(text));

const feed = (...chunks: (string | Uint8Array)[]): ReadResult => {
  const reader = createRequestReader();
  let result: ReadResult = {kind: 'pending'};
  for (const chunk of chunks) {
    result = reader.push(typeof chunk === 'string' ? bytes(chunk) : chunk);
  }
  return result;
};

const post = (body: string, extra = '') =>
  `POST /v1/chat/completions HTTP/1.1\r\nHost: 127.0.0.1:8080\r\nContent-Length: ${Buffer.byteLength(body)}\r\n${extra}\r\n${body}`;

const recordingSink = () => {
  const writes: string[] = [];
  const sink: ResponseSink = {write: d => writes.push(d), end: jest.fn()};
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
    const reader = createRequestReader();
    expect(
      reader.push(bytes('POST / HTTP/1.1\r\nContent-Length: 4\r\n\r\nab')),
    ).toEqual({kind: 'pending'});
    expect(reader.push(bytes('cd'))).toMatchObject({request: {body: 'abcd'}});
  });

  it('answers 411 for a POST without Content-Length', () => {
    expect(feed('POST / HTTP/1.1\r\nHost: localhost\r\n\r\n')).toEqual({
      kind: 'error',
      status: 411,
    });
  });

  it('answers 411 for a chunked request body', () => {
    expect(
      feed('POST / HTTP/1.1\r\nTransfer-Encoding: chunked\r\n\r\n4\r\nabcd'),
    ).toEqual({kind: 'error', status: 411});
  });

  it.each([
    'garbage\r\n\r\n',
    'GET / HTTP/2\r\n\r\n',
    'GET / HTTP/1.1\r\nno-colon\r\n\r\n',
    'POST / HTTP/1.1\r\nContent-Length: -1\r\n\r\n',
  ])('answers 400 for a malformed head %#', raw => {
    expect(feed(raw)).toEqual({kind: 'error', status: 400});
  });

  it('answers 400 for a body that is not UTF-8', () => {
    const head = bytes('POST / HTTP/1.1\r\nContent-Length: 2\r\n\r\n');
    expect(feed(head, new Uint8Array([0xc3, 0x28]))).toEqual({
      kind: 'error',
      status: 400,
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

describe('utf8 helpers', () => {
  it('round-trips through decodeUtf8 and counts bytes', () => {
    for (const text of ['', 'a%b', 'é', '中文', '😀']) {
      expect(decodeUtf8(bytes(text))).toBe(text);
      expect(utf8ByteLength(text)).toBe(Buffer.byteLength(text));
    }
  });
});

describe('writers', () => {
  it('writes JSON with close, CORS and a byte-exact length', () => {
    const {sink, text} = recordingSink();
    writeJson(sink, 404, {error: 'é'});
    expect(text()).toBe(
      'HTTP/1.1 404 Not Found\r\nConnection: close\r\nAccess-Control-Allow-Origin: *\r\n' +
        'Content-Type: application/json\r\nContent-Length: 14\r\n\r\n{"error":"é"}',
    );
  });

  it('writes the preflight answer', () => {
    const {sink, text} = recordingSink();
    writePreflight(sink);
    expect(text()).toContain('HTTP/1.1 204 No Content\r\n');
    expect(text()).toContain(
      'Access-Control-Allow-Headers: Authorization, Content-Type\r\n',
    );
    expect(text()).toContain(
      'Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n',
    );
  });

  it('writes an event stream', () => {
    const {sink, text} = recordingSink();
    writeSseHead(sink);
    writeSseData(sink, {a: 1});
    writeSseData(sink, SSE_DONE);
    expect(text()).toContain('Content-Type: text/event-stream\r\n');
    expect(text()).toContain('Connection: close\r\n');
    expect(text().endsWith('data: {"a":1}\n\ndata: [DONE]\n\n')).toBe(true);
  });
});
