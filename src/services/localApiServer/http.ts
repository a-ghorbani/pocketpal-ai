import {Buffer} from 'buffer';

import {errorBody, WireError} from './wire';

export const MAX_HEAD_BYTES = 16 * 1024;
export const MAX_BODY_BYTES = 1024 * 1024;

export interface HttpRequest {
  method: string;
  path: string;
  /** Names lowercased; repeated headers joined with ", ". */
  headers: Record<string, string>;
  body: Buffer;
}

type RequestHead = Omit<HttpRequest, 'body'>;

export type ReadResult =
  | {kind: 'pending'}
  | {kind: 'request'; request: HttpRequest}
  | {kind: 'error'; status: 400 | 411 | 413};

export interface RequestReader {
  push(chunk: Uint8Array): ReadResult;
}

const PENDING: ReadResult = {kind: 'pending'};
const HEAD_END = '\r\n\r\n';
const SEAM = HEAD_END.length - 1;
const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH']);

/** Undefined when the bytes are not valid UTF-8. */
export function decodeUtf8(bytes: Buffer): string | undefined {
  const text = bytes.toString('utf8');
  return text.includes('\uFFFD') && !Buffer.from(text, 'utf8').equals(bytes)
    ? undefined
    : text;
}

function parseHead(bytes: Buffer): RequestHead | undefined {
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
 * one body within the size limits. The head is copied once, when its end
 * arrives. Everything after the first result is ignored: a connection carries
 * one request.
 */
export function createRequestReader(): RequestReader {
  let headChunks: Buffer[] = [];
  let headLength = 0;
  let headTail = '';
  let head: RequestHead | undefined;
  let bodyLength = 0;
  const bodyChunks: Buffer[] = [];
  let bodyReceived = 0;
  let settled: ReadResult | undefined;

  const settle = (result: ReadResult): ReadResult => {
    settled = result;
    return result;
  };

  const pushBody = (chunk: Buffer): ReadResult => {
    bodyChunks.push(chunk);
    bodyReceived += chunk.length;
    if (bodyReceived < bodyLength) {
      return PENDING;
    }
    const body = Buffer.concat(bodyChunks, bodyReceived).slice(0, bodyLength);
    return settle({kind: 'request', request: {...head!, body}});
  };

  const offsetAfterHeadEnd = (chunk: Buffer): number => {
    const seam = headTail + chunk.toString('latin1', 0, SEAM);
    const atSeam = seam.indexOf(HEAD_END);
    if (atSeam >= 0 && atSeam < headTail.length) {
      return atSeam + HEAD_END.length - headTail.length;
    }
    const inChunk = chunk.indexOf(HEAD_END);
    return inChunk < 0 ? -1 : inChunk + HEAD_END.length;
  };

  const pushHead = (chunk: Buffer): ReadResult => {
    const end = offsetAfterHeadEnd(chunk);
    const headPart = end < 0 ? chunk : chunk.slice(0, end);
    headLength += headPart.length;
    if (headLength > MAX_HEAD_BYTES) {
      headChunks = [];
      return settle({kind: 'error', status: 413});
    }
    headChunks.push(headPart);
    if (end < 0) {
      const last = chunk.toString('latin1', Math.max(0, chunk.length - SEAM));
      headTail = (headTail + last).slice(-SEAM);
      return PENDING;
    }
    const headBytes = Buffer.concat(headChunks, headLength);
    headChunks = [];
    head = parseHead(headBytes.slice(0, headLength - HEAD_END.length));
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
    return pushBody(chunk.slice(end));
  };

  return {
    push(data) {
      if (settled) {
        return settled;
      }
      const chunk = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
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
  const lines = Object.entries({Connection: 'close', ...headers}).map(
    ([name, value]) => `${name}: ${value}`,
  );
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
      'Content-Length': String(Buffer.byteLength(text)),
      ...headers,
    }) + text,
  );
}

export function writeError(
  sink: ResponseSink,
  status: number,
  error: Omit<WireError, 'status'>,
  headers?: Record<string, string>,
): void {
  writeJson(sink, status, errorBody(error), headers);
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
