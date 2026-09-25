import * as RNFS from '@dr.pogodin/react-native-fs';

import {SSEParser} from './sseParser';
import {
  CompletionResult,
  CompletionStreamData,
  ReasoningIntent,
  ToolCall,
} from '../utils/completionTypes';
import {RemoteModelInfo} from '../utils/types';
import {
  CONNECTION_TIMEOUT_MS,
  IDLE_TIMEOUT_MS,
  buildHeaders,
  normalizeUrl,
  resolveTimeout,
} from './http';
import {bodyExtras, readFinish} from './servers';
import type {FinishRead, RemoteEndpoint} from './servers';
import type {Samplers} from '../utils/samplerParams';

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
  /** Every sampler the caller wants forwarded, under the app's own names. */
  samplers: Samplers;
  stop?: string | string[];
  stream?: boolean;
  tools?: OpenAIToolDefinition[];
  tool_choice?: OpenAIToolChoice;
  response_format?: OpenAIResponseFormat;
  /** Reasoning on/off + effort intent; translated to a per-serverType payload. */
  reasoning?: ReasoningIntent;
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

/** Result from fetchModelsWithHeaders: models + raw response headers. */
export interface FetchModelsResult {
  models: RemoteModelInfo[];
  headers: Record<string, string>;
}

/**
 * A single-model llama.cpp server describes its model twice: once in `data[]`
 * and once in a sibling `models[]` array, which is the only one carrying
 * `capabilities`. Joining them here keeps the two halves of one row together
 * for every caller. Servers that emit no `models[]` are unaffected.
 */
function liftModelEntryCapabilities(
  rows: RemoteModelInfo[],
  entries: unknown,
): RemoteModelInfo[] {
  if (!Array.isArray(entries) || entries.length === 0) {
    return rows;
  }
  return rows.map(row => {
    const entry =
      (row.id
        ? entries.find(e => (e?.name ?? e?.model) === row.id)
        : undefined) ??
      (rows.length === 1 && entries.length === 1 ? entries[0] : undefined);
    return entry?.capabilities
      ? {...row, capabilities: entry.capabilities}
      : row;
  });
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
      models: liftModelEntryCapabilities(
        (data.data || []) as RemoteModelInfo[],
        data.models,
      ),
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

/** A local image path needs inlining: not already a data: or http(s): url. */
function isLocalImageUrl(url: string | undefined): url is string {
  return (
    !!url &&
    !url.startsWith('data:') &&
    !url.startsWith('http://') &&
    !url.startsWith('https://')
  );
}

/** True when any message carries a local-path image that must be encoded. */
function hasLocalImageAttachment(messages: OpenAIChatMessage[]): boolean {
  return messages.some(
    m =>
      Array.isArray(m.content) &&
      m.content.some(part => isLocalImageUrl(part.image_url?.url)),
  );
}

// Skip inlining a file larger than this — base64 inflates ~33% and the whole
// buffer is held in memory, so a huge attachment would spike heap on low-RAM
// devices. The image is left unchanged and the server surfaces the failure.
const REMOTE_IMAGE_MAX_BYTES = 12 * 1024 * 1024;

// Bound the encode-once cache by total encoded-string bytes (evict-oldest)
// rather than entry count: a handful of large base64 buffers must not pin
// excessive resident heap.
const REMOTE_IMAGE_CACHE_BYTES = 24 * 1024 * 1024;

// Extension → data-URI MIME. A bare `image/${ext}` produced invalid types
// (image/jpg, image// for dotless / content:// paths). Unknown extensions fall
// back to image/jpeg.
const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  bmp: 'image/bmp',
};

function mimeForPath(path: string): string {
  const ext = path.toLowerCase().split('.').pop() ?? '';
  return EXT_MIME[ext] ?? 'image/jpeg';
}

// Encoded local images keyed by path so a multi-turn history re-sends without
// re-reading each file from disk (chat.ts re-emits the same stored path across
// turns, so a history image encodes at most once).
const remoteImageCache = new Map<string, string>();
let remoteImageCacheBytes = 0;

function cacheRemoteImage(path: string, dataUri: string): void {
  if (remoteImageCache.has(path)) {
    return;
  }
  remoteImageCache.set(path, dataUri);
  remoteImageCacheBytes += dataUri.length;
  for (const [oldestPath, oldestUri] of remoteImageCache) {
    if (remoteImageCacheBytes <= REMOTE_IMAGE_CACHE_BYTES) {
      break;
    }
    remoteImageCache.delete(oldestPath);
    remoteImageCacheBytes -= oldestUri.length;
  }
}

/** Test-only: reset the encode-once remote-image cache between cases. */
export function __clearRemoteImageCache(): void {
  remoteImageCache.clear();
  remoteImageCacheBytes = 0;
}

/**
 * Encode a single content part's local image path to a data URI. Returns the
 * part unchanged when it is not a local image, when a successful stat reports
 * an over-cap file, or when the read fails. A stat throw or a size-less result
 * FALLS THROUGH to encoding so a healthy image is never dropped on a stat
 * hiccup — only a successful over-cap stat skips.
 */
