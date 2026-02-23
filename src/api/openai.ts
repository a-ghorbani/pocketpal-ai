import {SSEParser} from './sseParser';
import {CompletionResult, CompletionStreamData} from '../utils/completionTypes';
import {ChatMessage} from '../utils/types';

/** Raw API response shape from OpenAI /v1/models */
export interface RemoteModelInfo {
  id: string;
  object: string;
  owned_by: string;
}

/** Parameters for streaming chat completion */
export interface StreamChatParams {
  messages: ChatMessage[];
  model: string;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stop?: string | string[];
  stream?: boolean;
}

const CONNECTION_TIMEOUT_MS = 30000;
const IDLE_TIMEOUT_MS = 60000;

/**
 * Lightweight type guard for SSE delta shape.
 * Returns true if the parsed object looks like an OpenAI chat completion chunk.
 */
function isValidChatChunk(parsed: any): boolean {
  if (!parsed || typeof parsed !== 'object') {
    return false;
  }
  if (!Array.isArray(parsed.choices) || parsed.choices.length === 0) {
    return false;
  }
  const choice = parsed.choices[0];
  // delta may be empty object {} or contain content/reasoning_content
  return choice.delta !== undefined || choice.finish_reason !== undefined;
}

/**
 * Build headers for OpenAI-compatible API requests.
 */
function buildHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

/**
 * Normalize server URL: remove trailing slash.
 */
function normalizeUrl(serverUrl: string): string {
  return serverUrl.replace(/\/+$/, '');
}

/**
 * Fetch available models from an OpenAI-compatible server.
 * GET /v1/models
 */
export async function fetchModels(
  serverUrl: string,
  apiKey?: string,
): Promise<RemoteModelInfo[]> {
  const url = `${normalizeUrl(serverUrl)}/v1/models`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: buildHeaders(apiKey),
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthorized: Invalid or missing API key');
      }
      throw new Error(`Server error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return (data.data || []) as RemoteModelInfo[];
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error('Connection timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Test connection to an OpenAI-compatible server.
 * Returns ok status and model count.
 */
export async function testConnection(
  serverUrl: string,
  apiKey?: string,
): Promise<{ok: boolean; modelCount: number; error?: string}> {
  try {
    const models = await fetchModels(serverUrl, apiKey);
    return {ok: true, modelCount: models.length};
  } catch (error: any) {
    return {ok: false, modelCount: 0, error: error.message || 'Unknown error'};
  }
}

/**
 * Stream a chat completion from an OpenAI-compatible server.
 * POST /v1/chat/completions with stream: true
 *
 * Uses fetch + ReadableStream + SSEParser for efficient token-by-token streaming.
 * Implements connection timeout (30s) and idle timeout (60s between events).
 */
export async function streamChatCompletion(
  params: StreamChatParams,
  serverUrl: string,
  apiKey?: string,
  signal?: AbortSignal,
  onToken?: (data: CompletionStreamData) => void,
): Promise<CompletionResult> {
  const url = `${normalizeUrl(serverUrl)}/v1/chat/completions`;

  // Connection timeout: abort if no response within 30s
  const connectionController = new AbortController();
  const connectionTimeout = setTimeout(
    () => connectionController.abort(),
    CONNECTION_TIMEOUT_MS,
  );

  // Combine external signal with connection timeout
  const combinedSignal = signal
    ? combineAbortSignals(signal, connectionController.signal)
    : connectionController.signal;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        temperature: params.temperature,
        top_p: params.top_p,
        max_tokens: params.max_tokens,
        stop: params.stop,
        stream: true,
      }),
      signal: combinedSignal,
    });
  } catch (error: any) {
    if (error.name === 'AbortError') {
      if (signal?.aborted) {
        throw new Error('Completion aborted');
      }
      throw new Error('Connection timed out');
    }
    throw error;
  } finally {
    clearTimeout(connectionTimeout);
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized: Invalid or missing API key');
    }
    const errorText = await response.text().catch(() => '');
    throw new Error(
      `Server error: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`,
    );
  }

  // Stream SSE events from the response body
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  const decoder = new TextDecoder();
  const parser = new SSEParser();
  let fullContent = '';
  let fullReasoningContent = '';
  let finishReason: string | null = null;
  let tokensPredicted = 0;

  // Idle timeout: reset on each SSE event
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const resetIdleTimer = () => {
    if (idleTimer) {
      clearTimeout(idleTimer);
    }
    idleTimer = setTimeout(() => {
      reader.cancel();
    }, IDLE_TIMEOUT_MS);
  };

  try {
    resetIdleTimer();

    while (true) {
      const {done, value} = await reader.read();
      if (done) {
        break;
      }

      // Check if externally aborted
      if (signal?.aborted) {
        reader.cancel();
        break;
      }

      const chunk = decoder.decode(value, {stream: true});

      for (const event of parser.feed(chunk)) {
        if (event === 'done') {
          break;
        }

        if (!isValidChatChunk(event)) {
          if (__DEV__) {
            console.warn('Skipping malformed SSE event:', event);
          }
          continue;
        }

        resetIdleTimer();

        const parsed = event as any;
        const choice = parsed.choices[0];
        const delta = choice.delta || {};
        const content = delta.content || '';
        const reasoningContent = delta.reasoning_content || '';

        if (content) {
          fullContent += content;
          tokensPredicted++;
        }
        if (reasoningContent) {
          fullReasoningContent += reasoningContent;
        }

        if (choice.finish_reason) {
          finishReason = choice.finish_reason;
        }

        if (onToken && (content || reasoningContent)) {
          onToken({
            token: content || reasoningContent,
            content: content || undefined,
            reasoning_content: reasoningContent || undefined,
          });
        }
      }
    }

    // Flush remaining buffer
    for (const event of parser.flush()) {
      if (event === 'done') {
        break;
      }
      if (!isValidChatChunk(event)) {
        continue;
      }
      const parsed = event as any;
      const choice = parsed.choices[0];
      const delta = choice.delta || {};
      if (delta.content) {
        fullContent += delta.content;
        tokensPredicted++;
      }
      if (delta.reasoning_content) {
        fullReasoningContent += delta.reasoning_content;
      }
      if (choice.finish_reason) {
        finishReason = choice.finish_reason;
      }
    }
  } finally {
    if (idleTimer) {
      clearTimeout(idleTimer);
    }
  }

  // If externally aborted mid-stream, return what we have
  if (signal?.aborted) {
    return {
      text: fullContent,
      content: fullContent,
      reasoning_content: fullReasoningContent || undefined,
      tokens_predicted: tokensPredicted,
      interrupted: true,
    };
  }

  // Map finish_reason to CompletionResult fields
  const result: CompletionResult = {
    text: fullContent,
    content: fullContent,
    reasoning_content: fullReasoningContent || undefined,
    tokens_predicted: tokensPredicted,
  };

  switch (finishReason) {
    case 'stop':
      result.stopped_eos = true;
      break;
    case 'length':
      result.stopped_limit = 1;
      break;
    case 'content_filter':
      result.interrupted = true;
      break;
  }

  return result;
}

/**
 * Combine multiple AbortSignals into one.
 * Aborts when any of the input signals abort.
 */
function combineAbortSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const sig of signals) {
    if (sig.aborted) {
      controller.abort();
      return controller.signal;
    }
    sig.addEventListener('abort', () => controller.abort(), {once: true});
  }
  return controller.signal;
}
