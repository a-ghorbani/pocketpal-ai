export const MAX_HEAD_BYTES = 16 * 1024;
export const MAX_BODY_BYTES = 1024 * 1024;

export interface HttpRequest {
  method: string;
  path: string;
  /** Names lowercased; repeated headers joined with ", ". */
  headers: Record<string, string>;
  body: string;
}

export type RequestHead = Omit<HttpRequest, 'body'>;

export type ReadResult =
  | {kind: 'pending'}
  | {kind: 'request'; request: HttpRequest}
  | {kind: 'answered'; drained: boolean}
  | {kind: 'error'; status: 400 | 411 | 413};

export interface RequestReader {
  push(chunk: Uint8Array): ReadResult;
}

const PENDING: ReadResult = {kind: 'pending'};
const DRAINING: ReadResult = {kind: 'answered', drained: false};
const HEAD_TERMINATOR = [13, 10, 13, 10];
const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH']);

const PERCENT_ENCODED = Array.from(
  {length: 256},
  (_, byte) => `%${byte.toString(16).padStart(2, '0')}`,
);

/** Undefined when the bytes are not valid UTF-8. */
export function decodeUtf8(bytes: Uint8Array): string | undefined {
  let encoded = '';
  for (const byte of bytes) {
    encoded +=
      byte < 0x80 && byte !== 0x25
        ? String.fromCharCode(byte)
        : PERCENT_ENCODED[byte];
  }
  try {
    return decodeURIComponent(encoded);
  } catch {
    return undefined;
  }
}

