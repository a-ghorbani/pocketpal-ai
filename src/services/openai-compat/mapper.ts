import {z} from 'zod';

import type {
  OaiChatCompletionChunk,
  OaiChatCompletionRequest,
  OaiChatCompletionResponse,
  OaiErrorBody,
  OaiMessage,
  OaiTool,
  OaiToolCall,
  OaiUsage,
  EngineCompletionResult,
  FinishReason,
} from './types';

export const oaiContentPartSchema = z
  .object({
    type: z.string(),
    text: z.string().optional(),
    image_url: z.object({url: z.string()}).optional(),
  })
  .passthrough();

export const oaiToolCallSchema = z
  .object({
    id: z.string().optional(),
    type: z.string(),
    function: z.object({
      name: z.string(),
      arguments: z.string(),
    }),
  })
  .passthrough();

export const oaiMessageSchema = z
  .object({
    role: z.enum([
      'system',
      'user',
      'assistant',
      'tool',
      'function',
      'developer',
    ]),
    content: z
      .union([z.string(), z.array(oaiContentPartSchema), z.null()])
      .optional(),
    name: z.string().optional(),
    tool_calls: z.array(oaiToolCallSchema).optional(),
    tool_call_id: z.string().optional(),
    reasoning_content: z.string().optional(),
  })
  .passthrough();

export const oaiToolSchema = z
  .object({
    type: z.string(),
    function: z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      parameters: z.any().optional(),
    }),
  })
  .passthrough();

export const oaiChatCompletionRequestSchema = z
  .object({
    model: z.string().optional(),
    messages: z.array(oaiMessageSchema).min(1),
    tools: z.array(oaiToolSchema).optional(),
    tool_choice: z
      .union([
        z.string(),
        z.object({
          type: z.string(),
          function: z.object({name: z.string()}).optional(),
        }),
      ])
      .optional(),
    parallel_tool_calls: z.boolean().optional(),
    functions: z
      .array(
        z.object({
          name: z.string().min(1),
          description: z.string().optional(),
          parameters: z.any().optional(),
        }),
      )
      .optional(),
    function_call: z
      .union([z.string(), z.object({name: z.string()})])
      .optional(),
    temperature: z.number().optional(),
    top_p: z.number().optional(),
    top_k: z.number().optional(),
    min_p: z.number().optional(),
    max_tokens: z.number().optional(),
    max_completion_tokens: z.number().optional(),
    n_predict: z.number().optional(),
    stop: z.union([z.string(), z.array(z.string())]).optional(),
    seed: z.number().optional(),
    response_format: z.any().optional(),
    frequency_penalty: z.number().optional(),
    presence_penalty: z.number().optional(),
    repeat_penalty: z.number().optional(),
    stream: z.boolean().optional(),
    stream_options: z
      .object({include_usage: z.boolean().optional()})
      .passthrough()
      .optional(),
    enable_thinking: z.boolean().optional(),
    reasoning_format: z.enum(['none', 'auto', 'deepseek']).optional(),
    include_reasoning: z.boolean().optional(),
    user: z.string().optional(),
  })
  .passthrough();

export class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RequestValidationError';
  }
}

export function parseChatCompletionRequest(
  rawBody: string,
): OaiChatCompletionRequest {
  let jsonBody: unknown;
  try {
    jsonBody = JSON.parse(rawBody);
  } catch {
    throw new RequestValidationError('Request body is not valid JSON');
  }
  const parsed = oaiChatCompletionRequestSchema.safeParse(jsonBody);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const path = firstIssue?.path?.join('.') || 'body';
    throw new RequestValidationError(
      `Invalid request: ${path} ${firstIssue?.message ?? 'is invalid'}`,
    );
  }
  const data = parsed.data as OaiChatCompletionRequest;

  // Normalize legacy function-calling parameters into tools/tool_choice
  const legacyTools: OaiTool[] | undefined = data.functions?.map(fn => ({
    type: 'function',
    function: {
      name: fn.name,
      description: fn.description,
      parameters: fn.parameters ?? {type: 'object', properties: {}},
    },
  }));
  if (legacyTools && legacyTools.length > 0) {
    data.tools = [...(data.tools ?? []), ...legacyTools];
  }
  if (data.function_call !== undefined) {
    if (typeof data.function_call === 'string') {
      if (data.function_call === 'none') {
        data.tool_choice = 'none';
      } else {
        data.tool_choice = 'auto';
      }
    } else if (data.function_call?.name) {
      data.tool_choice = 'required';
    }
    delete data.function_call;
  }
  delete data.functions;

  return data;
}