async function encodeImagePart(part: {
  type: string;
  text?: string;
  image_url?: {url?: string};
}): Promise<typeof part> {
  const url = part.image_url?.url;
  if (!isLocalImageUrl(url)) {
    return part;
  }
  const path = url.replace(/^file:\/\//, '');

  const cached = remoteImageCache.get(path);
  if (cached) {
    return {...part, image_url: {url: cached}};
  }

  try {
    const info = await RNFS.stat(path);
    if (typeof info?.size === 'number' && info.size > REMOTE_IMAGE_MAX_BYTES) {
      return part;
    }
  } catch {
    // stat unavailable — encode anyway rather than drop a healthy image.
  }

  try {
    const base64 = await RNFS.readFile(path, 'base64');
    const dataUri = `data:${mimeForPath(path)};base64,${base64}`;
    cacheRemoteImage(path, dataUri);
    return {...part, image_url: {url: dataUri}};
  } catch (error) {
    // Leave the part unchanged; the server surfaces the failure on the
    // existing completion-error path.
    console.warn('Failed to encode image for remote server:', error);
    return part;
  }
}

/**
 * Encode local image attachments to data: URIs for the remote wire. A remote
 * server cannot read the device filesystem, so any image_url pointing at a
 * local path is read and inlined as base64. Already-remote (http/https) or
 * already-inlined (data:) urls pass through unchanged. Remote-only: the local
 * llama.rn engine reads the file path natively and never routes through here.
 *
 * Encodes sequentially (outer messages and inner parts) so peak heap is one
 * base64 buffer at a time on a long or multi-image history.
 */
async function encodeMessagesForRemote(
  messages: OpenAIChatMessage[],
): Promise<OpenAIChatMessage[]> {
  const encoded: OpenAIChatMessage[] = [];
  for (const message of messages) {
    if (!Array.isArray(message.content)) {
      encoded.push(message);
      continue;
    }
    const content: typeof message.content = [];
    for (const part of message.content) {
      content.push(await encodeImagePart(part));
    }
    encoded.push({...message, content});
  }
  return encoded;
}

/**
 * The keys the transport owns. It writes them after the profile's, so a
 * profile naming one would be silently overwritten — which is why the list is
 * the type of the transport's own body rather than a copy kept beside it.
 */
export const TRANSPORT_BODY_KEYS = [
  'model',
  'messages',
  'stream',
  'stop',
  'tools',
  'tool_choice',
  'response_format',
] as const;

export type TransportBodyKey = (typeof TRANSPORT_BODY_KEYS)[number];

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
  endpoint: RemoteEndpoint,
  signal?: AbortSignal,
  onToken?: (data: CompletionStreamData) => void,
): Promise<CompletionResult> {
  const {apiKey, serverType, timeoutMs} = endpoint;
  const url = `${normalizeUrl(endpoint.url)}/v1/chat/completions`;
  const connectionTimeoutMs = resolveTimeout(timeoutMs, CONNECTION_TIMEOUT_MS);
  const idleTimeoutMs = resolveTimeout(timeoutMs, IDLE_TIMEOUT_MS);
  // Only pay the async encode when a local image is actually attached; the
  // common text path stays synchronous so callers see the request built in the
  // same tick.
  const encodedMessages = hasLocalImageAttachment(params.messages)
    ? await encodeMessagesForRemote(params.messages)
    : params.messages;

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
    let serverFinish: FinishRead | undefined;
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
     * Fold one validated chunk into the accumulated turn and hand back its own
     * delta. Every event goes through here, whether it arrived via onprogress
     * or was left in the parser buffer for the flush at onload.
     */
    const accumulateChunk = (parsed: any) => {
      const choice = parsed.choices[0];
      const delta = choice.delta || {};
      const content = delta.content || '';
      const reasoningContent = delta.reasoning_content || delta.reasoning || '';

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

      // The latest chunk that carries timings wins, whatever its
      // finish_reason.
      const finish = readFinish(parsed);
      if (finish.timings) {
        serverFinish = finish;
      }

      let toolCallsDelta: ToolCall[] | undefined;
      if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
        toolCallsDelta = applyToolCallDelta(toolCallAcc, delta.tool_calls);
      }

      return {content, reasoningContent, toolCallsDelta};
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

        const {content, reasoningContent, toolCallsDelta} =
          accumulateChunk(event);

        // A tool_calls delta gets a token event of its own so the agent loop
        // can react to a call beginning to assemble — same shape llama.rn emits.
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

      // Flush the SSE parser buffer: a server that closes the stream on a
      // final frame with no trailing blank line leaves it here.
      for (const event of parser.flush()) {
        if (event === 'done') {
          break;
        }
        if (!isValidChatChunk(event)) {
          continue;
        }
        accumulateChunk(event);
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
        // The server's own counts win over the per-event tally.
        tokens_evaluated: serverFinish?.tokensEvaluated,
        tokens_predicted: serverFinish?.tokensPredicted ?? tokensPredicted,
        timings: serverFinish?.timings,
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

    const transportBody: Partial<Record<TransportBodyKey, any>> = {
      model: params.model,
      messages: encodedMessages,
      stream: true,
    };
    if (params.stop && params.stop.length > 0) {
      transportBody.stop = params.stop;
    }
    // Only attach when the caller actually supplied them — empty arrays
    // cause some servers (and their schema validators) to choke.
    if (params.tools && params.tools.length > 0) {
      transportBody.tools = params.tools;
    }
    if (params.tool_choice !== undefined) {
      transportBody.tool_choice = params.tool_choice;
    }
    if (params.response_format) {
      // OpenAI requires `name` inside json_schema; llama.cpp / Ollama /
      // LM Studio ignore it. Inject a default so the same call works
      // everywhere.
      if (
        params.response_format.type === 'json_schema' &&
        !params.response_format.json_schema.name
      ) {
        transportBody.response_format = {
          ...params.response_format,
          json_schema: {
            ...params.response_format.json_schema,
            name: 'response',
          },
        };
      } else {
        transportBody.response_format = params.response_format;
      }
    }

    // Every key beyond the transport's own comes from the server profile, and
    // the transport's keys are spread last so a profile cannot shadow one.
    const requestBody = {
      ...bodyExtras(serverType, {
        samplers: params.samplers,
        reasoning: params.reasoning,
      }),
      ...transportBody,
    };
    xhr.send(JSON.stringify(requestBody));
  });
}
