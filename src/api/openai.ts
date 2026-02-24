import {SSEParser} from './sseParser';
import {CompletionResult, CompletionStreamData} from '../utils/completionTypes';

/** Raw API response shape from OpenAI /v1/models */
export interface RemoteModelInfo {
  id: string;
  object: string;
  owned_by: string;
}

/** Chat message type compatible with OpenAI API format */
export interface OpenAIChatMessage {
  role: string;
  content?:
    | string
    | Array<{type: string; text?: string; image_url?: {url?: string}}>;
}

/** Parameters for streaming chat completion */
export interface StreamChatParams {
  messages: OpenAIChatMessage[];
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
      throw new Error(
        `Server error: ${response.status} ${response.statusText}`,
      );
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
 * Uses XMLHttpRequest with incremental events for React Native compatibility.
 * React Native's fetch does not expose response.body (ReadableStream), so
 * XMLHttpRequest with onprogress is the standard approach for SSE streaming.
 */
export async function streamChatCompletion(
  params: StreamChatParams,
  serverUrl: string,
  apiKey?: string,
  signal?: AbortSignal,
  onToken?: (data: CompletionStreamData) => void,
): Promise<CompletionResult> {
  const url = `${normalizeUrl(serverUrl)}/v1/chat/completions`;

  return new Promise<CompletionResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);

    // Set headers
    const headers = buildHeaders(apiKey);
    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }

    const parser = new SSEParser();
    let fullContent = '';
    let fullReasoningContent = '';
    let finishReason: string | null = null;
    let tokensPredicted = 0;
    let lastProcessedLength = 0;
    let settled = false;
    let serverTimings: CompletionResult['timings'] | undefined;

    // Connection timeout: abort if no headers received within 30s
    const connectionTimer = setTimeout(() => {
      if (!settled) {
        settled = true;
        xhr.abort();
        reject(new Error('Connection timed out'));
      }
    }, CONNECTION_TIMEOUT_MS);

    // Idle timeout: abort if no data received within 60s
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const resetIdleTimer = () => {
      if (idleTimer) {
        clearTimeout(idleTimer);
      }
      idleTimer = setTimeout(() => {
        xhr.abort();
      }, IDLE_TIMEOUT_MS);
    };

    // Handle external abort signal
    const onAbort = () => {
      xhr.abort();
    };
    if (signal) {
      if (signal.aborted) {
        reject(new Error('Completion aborted'));
        return;
      }
      signal.addEventListener('abort', onAbort, {once: true});
    }

    const cleanup = () => {
      clearTimeout(connectionTimer);
      if (idleTimer) {
        clearTimeout(idleTimer);
      }
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
    };

    /**
     * Process new SSE data from the response.
     * Called from onprogress with the new text chunk.
     */
    const processChunk = (chunk: string) => {
      for (const event of parser.feed(chunk)) {
        if (event === 'done') {
          return;
        }

        if (!isValidChatChunk(event)) {
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

        // Extract server-side timings (llama.cpp includes these at event level)
        if (parsed.timings) {
          serverTimings = parsed.timings;
        }

        if (onToken && (content || reasoningContent)) {
          onToken({
            token: content || reasoningContent,
            // Pass accumulated content to match llama.rn's callback behavior
            // (useChatSession replaces message text, not appends)
            content: fullContent || undefined,
            reasoning_content: fullReasoningContent || undefined,
          });
        }
      }
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
        // Headers received — clear connection timeout
        clearTimeout(connectionTimer);

        if (xhr.status !== 200) {
          settled = true;
          cleanup();
          if (xhr.status === 401) {
            reject(new Error('Unauthorized: Invalid or missing API key'));
          } else {
            reject(new Error(`Server error: ${xhr.status} ${xhr.statusText}`));
          }
          xhr.abort();
        } else {
          resetIdleTimer();
        }
      }
    };

    xhr.onprogress = () => {
      // Extract only the new data since last onprogress
      const newText = xhr.responseText.substring(lastProcessedLength);
      lastProcessedLength = xhr.responseText.length;

      if (newText) {
        processChunk(newText);
      }
    };

    xhr.onload = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();

      // Process any remaining data not yet seen in onprogress
      const remaining = xhr.responseText.substring(lastProcessedLength);
      if (remaining) {
        processChunk(remaining);
      }

      // Flush the SSE parser buffer
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
        if (parsed.timings) {
          serverTimings = parsed.timings;
        }
      }

      // Build result
      if (signal?.aborted) {
        resolve({
          text: fullContent,
          content: fullContent,
          reasoning_content: fullReasoningContent || undefined,
          tokens_predicted: tokensPredicted,
          interrupted: true,
        });
        return;
      }

      const result: CompletionResult = {
        text: fullContent,
        content: fullContent,
        reasoning_content: fullReasoningContent || undefined,
        tokens_predicted: tokensPredicted,
        timings: serverTimings,
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

      resolve(result);
    };

    xhr.onerror = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();

      if (signal?.aborted) {
        reject(new Error('Completion aborted'));
      } else {
        reject(new Error('Network error'));
      }
    };

    xhr.onabort = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();

      if (signal?.aborted) {
        // Externally aborted — resolve with partial content
        resolve({
          text: fullContent,
          content: fullContent,
          reasoning_content: fullReasoningContent || undefined,
          tokens_predicted: tokensPredicted,
          interrupted: true,
        });
      }
      // If not externally aborted, the reject was already called
      // by the timeout handler that triggered xhr.abort()
    };

    xhr.send(
      JSON.stringify({
        model: params.model,
        messages: params.messages,
        temperature: params.temperature,
        top_p: params.top_p,
        max_tokens: params.max_tokens,
        stop: params.stop,
        stream: true,
      }),
    );
  });
}
