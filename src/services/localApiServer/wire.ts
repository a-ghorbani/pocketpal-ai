import type {RNLlamaOAICompatibleMessage} from 'llama.rn';

import {
  ApiCompletionParams,
  CompletionParams,
  CompletionResult,
  toApiCompletionParams,
} from '../../utils/completionTypes';

export const DEFAULT_MAX_TOKENS = 1024;
export const MAX_TOKENS_LIMIT = 2048;

export interface WireError {
  status: number;
  message: string;
  type: string;
  code: string;
}

export type MappedChatRequest =
  | {
      ok: true;
      params: ApiCompletionParams;
      stream: boolean;
      includeUsage: boolean;
    }
  | {ok: false; error: WireError};

type Json = Record<string, unknown>;

const ROLES = new Set(['system', 'user', 'assistant']);

const SAMPLING_FIELDS: [string, keyof CompletionParams][] = [
  ['temperature', 'temperature'],
  ['top_p', 'top_p'],
  ['top_k', 'top_k'],
  ['min_p', 'min_p'],
  ['seed', 'seed'],
  ['frequency_penalty', 'penalty_freq'],
  ['presence_penalty', 'penalty_present'],
  ['repeat_penalty', 'penalty_repeat'],
];

class RequestError extends Error {
  constructor(
    message: string,
    readonly code: 'invalid_request' | 'unsupported_parameter',
  ) {
    super(message);
  }
}

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isPresent = (value: unknown) => value !== undefined && value !== null;

function unsupported(name: string): never {
  throw new RequestError(`${name} is not supported`, 'unsupported_parameter');
}

function invalid(message: string): never {
  throw new RequestError(message, 'invalid_request');
}

function rejectUnsupported(body: Json) {
  if (
    Array.isArray(body.tools) ? body.tools.length > 0 : isPresent(body.tools)
  ) {
    unsupported('tools');
  }
  if (isPresent(body.tool_choice) && body.tool_choice !== 'none') {
    unsupported('tool_choice');
  }
  if (isPresent(body.n) && body.n !== 1) {
    unsupported('n');
  }
  if (body.logprobs === true) {
    unsupported('logprobs');
  }
}

function messageContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    invalid('message content must be a string or an array of parts');
  }
  return content
    .map(part => {
      if (!isObject(part) || part.type !== 'text') {
        unsupported('non-text content parts');
      }
      if (typeof part.text !== 'string') {
        invalid('text parts need a string text');
      }
      return part.text;
    })
    .join('');
}

function toMessages(messages: unknown): RNLlamaOAICompatibleMessage[] {
  if (!Array.isArray(messages) || messages.length === 0) {
    invalid('messages must be a non-empty array');
  }
  return messages.map(message => {
    if (!isObject(message) || !ROLES.has(message.role as string)) {
      invalid('each message needs a role of system, user or assistant');
    }
    return {
      role: message.role as string,
      content: messageContent(message.content),
    };
  });
}

function finiteOrAbsent(body: Json, name: string): number | undefined {
  const value = body[name];
  if (!isPresent(value)) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    invalid(`${name} must be a number`);
  }
  return value;
}

function maxTokens(body: Json): number {
  const requested =
    finiteOrAbsent(body, 'max_completion_tokens') ??
    finiteOrAbsent(body, 'max_tokens');
  if (requested === undefined || requested <= 0) {
    return DEFAULT_MAX_TOKENS;
  }
  return Math.min(MAX_TOKENS_LIMIT, Math.max(1, Math.floor(requested)));
}

function stopSequences(stop: unknown, stopWords: string[]): string[] {
  if (!isPresent(stop)) {
    return stopWords;
  }
  const requested = typeof stop === 'string' ? [stop] : stop;
  if (
    !Array.isArray(requested) ||
    requested.some(word => typeof word !== 'string')
  ) {
    invalid('stop must be a string or an array of strings');
  }
  return [...new Set([...stopWords, ...(requested as string[])])];
}

