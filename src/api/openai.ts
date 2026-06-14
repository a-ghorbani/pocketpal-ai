import {SSEParser} from './sseParser';
import {
  CompletionResult,
  CompletionStreamData,
  ToolCall,
} from '../utils/completionTypes';

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

/** OpenAI-style function tool definition. Mirrors the shape PACT
 * talents emit via `TalentEngine.toToolDefinition()`. */
export interface OpenAIToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, any>;
  };
}

/** OpenAI tool_choice — `'auto' | 'none' | 'required'` for the simple
 * case, or `{type:'function', function:{name}}` to pin a single tool. */
export type OpenAIToolChoice =
  | 'auto'
  | 'none'
  | 'required'
  | {type: 'function'; function: {name: string}};

/** OpenAI-compatible response_format. `json_schema` is the structured-output
 * mode supported by OpenAI, llama.cpp server, LM Studio, Ollama, and most
 * other compatible servers. `name` is required by OpenAI but ignored by
 * others — we inject a default when the caller doesn't supply one. */
export type OpenAIResponseFormat =
  | {type: 'text'}
  | {type: 'json_object'}
  | {
      type: 'json_schema';
      json_schema: {
        name?: string;
        strict?: boolean;
        schema: object;
      };
    };

/** Parameters for streaming chat completion */
export interface StreamChatParams {
  messages: OpenAIChatMessage[];
  model: string;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stop?: string | string[];
  stream?: boolean;
  tools?: OpenAIToolDefinition[];
  tool_choice?: OpenAIToolChoice;
  response_format?: OpenAIResponseFormat;
}

/**
 * Streamed tool_call state per OpenAI `index`. Arguments are stored
 * as fragments and joined once at end-of-stream — concatenating into
 * a growing string per chunk was O(N²) on long argument payloads
 * (e.g. a multi-KB `render_html` html string).
 */
type ToolCallAccumulator = Map<
  number,
  {
    id: string;
    type: 'function';
    function: {name: string; argsFragments: string[]};
  }
>;

function applyToolCallDelta(
  acc: ToolCallAccumulator,
  deltaCalls: Array<any>,
): ToolCall[] {
  // Per-chunk snapshot: `arguments` is this chunk's fragment only.
  // The consumer reads only `function.name` mid-stream; full args are
  // assembled from the accumulator at xhr.onload.
  const result: ToolCall[] = [];
  for (const delta of deltaCalls) {
    if (typeof delta?.index !== 'number') {
      continue;
    }
    const idx = delta.index;
    const existing = acc.get(idx) ?? {
      id: '',
      type: 'function' as const,
      function: {name: '', argsFragments: [] as string[]},
    };
    if (delta.id) {
      existing.id = delta.id;
    }
    if (delta.function?.name) {
      existing.function.name = delta.function.name;
    }
    const argsDelta: string = delta.function?.arguments ?? '';
    if (argsDelta) {
      existing.function.argsFragments.push(argsDelta);
    }
    acc.set(idx, existing);
    result.push({
      id: existing.id,
      type: existing.type,
      function: {name: existing.function.name, arguments: argsDelta},
    });
  }
  return result;
}

/**
 * Materialise the final tool_calls array from the fragment-based
 * accumulator. Undefined when no tool_calls were seen — mirrors
 * llama.rn's shape.
 */
function assembleFinalToolCalls(
  acc: ToolCallAccumulator,
): ToolCall[] | undefined {
  if (acc.size === 0) {
    return undefined;
  }
  return Array.from(acc.entries())
    .sort(([a], [b]) => a - b)
    .map(([, entry]) => ({
      id: entry.id,
      type: entry.type,
      function: {
        name: entry.function.name,
        arguments: entry.function.argsFragments.join(''),
      },
    }));
}

const CONNECTION_TIMEOUT_MS = 30000;
const IDLE_TIMEOUT_MS = 60000;

/**
 * Single normalization site for a per-server timeout. An undefined, NaN,
 * non-finite, or non-positive value falls back to the supplied default.
 * Callers (stores, engine, sheets) forward raw values; only this layer
 * enforces the floor.
 */
function resolveTimeout(
  timeoutMs: number | undefined,
  fallback: number,
): number {
  if (timeoutMs == null || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return fallback;
  }
  return timeoutMs;
}

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

/** Result from fetchModelsWithHeaders: models + raw response headers. */
export interface FetchModelsResult {
  models: RemoteModelInfo[];
  headers: Record<string, string>;
}

/**
 * Fetch available models and response headers from an OpenAI-compatible server.
 * GET /v1/models
 */
