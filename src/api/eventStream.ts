import {SSEParser} from './sseParser';

export type SSEEvent = object | 'done';

export interface EventStreamOptions {
  headers: Record<string, string>;
  method?: 'GET' | 'POST';
  body?: string;
  connectTimeoutMs: number;
  signal?: AbortSignal;
}

/**
 * Exactly one terminal handler runs per stream, and none after the caller's
 * own `close()`.
 */
export interface EventStreamHandlers {
  onOpen?: () => void;
  onEvents: (events: Iterable<SSEEvent>) => void;
  onLoad: (flushed: Iterable<SSEEvent>) => void;
  onHttpError: (status: number, responseText: string) => void;
  onNetworkError: () => void;
  onConnectTimeout: () => void;
  onAbort: () => void;
}

export interface EventStreamHandle {
  close(): void;
}

function isSuccess(status: number): boolean {
  return status >= 200 && status < 300;
}

/**
 * Server-sent events over XHR: React Native's `fetch` exposes no response
 * body stream, so `onprogress` plus the cumulative `responseText` is the
 * transport. Idle policy belongs to the consumer.
 */
export function openEventStream(
  url: string,
  options: EventStreamOptions,
  handlers: EventStreamHandlers,
): EventStreamHandle {
  const {signal} = options;
  const xhr = new XMLHttpRequest();
  const parser = new SSEParser();
  let lastProcessedLength = 0;
  let closed = false;

  const onSignalAbort = () => xhr.abort();

  const connectTimer = setTimeout(() => {
    if (finish()) {
      xhr.abort();
      handlers.onConnectTimeout();
    }
  }, options.connectTimeoutMs);

  function finish(): boolean {
    if (closed) {
      return false;
    }
    closed = true;
    clearTimeout(connectTimer);
    signal?.removeEventListener('abort', onSignalAbort);
    return true;
  }

  const unseenText = () => {
    const chunk = xhr.responseText.substring(lastProcessedLength);
    lastProcessedLength = xhr.responseText.length;
    return chunk;
  };

  xhr.open(options.method ?? 'GET', url);
  for (const [key, value] of Object.entries(options.headers)) {
    xhr.setRequestHeader(key, value);
  }

  xhr.onreadystatechange = () => {
    if (closed) {
      return;
    }
    if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
      clearTimeout(connectTimer);
      if (isSuccess(xhr.status)) {
        handlers.onOpen?.();
      }
    }
    if (
      xhr.readyState === XMLHttpRequest.DONE &&
      xhr.status !== 0 &&
      !isSuccess(xhr.status) &&
      finish()
    ) {
      handlers.onHttpError(xhr.status, xhr.responseText);
      xhr.abort();
    }
  };

  xhr.onprogress = () => {
    if (closed || signal?.aborted) {
      lastProcessedLength = xhr.responseText.length;
      return;
    }
    const chunk = unseenText();
    if (chunk) {
      handlers.onEvents(parser.feed(chunk));
    }
  };

  xhr.onload = () => {
    if (!finish()) {
      return;
    }
    const chunk = unseenText();
    if (chunk) {
      handlers.onEvents(parser.feed(chunk));
    }
    handlers.onLoad(parser.flush());
  };

  xhr.onerror = () => {
    if (finish()) {
      handlers.onNetworkError();
    }
  };

  xhr.onabort = () => {
    if (finish()) {
      handlers.onAbort();
    }
  };

  if (signal?.aborted) {
    finish();
    handlers.onAbort();
    return {close: () => {}};
  }
  signal?.addEventListener('abort', onSignalAbort, {once: true});
  xhr.send(options.body);

  return {
    close: () => {
      if (finish()) {
        xhr.abort();
      }
    },
  };
}