function requestedThinking(body: Json): boolean | undefined {
  const kwargs = body.chat_template_kwargs;
  if (isObject(kwargs) && typeof kwargs.enable_thinking === 'boolean') {
    return kwargs.enable_thinking;
  }
  return undefined;
}

/**
 * Maps an OpenAI chat-completion body onto llama.rn params over `base`. Fields
 * the server cannot honour are rejected, not dropped, so a client never
 * mistakes an ignored tool or image for a model that declined it.
 */
export function mapChatRequest(
  body: unknown,
  base: CompletionParams,
  stopWords: string[] = [],
): MappedChatRequest {
  try {
    if (!isObject(body)) {
      invalid('request body must be a JSON object');
    }
    rejectUnsupported(body);
    const params: CompletionParams = {
      ...base,
      messages: toMessages(body.messages),
      n_predict: maxTokens(body),
      stop: stopSequences(body.stop, stopWords),
    };
    for (const [name, key] of SAMPLING_FIELDS) {
      const value = finiteOrAbsent(body, name);
      if (value !== undefined) {
        (params as Json)[key] = value;
      }
    }
    if (isObject(body.response_format)) {
      params.response_format =
        body.response_format as CompletionParams['response_format'];
    }
    const enableThinking = requestedThinking(body) ?? base.enable_thinking;

    const apiParams = toApiCompletionParams(params);
    apiParams.reasoning_format = 'auto';
    if (enableThinking !== undefined) {
      apiParams.enable_thinking = enableThinking;
      apiParams.chat_template_kwargs = {
        ...apiParams.chat_template_kwargs,
        enable_thinking: enableThinking,
      };
    }
    const streamOptions = body.stream_options;
    return {
      ok: true,
      params: apiParams,
      stream: body.stream === true,
      includeUsage:
        isObject(streamOptions) && streamOptions.include_usage === true,
    };
  } catch (error) {
    if (error instanceof RequestError) {
      return {
        ok: false,
        error: {
          status: 400,
          message: error.message,
          type: 'invalid_request_error',
          code: error.code,
        },
      };
    }
    throw error;
  }
}

export interface CompletionIds {
  id: string;
  /** Unix seconds at request start. */
  created: number;
  model: string;
}

export function newCompletionIds(
  model: string,
  now: number = Date.now(),
): CompletionIds {
  const random = Math.random().toString(36).slice(2, 14);
  return {id: `chatcmpl-${random}`, created: Math.floor(now / 1000), model};
}

export function finishReason(result: CompletionResult): 'length' | 'stop' {
  return result.stopped_limit || result.context_full ? 'length' : 'stop';
}

export function usageOf(result: CompletionResult) {
  const promptTokens = result.tokens_evaluated ?? 0;
  const completionTokens = result.tokens_predicted ?? 0;
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
  };
}

export function toCompletion(result: CompletionResult, ids: CompletionIds) {
  return {
    id: ids.id,
    object: 'chat.completion',
    created: ids.created,
    model: ids.model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: result.content ?? result.text,
          ...(result.reasoning_content
            ? {reasoning_content: result.reasoning_content}
            : {}),
        },
        finish_reason: finishReason(result),
      },
    ],
    usage: usageOf(result),
  };
}

export interface ChunkDelta {
  role?: 'assistant';
  content?: string;
  reasoning_content?: string;
}

export function toChunk(delta: ChunkDelta, ids: CompletionIds) {
  return {
    id: ids.id,
    object: 'chat.completion.chunk',
    created: ids.created,
    model: ids.model,
    choices: [{index: 0, delta, finish_reason: null}],
  };
}

export function toFinalChunk(
  result: CompletionResult,
  ids: CompletionIds,
  includeUsage: boolean,
) {
  return {
    id: ids.id,
    object: 'chat.completion.chunk',
    created: ids.created,
    model: ids.model,
    choices: [{index: 0, delta: {}, finish_reason: finishReason(result)}],
    ...(includeUsage ? {usage: usageOf(result)} : {}),
  };
}

export function errorBody(error: Omit<WireError, 'status'>) {
  return {
    error: {message: error.message, type: error.type, code: error.code},
  };
}