export async function fetchModelsWithHeaders(
  serverUrl: string,
  apiKey?: string,
  timeoutMs?: number,
): Promise<FetchModelsResult> {
  const url = `${normalizeUrl(serverUrl)}/v1/models`;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    resolveTimeout(timeoutMs, CONNECTION_TIMEOUT_MS),
  );

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

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value: string, key: string) => {
      responseHeaders[key] = value;
    });

    const data = await response.json();
    return {
      models: (data.data || []) as RemoteModelInfo[],
      headers: responseHeaders,
    };
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
 * Fetch available models from an OpenAI-compatible server.
 * GET /v1/models
 */
export async function fetchModels(
  serverUrl: string,
  apiKey?: string,
  timeoutMs?: number,
): Promise<RemoteModelInfo[]> {
  const {models} = await fetchModelsWithHeaders(serverUrl, apiKey, timeoutMs);
  return models;
}

/**
 * Test connection to an OpenAI-compatible server.
 * Returns ok status and model count.
 */
export async function testConnection(
  serverUrl: string,
  apiKey?: string,
  timeoutMs?: number,
): Promise<{ok: boolean; modelCount: number; error?: string}> {
  try {
    const models = await fetchModels(serverUrl, apiKey, timeoutMs);
    return {ok: true, modelCount: models.length};
  } catch (error: any) {
    return {ok: false, modelCount: 0, error: error.message || 'Unknown error'};
  }
}

const DETECT_TIMEOUT_MS = 5000;

/**
 * Detect server type from response headers and model metadata.
 * Checks (cheapest first):
 * 1. Server header === 'llama.cpp'
 * 2. Any model owned_by === 'organization_owner' → LM Studio
 * 3. GET / body === 'Ollama is running' → Ollama
 * 4. Unknown → ''
 */
