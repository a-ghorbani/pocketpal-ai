import {SSEParser} from './sseParser';
import {buildHeaders} from './openai';

/**
 * `llama-server` router mode: model management on top of the OpenAI-compatible
 * surface `openai.ts` covers.
 *
 * Every operation here answers `200 {"success":true}` for "accepted", including
 * for work that then fails — a download of a repository that does not exist is
 * accepted with that exact shape. So an operation's response is never read as
 * an outcome, and these functions resolve a non-2xx rather than throwing: the
 * caller decides from the status class and the model's row, never from
 * `error.message`, whose wording is not a contract.
 */

const ROUTER_OP_TIMEOUT_MS = 15000;

export interface RouterOpResponse {
  status: number;
  body: any;
}

/**
 * A stream failure that kept its HTTP status as a number. `openai.ts`'s chat
 * stream rejects with a plain `Error` whose 401 branch drops the status
 * entirely, which leaves "this build has no `/models/sse`" (a 404, and the only
 * status worth remembering) decidable only by matching English text.
 */
export class RouterStreamError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'RouterStreamError';
    this.status = status;
  }
}

export interface RouterStreamHandlers {
  onOpen?: () => void;
  onEvent?: (payload: any) => void;
  /**
   * Terminal, and only for an ending nobody here asked for: `error` is absent
   * when the stream ended without an HTTP failure. `close()` is the caller's
   * own decision and never arrives as this, so a consumer that reopens on a
   * stream ending cannot be made to reopen the one it just closed.
   */
  onClose?: (error?: RouterStreamError) => void;
}

export interface RouterStreamOptions {
  connectTimeoutMs?: number;
  /** Close once the accumulated response reaches this size. */
  maxBytes?: number;
  /** Close once the connection has been open this long. */
  maxDurationMs?: number;
}

export interface RouterStreamHandle {
  close(): void;
}

function routerBase(serverUrl: string): string {
  return serverUrl.replace(/\/+$/, '');
}

/** The reason a server gave, where it gave one. Never a verdict. */
/** The cap `src/api/openai.ts` already puts on server-supplied text. */
const SERVER_TEXT_MAX = 200;

/**
 * Bounded here rather than at each surface, so what the store retains is
 * bounded too. Counted in code points: a cut between the halves of a
 * surrogate pair leaves a replacement character on screen. A code point is at
 * most two UTF-16 units, so twice the cap always contains the cap — which is
 * why the whole body is never walked.
 */
export function capServerText(text: string): string {
  return Array.from(text.slice(0, SERVER_TEXT_MAX * 2))
    .slice(0, SERVER_TEXT_MAX)
    .join('');
}

export function routerErrorMessage(body: any): string | undefined {
  const message = body?.error?.message ?? body?.error;
  return typeof message === 'string' && message
    ? capServerText(message)
    : undefined;
}

async function postRouterOp(
  serverUrl: string,
  path: string,
  model: string,
  apiKey?: string,
  timeoutMs?: number,
): Promise<RouterOpResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    timeoutMs && timeoutMs > 0 ? timeoutMs : ROUTER_OP_TIMEOUT_MS,
  );

  try {
    const response = await fetch(`${routerBase(serverUrl)}${path}`, {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify({model}),
      signal: controller.signal,
    });
    let body: any = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return {status: response.status, body};
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error('Connection timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function routerLoad(
  serverUrl: string,
  model: string,
  apiKey?: string,
  timeoutMs?: number,
): Promise<RouterOpResponse> {
  return postRouterOp(serverUrl, '/models/load', model, apiKey, timeoutMs);
}

/** Unloads a resident model, and cancels an in-flight download of one. */
export function routerUnload(
  serverUrl: string,
  model: string,
  apiKey?: string,
  timeoutMs?: number,
): Promise<RouterOpResponse> {
  return postRouterOp(serverUrl, '/models/unload', model, apiKey, timeoutMs);
}

export function routerDownload(
  serverUrl: string,
  model: string,
  apiKey?: string,
  timeoutMs?: number,
): Promise<RouterOpResponse> {
  return postRouterOp(serverUrl, '/models', model, apiKey, timeoutMs);
}

/**
 * `GET /models/sse`. Transport mirrors the chat stream — XHR plus `onprogress`,
 * the React Native pattern — while the error shape does not: failures arrive as
 * `RouterStreamError` carrying the numeric status.
 */
export function openRouterEventStream(
  serverUrl: string,
  apiKey: string | undefined,
  handlers: RouterStreamHandlers,
  options: RouterStreamOptions = {},
): RouterStreamHandle {
  const xhr = new XMLHttpRequest();
  const parser = new SSEParser();
  let lastProcessedLength = 0;
  let settled = false;
  let opened = false;

  const timers: Array<ReturnType<typeof setTimeout>> = [];
  const clearTimers = () => {
    for (const timer of timers) {
      clearTimeout(timer);
    }
    timers.length = 0;
  };

  /** Stop the request and its timers. Tells nobody: the caller is here. */
  const teardown = (): boolean => {
    if (settled) {
      return false;
    }
    settled = true;
    clearTimers();
    try {
      xhr.abort();
    } catch {
      // The request may already be finished; nothing to unwind.
    }
    return true;
  };

  /** The stream ended on its own — by failure, by budget, or by the server. */
  const ended = (error?: RouterStreamError) => {
    if (teardown()) {
      handlers.onClose?.(error);
    }
  };

  const consume = () => {
    const text = xhr.responseText;
    const chunk = text.substring(lastProcessedLength);
    lastProcessedLength = text.length;
    if (chunk) {
      for (const event of parser.feed(chunk)) {
        if (event !== 'done') {
          handlers.onEvent?.(event);
        }
      }
    }
    if (options.maxBytes !== undefined && text.length >= options.maxBytes) {
      ended();
    }
  };

  if (options.connectTimeoutMs !== undefined) {
    timers.push(
      setTimeout(() => {
        if (!opened) {
          ended(new RouterStreamError('Connection timed out'));
        }
      }, options.connectTimeoutMs),
    );
  }
  if (options.maxDurationMs !== undefined) {
    timers.push(setTimeout(() => ended(), options.maxDurationMs));
  }

  xhr.onreadystatechange = () => {
    if (settled) {
      return;
    }
    if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
      if (xhr.status >= 200 && xhr.status < 300) {
        opened = true;
        handlers.onOpen?.();
      }
      return;
    }
    if (
      xhr.readyState === XMLHttpRequest.DONE &&
      xhr.status !== 0 &&
      (xhr.status < 200 || xhr.status >= 300)
    ) {
      let body: any = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }
      ended(
        new RouterStreamError(
          routerErrorMessage(body) ?? `Server error: ${xhr.status}`,
          xhr.status,
        ),
      );
    }
  };

  xhr.onprogress = () => {
    if (!settled) {
      consume();
    }
  };

  xhr.onload = () => {
    if (settled) {
      return;
    }
    consume();
    if (!settled) {
      for (const event of parser.flush()) {
        if (event !== 'done') {
          handlers.onEvent?.(event);
        }
      }
      ended();
    }
  };

  xhr.onerror = () => ended(new RouterStreamError('Stream failed'));
  xhr.ontimeout = () => ended(new RouterStreamError('Stream timed out'));

  xhr.open('GET', `${routerBase(serverUrl)}/models/sse`);
  for (const [key, value] of Object.entries(buildHeaders(apiKey))) {
    xhr.setRequestHeader(key, value);
  }
  xhr.setRequestHeader('Accept', 'text/event-stream');
  xhr.send();

  return {
    close: () => {
      teardown();
    },
  };
}
