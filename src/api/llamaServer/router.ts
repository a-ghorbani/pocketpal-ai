import {openEventStream} from '../eventStream';
import {
  CONNECTION_TIMEOUT_MS,
  buildHeaders,
  fetchWithTimeout,
  normalizeUrl,
  resolveTimeout,
} from '../http';

/**
 * llama-server router mode: model management beside the OpenAI-compatible
 * surface. A `200 {"success":true}` means accepted, not done, so no answer
 * here is an outcome; a non-2xx resolves rather than throws, and the caller
 * decides from the status and the model's row, never from the wording.
 */

export interface RouterTarget {
  url: string;
  apiKey?: string;
  timeoutMs?: number;
}

export interface RouterPostResult {
  status: number;
  body: unknown;
}

async function postModelOp(
  target: RouterTarget,
  path: string,
  model: string,
  signal: AbortSignal,
): Promise<RouterPostResult> {
  const response = await fetchWithTimeout(
    `${normalizeUrl(target.url)}${path}`,
    {
      method: 'POST',
      headers: buildHeaders(target.apiKey),
      body: JSON.stringify({model}),
    },
    {
      timeoutMs: resolveTimeout(target.timeoutMs, CONNECTION_TIMEOUT_MS),
      signal,
    },
  );
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return {status: response.status, body};
}

export function postLoad(
  target: RouterTarget,
  model: string,
  signal: AbortSignal,
): Promise<RouterPostResult> {
  return postModelOp(target, '/models/load', model, signal);
}

export function postUnload(
  target: RouterTarget,
  model: string,
  signal: AbortSignal,
): Promise<RouterPostResult> {
  return postModelOp(target, '/models/unload', model, signal);
}

export interface RouterEventsHandlers {
  onOpen: () => void;
  onEvent: (payload: object) => void;
  /**
   * The stream ended without the caller closing it. `status` is present only
   * for an HTTP answer other than 2xx, as a number.
   */
  onEnd: (status?: number) => void;
}

export interface RouterEventsHandle {
  close(): void;
}

/**
 * `GET /models/sse`. No idle timeout: a quiet router is a healthy one, and
 * liveness is judged elsewhere from list reads.
 */
export function openRouterEvents(
  target: RouterTarget,
  handlers: RouterEventsHandlers,
): RouterEventsHandle {
  const deliver = (events: Iterable<object | 'done'>) => {
    for (const event of events) {
      if (event !== 'done') {
        handlers.onEvent(event);
      }
    }
  };
  return openEventStream(
    `${normalizeUrl(target.url)}/models/sse`,
    {
      headers: {
        ...buildHeaders(target.apiKey),
        Accept: 'text/event-stream',
      },
      connectTimeoutMs: resolveTimeout(target.timeoutMs, CONNECTION_TIMEOUT_MS),
    },
    {
      onOpen: handlers.onOpen,
      onEvents: deliver,
      onLoad: flushed => {
        deliver(flushed);
        handlers.onEnd();
      },
      onHttpError: status => handlers.onEnd(status),
      onNetworkError: () => handlers.onEnd(),
      onConnectTimeout: () => handlers.onEnd(),
      onAbort: () => handlers.onEnd(),
    },
  );
}
