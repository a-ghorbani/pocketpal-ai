import type {
  CompletionResult,
  CompletionStreamData,
} from '../utils/completionTypes';
import {
  buildHeaders,
  buildOpenAIUrl,
  encodeMessagesForRemote,
  hasLocalImageAttachment,
} from './openai';
import {
  encodeResponsesRequest,
  type ResponsesRequestOptions,
  type ResponsesRequestParams,
} from './responsesRequest';
import {
  createResponsesDiagnostics,
  responsesDiagnosticsController,
  type ResponsesDiagnosticObserver,
} from './responsesDiagnostics';
import {
  ResponsesStreamReducer,
  type ResponsesStreamEvent,
} from './responsesStream';
import type {ResponsesProviderBinding} from './responsesTypes';
import {FramedSSEParser} from './sseParser';
import {
  resolveRequestTimeout,
  StopSequenceMatcher,
  xhrHttpError,
} from './xhrStream';

const CONNECTION_TIMEOUT_MS = 30000;
const IDLE_TIMEOUT_MS = 60000;

function interruptedResult(
  snapshot: CompletionStreamData,
  content: string,
  stoppedWord?: string,
): CompletionResult {
  return {
    text: content,
    content,
    reasoning_content: snapshot.reasoning_content,
    tool_calls: snapshot.tool_calls,
    interrupted: true,
    ...(stoppedWord ? {stopped_word: stoppedWord} : {}),
  };
}

/**
 * Streams an OpenAI Responses request over React Native XMLHttpRequest.
 * `binding` is persisted only after a reducer-validated completed response.
 */