export async function detectServerType(
  serverUrl: string,
  models: RemoteModelInfo[],
  headers: Record<string, string>,
): Promise<string> {
  // 1. llama.cpp sets a Server header
  const serverHeader = headers.server || headers.Server || '';
  if (serverHeader === 'llama.cpp') {
    return 'llama.cpp';
  }

  // 2. LM Studio sets owned_by to 'organization_owner'
  if (models.some(m => m.owned_by === 'organization_owner')) {
    return 'LM Studio';
  }

  // 3. Ollama responds with 'Ollama is running' at GET /
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DETECT_TIMEOUT_MS);
    try {
      const response = await fetch(normalizeUrl(serverUrl), {
        method: 'GET',
        signal: controller.signal,
      });
      const body = await response.text();
      if (body.trim() === 'Ollama is running') {
        return 'Ollama';
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    // Probe failed — not Ollama
  }

  return '';
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
  timeoutMs?: number,
): Promise<CompletionResult> {
  const url = `${normalizeUrl(serverUrl)}/v1/chat/completions`;
  const connectionTimeoutMs = resolveTimeout(timeoutMs, CONNECTION_TIMEOUT_MS);
  const idleTimeoutMs = resolveTimeout(timeoutMs, IDLE_TIMEOUT_MS);

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
    // OpenAI streams partial tool_calls across chunks, indexed by
    // `delta.tool_calls[i].index`. Rebuild the per-call shape here so
    // the final result carries fully formed tool_calls and the streaming
    // callback sees a running snapshot.
    const toolCallAcc: ToolCallAccumulator = new Map();

    // Connection timeout: abort if no headers received in time
    const connectionTimer = setTimeout(() => {
      if (!settled) {
        settled = true;
        xhr.abort();
        reject(new Error('Connection timed out'));
      }
    }, connectionTimeoutMs);

    // Idle timeout: abort if no data received between chunks
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const resetIdleTimer = () => {
      if (idleTimer) {
        clearTimeout(idleTimer);
      }
      idleTimer = setTimeout(() => {
        if (!settled) {
          settled = true;
          cleanup();
          xhr.abort();
          reject(new Error('Idle timeout: no data received'));
        }
      }, idleTimeoutMs);
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
        const reasoningContent =
          delta.reasoning_content || delta.reasoning || '';

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

        // When tool_calls deltas are present, forward a token event so
        // the agent loop can react to a tool call beginning to assemble
        // — same shape llama.rn emits.
        let toolCallsDelta: ToolCall[] | undefined;
        if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
          toolCallsDelta = applyToolCallDelta(toolCallAcc, delta.tool_calls);
        }

        if (
          onToken &&
          (content ||
            reasoningContent ||
            (toolCallsDelta && toolCallsDelta.length > 0))
        ) {
          onToken({
            token: content || reasoningContent,
            // Pass accumulated content to match llama.rn's callback behavior
            // (useChatSession replaces message text, not appends)
            content: fullContent || undefined,
            reasoning_content: fullReasoningContent || undefined,
            tool_calls: toolCallsDelta,
          });
        }
      }
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
        // Headers received — clear connection timeout
        clearTimeout(connectionTimer);

        if (xhr.status !== 200) {
          // Don't reject yet — wait for onload to read the error body
          clearTimeout(connectionTimer);
        } else {
          resetIdleTimer();
        }
      }

      // When the full response is available for non-200 status, read the error body
      if (
        xhr.readyState === XMLHttpRequest.DONE &&
        xhr.status !== 200 &&
        xhr.status !== 0
      ) {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();

        let errorMessage = `Server error: ${xhr.status}`;
        try {
          const errorBody = JSON.parse(xhr.responseText);
          const detail =
            errorBody?.error?.message || errorBody?.error || xhr.responseText;
          errorMessage = `Server error: ${xhr.status} — ${detail}`;
          console.log(
            '[OpenAI] Error:',
            errorBody?.error?.message || errorBody?.error,
          );
        } catch {
          if (xhr.responseText) {
            errorMessage = `Server error: ${xhr.status} — ${xhr.responseText.substring(0, 200)}`;
            console.log(
              '[OpenAI] Error (raw):',
              xhr.responseText.substring(0, 200),
            );
          }
        }

        if (xhr.status === 401) {
          reject(new Error('Unauthorized: Invalid or missing API key'));
        } else {
          reject(new Error(errorMessage));
        }
        xhr.abort();
      }
    };

    xhr.onprogress = () => {
      // After `xhr.abort()` the OS may still deliver bytes already
      // queued in the receive buffer via further onprogress firings.
      // Drop them — but consume the offset so onload (if it ever
      // fires) doesn't double-process them.
      if (signal?.aborted) {
        lastProcessedLength = xhr.responseText.length;
        return;
      }
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
        if (delta.reasoning_content || delta.reasoning) {
          fullReasoningContent += delta.reasoning_content || delta.reasoning;
        }
        if (choice.finish_reason) {
          finishReason = choice.finish_reason;
        }
        if (parsed.timings) {
          serverTimings = parsed.timings;
        }
        if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
          applyToolCallDelta(toolCallAcc, delta.tool_calls);
        }
      }

      // Mirror llama.rn's shape: undefined when no tool_calls were
      // observed during the stream.
      const finalToolCalls = assembleFinalToolCalls(toolCallAcc);

      // Build result
      if (signal?.aborted) {
        resolve({
          text: fullContent,
          content: fullContent,
          reasoning_content: fullReasoningContent || undefined,
          tool_calls: finalToolCalls,
          tokens_predicted: tokensPredicted,
          interrupted: true,
        });
        return;
      }

      const result: CompletionResult = {
        text: fullContent,
        content: fullContent,
        reasoning_content: fullReasoningContent || undefined,
        tool_calls: finalToolCalls,
        tokens_predicted: tokensPredicted,
        timings: serverTimings,
      };

      switch (finishReason) {
        case 'stop':
          result.stopped_eos = true;
          break;
        case 'tool_calls':
          // OpenAI emits finish_reason="tool_calls" when the model
          // chose to call tools instead of producing a final answer.
          // Treat as a normal stop — the agent loop reads .tool_calls
          // off the result and dispatches the next turn.
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

    // Only include params with meaningful values — some providers (e.g. OpenAI
    // with newer models) reject unsupported or empty params with 400 errors.
    const requestBody: Record<string, any> = {
      model: params.model,
      messages: params.messages,
      stream: true,
    };
    if (params.temperature != null) {
      requestBody.temperature = params.temperature;
    }
    if (params.top_p != null) {
      requestBody.top_p = params.top_p;
    }
    if (params.max_tokens != null) {
      requestBody.max_completion_tokens = params.max_tokens;
    }
    if (params.stop && params.stop.length > 0) {
      requestBody.stop = params.stop;
    }
    // Only attach when the caller actually supplied them — empty arrays
    // cause some servers (and their schema validators) to choke.
    if (params.tools && params.tools.length > 0) {
      requestBody.tools = params.tools;
    }
    if (params.tool_choice !== undefined) {
      requestBody.tool_choice = params.tool_choice;
    }
    if (params.response_format) {
      // OpenAI requires `name` inside json_schema; llama.cpp / Ollama /
      // LM Studio ignore it. Inject a default so the same call works
      // everywhere.
      if (
        params.response_format.type === 'json_schema' &&
        !params.response_format.json_schema.name
      ) {
        requestBody.response_format = {
          ...params.response_format,
          json_schema: {
            ...params.response_format.json_schema,
            name: 'response',
          },
        };
      } else {
        requestBody.response_format = params.response_format;
      }
    }
    xhr.send(JSON.stringify(requestBody));
  });
}