const ASSISTANT_TOOL_CALL_SCHEMA_KEYS = new Set(['id', 'type', 'function']);

/**
 * Maps OpenAI chat messages into llama.rn compatible chat messages.
 * - Content arrays are passed through (llama.rn handles text + image_url parts)
 * - assistant tool_calls / tool role messages / reasoning_content are kept as-is
 */
export function mapMessagesToLlama(
  messages: OaiMessage[],
): Array<Record<string, any>> {
  return messages.map(message => {
    const mapped: Record<string, any> = {role: message.role};

    if (message.content !== undefined) {
      if (Array.isArray(message.content)) {
        mapped.content = message.content.map(part => {
          if (part.type === 'text') {
            return {type: 'text', text: part.text ?? ''};
          }
          return part;
        });
      } else {
        mapped.content = message.content ?? '';
      }
    } else if (
      Array.isArray(message.tool_calls) &&
      message.tool_calls.length > 0
    ) {
      mapped.content = '';
    }

    if (message.tool_calls && message.tool_calls.length > 0) {
      mapped.tool_calls = message.tool_calls.map(toolCall => {
        const cleaned: Record<string, any> = {
          type: 'function',
          function: {
            name: toolCall.function.name,
            arguments: toolCall.function.arguments ?? '',
          },
        };
        if (toolCall.id) {
          cleaned.id = toolCall.id;
        }
        for (const key of Object.keys(toolCall)) {
          if (!ASSISTANT_TOOL_CALL_SCHEMA_KEYS.has(key)) {
            cleaned[key] = (toolCall as any)[key];
          }
        }
        return cleaned as OaiToolCall;
      });
    }

    if (message.tool_call_id) {
      mapped.tool_call_id = message.tool_call_id;
    }
    if (message.reasoning_content) {
      mapped.reasoning_content = message.reasoning_content;
    }
    if (message.name) {
      mapped.name = message.name;
    }

    return mapped;
  });
}

function normalizeStop(
  stop: string | string[] | undefined,
): string[] | undefined {
  if (stop === undefined) {
    return undefined;
  }
  const list = Array.isArray(stop) ? stop : [stop];
  return list.length > 0 ? list : undefined;
}

/**
 * Maps a normalized OpenAI chat completion request to llama.rn completion
 * params. Server mode always uses the Jinja path so that tool rendering and
 * reasoning separation come from the native chat template engine.
 */
export function mapRequestToLlamaParams(
  request: OaiChatCompletionRequest,
  options: {
    chatTemplate?: string | null;
    defaultStopWords?: string[];
  } = {},
): Record<string, any> {
  const maxTokens =
    request.max_completion_tokens ?? request.max_tokens ?? request.n_predict;

  const params: Record<string, any> = {
    messages: mapMessagesToLlama(request.messages),
    jinja: true,
  };

  if (options.chatTemplate && options.chatTemplate.trim()) {
    params.chat_template = options.chatTemplate.trim();
  }

  if (request.tools && request.tools.length > 0) {
    params.tools = request.tools;
  }
  if (request.tool_choice !== undefined) {
    const choice = request.tool_choice;
    if (typeof choice === 'string') {
      if (choice === 'auto' || choice === 'none' || choice === 'required') {
        params.tool_choice = choice;
      }
    } else if (choice?.function?.name) {
      params.tool_choice = 'required';
    }
  }
  if (request.parallel_tool_calls !== undefined) {
    params.parallel_tool_calls = request.parallel_tool_calls;
  }

  if (request.temperature !== undefined) {
    params.temperature = request.temperature;
  }
  if (request.top_p !== undefined) {
    params.top_p = request.top_p;
  }
  if (request.top_k !== undefined) {
    params.top_k = request.top_k;
  }
  if (request.min_p !== undefined) {
    params.min_p = request.min_p;
  }
  if (maxTokens !== undefined && maxTokens !== null) {
    params.n_predict = maxTokens;
  }
  const stop =
    normalizeStop(request.stop) ?? normalizeStop(options.defaultStopWords);
  if (stop) {
    params.stop = stop;
  }
  if (request.seed !== undefined) {
    params.seed = request.seed;
  }
  if (request.frequency_penalty !== undefined) {
    params.penalty_freq = request.frequency_penalty;
  }
  if (request.presence_penalty !== undefined) {
    params.penalty_present = request.presence_penalty;
  }
  if (request.repeat_penalty !== undefined) {
    params.penalty_repeat = request.repeat_penalty;
  }

  const responseFormat = request.response_format;
  if (
    responseFormat &&
    (responseFormat.type === 'json_object' ||
      responseFormat.type === 'json_schema')
  ) {
    params.response_format = responseFormat;
  }

  if (request.enable_thinking !== undefined) {
    params.enable_thinking = request.enable_thinking;
  }
  if (request.reasoning_format !== undefined) {
    params.reasoning_format = request.reasoning_format;
  } else if (request.enable_thinking !== false) {
    params.reasoning_format = 'auto';
  }

  return params;
}

