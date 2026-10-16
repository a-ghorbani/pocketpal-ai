export const MAX_HEAD_BYTES = 16 * 1024;
export const MAX_BODY_BYTES = 4 * 1024 * 1024;

export interface HttpRequest {
  method: string;
  path: string;
  /** Names lowercased; repeated headers joined with ", ". */
  headers: Record<string, string>;
  body: string;
}

export type ReadResult =
  | {kind: 'pending'}
  | {kind: 'request'; request: HttpRequest}
  | {kind: 'error'; status: 400 | 411 | 413};

export interface RequestReader {
  push(chunk: Uint8Array): ReadResult;
}

const PENDING: ReadResult = {kind: 'pending'};
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

function indexOfHeadEnd(bytes: Uint8Array): number {
  for (let i = 0; i + HEAD_TERMINATOR.length <= bytes.length; i++) {
    if (HEAD_TERMINATOR.every((byte, j) => bytes[i + j] === byte)) {
      return i;
    }
  }
  return -1;
}

type ParsedHead =
  | {method: string; path: string; headers: Record<string, string>}
  | undefined;

function parseHead(bytes: Uint8Array): ParsedHead {
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
 * one body within the size limits. Everything after the first answer is
 * ignored: a connection carries one request.
 */
export function createRequestReader(): RequestReader {
  let headChunks: Uint8Array[] = [];
  let headLength = 0;
  let head: NonNullable<ParsedHead> | undefined;
  let bodyLength = 0;
  const bodyChunks: Uint8Array[] = [];
  let bodyReceived = 0;
  let settled: ReadResult | undefined;

  const settle = (result: ReadResult): ReadResult => {
    settled = result;
    return result;
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

  const pushHead = (chunk: Uint8Array): ReadResult => {
    headChunks.push(chunk);
    headLength += chunk.length;
    const buffered = concat(headChunks, headLength);
    headChunks = [buffered];
    const headEnd = indexOfHeadEnd(buffered);
    if (headEnd < 0) {
      return headLength > MAX_HEAD_BYTES
        ? settle({kind: 'error', status: 413})
        : PENDING;
    }
    if (headEnd + HEAD_TERMINATOR.length > MAX_HEAD_BYTES) {
      return settle({kind: 'error', status: 413});
    }
    head = parseHead(buffered.subarray(0, headEnd));
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
    headChunks = [];
    return pushBody(buffered.subarray(headEnd + HEAD_TERMINATOR.length));
  };

  return {
    push(chunk) {
      if (settled) {
        return settled;
      }
      return head ? pushBody(chunk) : pushHead(chunk);
    },
  };
}

export interface ResponseSink {
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

function responseHead(status: number, headers: Record<string, string>) {
  const lines = Object.entries({
    Connection: 'close',
    'Access-Control-Allow-Origin': '*',
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
    responseHead(status, {
      'Content-Type': 'application/json',
      'Content-Length': String(utf8ByteLength(text)),
      ...headers,
    }) + text,
  );
}

export function writePreflight(sink: ResponseSink): void {
  sink.write(
    responseHead(204, {
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    }),
  );
}

export function writeSseHead(sink: ResponseSink): void {
  sink.write(
    responseHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    }),
  );
}

export const SSE_DONE = '[DONE]';

export function writeSseData(sink: ResponseSink, data: unknown): void {
  sink.write(
    `data: ${data === SSE_DONE ? SSE_DONE : JSON.stringify(data)}\n\n`,
  );
}