export async function streamResponses(
  params: ResponsesRequestParams,
  serverUrl: string,
  apiKey: string | undefined,
  signal: AbortSignal | undefined,
  onToken: ((data: CompletionStreamData) => void) | undefined,
  timeoutMs: number | undefined,
  serverType: string | undefined,
  binding: ResponsesProviderBinding,
  requestOptions: ResponsesRequestOptions = {},
  diagnosticObserver?: ResponsesDiagnosticObserver,
): Promise<CompletionResult> {
  const diagnostics = createResponsesDiagnostics(
    diagnosticObserver ?? responsesDiagnosticsController.observer,
  );
  diagnostics?.request(params, requestOptions);
  if (signal?.aborted) {
    diagnostics?.finish('aborted');
    throw new Error('Completion aborted');
  }

  let url: string;
  let encodedMessages: ResponsesRequestParams['messages'];
  let requestBody: ReturnType<typeof encodeResponsesRequest>;
  try {
    url = buildOpenAIUrl(serverUrl, 'responses', serverType);
    encodedMessages = hasLocalImageAttachment(params.messages)
      ? await encodeMessagesForRemote(params.messages, signal)
      : params.messages;
    if (signal?.aborted) {
      diagnostics?.finish('aborted');
      throw new Error('Completion aborted');
    }
    requestBody = encodeResponsesRequest(
      {...params, messages: encodedMessages},
      requestOptions,
    );
  } catch (error) {
    diagnostics?.error(error);
    throw error;
  }
  if (signal?.aborted) {
    diagnostics?.finish('aborted');
    throw new Error('Completion aborted');
  }

  const connectionTimeoutMs = resolveRequestTimeout(
    timeoutMs,
    CONNECTION_TIMEOUT_MS,
  );
  const idleTimeoutMs = resolveRequestTimeout(timeoutMs, IDLE_TIMEOUT_MS);

  return new Promise<CompletionResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const parser = new FramedSSEParser<ResponsesStreamEvent>();
    const reducer = new ResponsesStreamReducer(
      diagnostics,
      binding.serverType === 'GitHub Copilot'
        ? {providerProfile: 'github-copilot'}
        : undefined,
    );
    const stopMatcher = new StopSequenceMatcher(params.stop);
    let lastProcessedLength = 0;
    let latestSnapshot: CompletionStreamData = {
      token: '',
      accumulated_text: '',
    };
    let settled = false;
    let externallyAborted = false;
    let lastProjectedContent = '';
    let idleTimer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      clearTimeout(connectionTimer);
      if (idleTimer !== undefined) {
        clearTimeout(idleTimer);
        idleTimer = undefined;
      }
      signal?.removeEventListener('abort', onAbort);
    };

    const settleResolve = (result: CompletionResult) => {
      if (settled) {
        return;
      }
      settled = true;
      diagnostics?.finish(result.interrupted ? 'interrupted' : 'completed');
      cleanup();
      resolve(result);
    };

    const settleReject = (error: unknown, errorClass?: 'http') => {
      if (settled) {
        return;
      }
      settled = true;
      diagnostics?.error(error, errorClass);
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    const abortAfterSettlement = () => {
      try {
        xhr.abort();
      } catch {
        // Settlement is already final; abort is best-effort cleanup.
      }
    };

    const resetIdleTimer = () => {
      if (settled) {
        return;
      }
      if (idleTimer !== undefined) {
        clearTimeout(idleTimer);
      }
      idleTimer = setTimeout(() => {
        if (settled) {
          return;
        }
        settleReject(new Error('Idle timeout: no data received'));
        abortAfterSettlement();
      }, idleTimeoutMs);
    };

    const emitSnapshot = (snapshot: CompletionStreamData): boolean => {
      latestSnapshot = snapshot;
      const projection = stopMatcher.project(snapshot.accumulated_text ?? '');
      const projected = {
        ...snapshot,
        content: projection.content || undefined,
        accumulated_text: projection.content,
      };
      lastProjectedContent = projection.content;

      if (projection.matched) {
        if (onToken && !settled && !externallyAborted) {
          onToken(projected);
        }
        settleResolve(
          interruptedResult(snapshot, projection.content, projection.matched),
        );
        abortAfterSettlement();
        return false;
      }

      if (onToken && !settled && !externallyAborted) {
        onToken(projected);
      }
      return !settled;
    };

    const reduceEvent = (event: ResponsesStreamEvent): boolean => {
      resetIdleTimer();
      const snapshot = reducer.reduce(event);
      return snapshot ? emitSnapshot(snapshot) : true;
    };

    const processEvents = (
      events: Iterable<{data: ResponsesStreamEvent}>,
    ): boolean => {
      for (const framed of events) {
        if (settled || externallyAborted) {
          return false;
        }
        if (!reduceEvent(framed.data)) {
          return false;
        }
      }
      return true;
    };

    const onAbort = () => {
      if (settled) {
        return;
      }
      externallyAborted = true;
      diagnostics?.finish('aborted');
      const content = latestSnapshot.accumulated_text ?? '';
      settleResolve(interruptedResult(latestSnapshot, content));
      abortAfterSettlement();
    };

    const connectionTimer = setTimeout(() => {
      if (settled) {
        return;
      }
      settleReject(new Error('Connection timed out'));
      abortAfterSettlement();
    }, connectionTimeoutMs);

    try {
      xhr.open('POST', url);
      for (const [key, value] of Object.entries(
        buildHeaders(apiKey, serverType),
      )) {
        xhr.setRequestHeader(key, value);
      }

      xhr.onreadystatechange = () => {
        if (settled) {
          return;
        }
        if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
          clearTimeout(connectionTimer);
          diagnostics?.http(xhr.status);
          if (xhr.status === 200) {
            resetIdleTimer();
          }
        }
        if (
          xhr.readyState === XMLHttpRequest.DONE &&
          xhr.status !== 200 &&
          xhr.status !== 0
        ) {
          settleReject(xhrHttpError(xhr.status, xhr.responseText), 'http');
          abortAfterSettlement();
        }
      };

      xhr.onprogress = () => {
        if (settled || externallyAborted) {
          lastProcessedLength = xhr.responseText.length;
          return;
        }
        const chunk = xhr.responseText.substring(lastProcessedLength);
        lastProcessedLength = xhr.responseText.length;
        if (!chunk) {
          return;
        }
        resetIdleTimer();
        try {
          processEvents(parser.feed(chunk));
        } catch (error) {
          settleReject(error);
          abortAfterSettlement();
        }
      };

      xhr.onload = () => {
        if (settled || externallyAborted) {
          return;
        }
        if (xhr.status !== 200) {
          settleReject(xhrHttpError(xhr.status, xhr.responseText));
          return;
        }
        try {
          const remaining = xhr.responseText.substring(lastProcessedLength);
          lastProcessedLength = xhr.responseText.length;
          if (remaining && !processEvents(parser.feed(remaining))) {
            return;
          }
          if (!processEvents(parser.flush())) {
            return;
          }
          const result = reducer.finish(binding).result;
          if (onToken && !settled && result.content !== lastProjectedContent) {
            const finalSnapshot = reducer.snapshot();
            onToken({
              ...finalSnapshot,
              content: result.content || undefined,
              accumulated_text: result.content,
            });
          }
          settleResolve(result);
        } catch (error) {
          settleReject(error);
        }
      };

      xhr.onerror = () => {
        if (!settled) {
          settleReject(
            externallyAborted
              ? new Error('Completion aborted')
              : new Error('Network error'),
          );
        }
      };

      xhr.onabort = () => {
        if (!settled && externallyAborted) {
          const content = latestSnapshot.accumulated_text ?? '';
          settleResolve(interruptedResult(latestSnapshot, content));
        }
      };

      signal?.addEventListener('abort', onAbort, {once: true});
      if (signal?.aborted) {
        onAbort();
        return;
      }
      xhr.send(JSON.stringify(requestBody));
    } catch (error) {
      settleReject(error);
      abortAfterSettlement();
    }
  });
}