export function mapCompletionResult(result: {
  content?: string;
  text?: string;
  reasoning_content?: string;
  tool_calls?: Array<{
    id?: string;
    function: {name: string; arguments: string};
  }>;
  tokens_evaluated?: number;
  tokens_predicted?: number;
  stopped_limit?: boolean | number;
  truncated?: boolean | number;
  context_full?: boolean | number;
  interrupted?: boolean;
}): EngineCompletionResult {
  const toolCalls = (result.tool_calls ?? []).map((toolCall, index) => ({
    id: toolCall.id || `call_${index}`,
    type: 'function' as const,
    function: {
      name: toolCall.function.name,
      arguments: toolCall.function.arguments ?? '',
    },
  }));

  const content = result.content ?? result.text ?? '';
  const finishReason: FinishReason = toolCalls.length
    ? 'tool_calls'
    : result.stopped_limit || result.truncated || result.context_full
      ? 'length'
      : 'stop';

  const promptTokens = result.tokens_evaluated ?? 0;
  const completionTokens = result.tokens_predicted ?? 0;

  return {
    content,
    reasoning_content: result.reasoning_content || undefined,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    finish_reason: finishReason,
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  };
}

export function openAiError(
  message: string,
  type: string,
  code?: string,
): OaiErrorBody {
  return {
    error: {
      message,
      type,
      param: null,
      code: code ?? null,
    },
  };
}

export function buildModelsResponse(
  models: Array<{id: string; name?: string}>,
) {
  return {
    object: 'list',
    data: models.map(model => ({
      id: model.id,
      object: 'model',
      created: 0,
      owned_by: 'pocketpal',
    })),
  };
}

export function buildChatCompletionResponse(options: {
  id: string;
  created: number;
  model: string;
  result: EngineCompletionResult;
}): OaiChatCompletionResponse {
  const {id, created, model, result} = options;
  const message: OaiChatCompletionResponse['choices'][0]['message'] = {
    role: 'assistant',
    content: result.content,
  };
  if (result.reasoning_content) {
    message.reasoning_content = result.reasoning_content;
  }
  if (result.tool_calls && result.tool_calls.length > 0) {
    message.tool_calls = result.tool_calls;
  }
  return {
    id,
    object: 'chat.completion',
    created,
    model,
    choices: [
      {
        index: 0,
        message,
        finish_reason: result.finish_reason,
      },
    ],
    usage: result.usage,
  };
}

export function buildRoleChunk(options: {
  id: string;
  created: number;
  model: string;
}): OaiChatCompletionChunk {
  return {
    id: options.id,
    object: 'chat.completion.chunk',
    created: options.created,
    model: options.model,
    choices: [
      {
        index: 0,
        delta: {role: 'assistant', content: ''},
        finish_reason: null,
      },
    ],
  };
}

export function buildDeltaChunk(options: {
  id: string;
  created: number;
  model: string;
  delta: {
    content?: string;
    reasoning_content?: string;
    tool_calls?: Array<{
      index: number;
      id?: string;
      type?: 'function';
      function?: {name?: string; arguments?: string};
    }>;
  };
}): OaiChatCompletionChunk {
  return {
    id: options.id,
    object: 'chat.completion.chunk',
    created: options.created,
    model: options.model,
    choices: [
      {
        index: 0,
        delta: options.delta,
        finish_reason: null,
      },
    ],
  };
}

export function buildFinalChunk(options: {
  id: string;
  created: number;
  model: string;
  finishReason: FinishReason;
  usage?: OaiUsage;
}): OaiChatCompletionChunk {
  const chunk: OaiChatCompletionChunk = {
    id: options.id,
    object: 'chat.completion.chunk',
    created: options.created,
    model: options.model,
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: options.finishReason,
      },
    ],
  };
  if (options.usage) {
    chunk.usage = options.usage;
  }
  return chunk;
}