export function utf8ByteLength(text: string): number {
  let length = 0;
  for (const char of text) {
    const code = char.codePointAt(0)!;
    length += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return length;
}

function concat(chunks: Uint8Array[], length: number): Uint8Array {
  const joined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return joined;
}

function parseHead(bytes: Uint8Array): RequestHead | undefined {
  const text = decodeUtf8(bytes);
  if (text === undefined) {
    return undefined;
  }
  const [requestLine, ...headerLines] = text.split('\r\n');
  const requestParts = requestLine.split(' ');
  if (requestParts.length !== 3 || !/^HTTP\/1\.[01]$/.test(requestParts[2])) {
    return undefined;
  }
  const [method, target] = requestParts;
  const headers: Record<string, string> = {};
  for (const line of headerLines) {
    const colon = line.indexOf(':');
    if (colon <= 0) {
      return undefined;
    }
    const name = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    headers[name] = name in headers ? `${headers[name]}, ${value}` : value;
  }
  return {method, path: target.split('?')[0], headers};
}

/**
 * Reads one request from a connection's bytes, holding at most one head and
 * one body within the size limits. `onHead` sees each framed head before any
 * body byte is kept; when it answers the request (returns true), the body is
 * only counted until `Content-Length`, never stored or decoded. Everything
 * after the first answer is ignored: a connection carries one request.
 */
export function createRequestReader(
  onHead: (head: RequestHead) => boolean,
): RequestReader {
  let headChunks: Uint8Array[] = [];
  let headLength = 0;
  let terminatorMatched = 0;
  let head: RequestHead | undefined;
  let headAnswered = false;
  let bodyLength = 0;
  const bodyChunks: Uint8Array[] = [];
  let bodyReceived = 0;
  let settled: ReadResult | undefined;

  const settle = (result: ReadResult): ReadResult => {
    settled = result;
    return result;
  };

  const drain = (chunk: Uint8Array): ReadResult => {
    bodyReceived += chunk.length;
    return bodyReceived < bodyLength
      ? DRAINING
      : settle({kind: 'answered', drained: true});
  };

  const pushBody = (chunk: Uint8Array): ReadResult => {
    bodyChunks.push(chunk);
    bodyReceived += chunk.length;
    if (bodyReceived < bodyLength) {
      return PENDING;
    }
    const body = decodeUtf8(
      concat(bodyChunks, bodyReceived).subarray(0, bodyLength),
    );
    if (body === undefined) {
      return settle({kind: 'error', status: 400});
    }
    return settle({kind: 'request', request: {...head!, body}});
  };

  const offsetAfterHeadEnd = (chunk: Uint8Array): number => {
    for (let i = 0; i < chunk.length; i++) {
      const byte = chunk[i];
      if (byte === HEAD_TERMINATOR[terminatorMatched]) {
        terminatorMatched += 1;
      } else {
        terminatorMatched = byte === HEAD_TERMINATOR[0] ? 1 : 0;
      }
      if (terminatorMatched === HEAD_TERMINATOR.length) {
        return i + 1;
      }
    }
    return -1;
  };

  const pushHead = (chunk: Uint8Array): ReadResult => {
    const end = offsetAfterHeadEnd(chunk);
    const headPart = end < 0 ? chunk : chunk.subarray(0, end);
    headLength += headPart.length;
    if (headLength > MAX_HEAD_BYTES) {
      headChunks = [];
      return settle({kind: 'error', status: 413});
    }
    headChunks.push(headPart);
    if (end < 0) {
      return PENDING;
    }
    const headBytes = concat(headChunks, headLength);
    headChunks = [];
    head = parseHead(
      headBytes.subarray(0, headLength - HEAD_TERMINATOR.length),
    );
    if (!head) {
      return settle({kind: 'error', status: 400});
    }
    if (head.headers['transfer-encoding'] !== undefined) {
      return settle({kind: 'error', status: 411});
    }
    const contentLength = head.headers['content-length'];
    if (contentLength === undefined) {
      if (METHODS_WITH_BODY.has(head.method)) {
        return settle({kind: 'error', status: 411});
      }
    } else if (!/^\d+$/.test(contentLength)) {
      return settle({kind: 'error', status: 400});
    } else {
      bodyLength = Number(contentLength);
    }
    if (bodyLength > MAX_BODY_BYTES) {
      return settle({kind: 'error', status: 413});
    }
    if (onHead(head)) {
      headAnswered = true;
      return drain(chunk.subarray(end));
    }
    return pushBody(chunk.subarray(end));
  };

  return {
    push(chunk) {
      if (settled) {
        return settled;
      }
      if (!head) {
        return pushHead(chunk);
      }
      return headAnswered ? drain(chunk) : pushBody(chunk);
    },
  };
}

export interface ResponseSink {
  readonly cors: boolean;
  write(data: string): void;
  end(): void;
}

const STATUS_TEXT: Record<number, string> = {
  200: 'OK',
  204: 'No Content',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  408: 'Request Timeout',
  411: 'Length Required',
  413: 'Payload Too Large',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

function responseHead(
  status: number,
  headers: Record<string, string>,
  cors: boolean,
) {
  const lines = Object.entries({
    Connection: 'close',
    ...(cors ? {'Access-Control-Allow-Origin': '*'} : {}),
    ...headers,
  }).map(([name, value]) => `${name}: ${value}`);
  return `HTTP/1.1 ${status} ${STATUS_TEXT[status] ?? ''}\r\n${lines.join('\r\n')}\r\n\r\n`;
}

export function writeJson(
  sink: ResponseSink,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  const text = JSON.stringify(body);
  sink.write(
    responseHead(
      status,
      {
        'Content-Type': 'application/json',
        'Content-Length': String(utf8ByteLength(text)),
        ...headers,
      },
      sink.cors,
    ) + text,
  );
}

export function writePreflight(sink: ResponseSink): void {
  const allow = {
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
  sink.write(responseHead(204, sink.cors ? allow : {}, sink.cors));
}

export function writeSseHead(sink: ResponseSink): void {
  sink.write(
    responseHead(
      200,
      {'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache'},
      sink.cors,
    ),
  );
}

export const SSE_DONE = '[DONE]';

export function writeSseData(sink: ResponseSink, data: unknown): void {
  sink.write(
    `data: ${data === SSE_DONE ? SSE_DONE : JSON.stringify(data)}\n\n`,
  );
}
