import type {
  OpenAIResponseFormat,
  OpenAIToolChoice,
  OpenAIToolDefinition,
  StreamChatParams,
} from './openai';
import type {ReasoningIntent} from '../utils/completionTypes';
import type {ChatMessage} from '../utils/types';
import type {ResponsesHistoryInputItem} from '../utils/responsesReplay';
import {applyGenerationParameterModes} from '../utils/generationParameterModes';
import type {
  RemoteResponsesSamplingCapabilities,
  ResponsesSerializedReasoningMode,
} from '../utils/remoteProtocol';

type ToolCall = NonNullable<ChatMessage['tool_calls']>[number];

export interface ResponsesChatMessage {
  role: string;
  content?:
    | string
    | Array<{
        type: string;
        text?: string;
        image_url?: {url?: string};
      }>;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export type ResponsesInputItem =
  | {
      role: 'system' | 'developer' | 'user' | 'assistant';
      content:
        | string
        | Array<
            | {type: 'input_text'; text: string}
            | {type: 'input_image'; image_url: string}
          >;
    }
  | {
      type: 'function_call';
      call_id: string;
      name: string;
      arguments: string;
    }
  | {
      type: 'function_call_output';
      call_id: string;
      output: string;
    };

export interface ResponsesReasoningPolicy {
  supportsEffort?: boolean;
  disabledEffort?: string;
  supportsEncryptedContent?: boolean;
}

export interface ResponsesParameterPolicy {
  reasoning?: ResponsesReasoningPolicy;
  sampling?: RemoteResponsesSamplingCapabilities;
}

export interface ResponsesRequestOptions {
  parameterPolicy?: ResponsesParameterPolicy;
  includeReasoningEncryptedContent?: boolean;
  input?: ResponsesHistoryInputItem[];
}

export type ResponsesRequestParams = Omit<StreamChatParams, 'messages'> & {
  messages: ResponsesChatMessage[];
  n_predict?: number;
};

export interface ResponsesRequestBody {
  model: string;
  input: ResponsesHistoryInputItem[];
  stream: true;
  store: false;
  temperature?: number;
  top_p?: number;
  max_output_tokens?: number;
  tools?: Array<{
    type: 'function';
    name: string;
    description?: string;
    parameters?: Record<string, any>;
    strict?: boolean;
  }>;
  tool_choice?: 'auto' | 'none' | 'required' | {type: 'function'; name: string};
  text?: {
    format:
      | {type: 'text'}
      | {type: 'json_object'}
      | {type: 'json_schema'; name: string; schema: object; strict?: boolean};
  };
  reasoning?: {effort: string};
  include?: ['reasoning.encrypted_content'];
}

function assertNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function assertString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string`);
  }
  return value;
}

function encodeContent(content: NonNullable<ResponsesChatMessage['content']>) {
  if (typeof content === 'string') {
    return content;
  }

  return content.map((part, index) => {
    if (part.type === 'text') {
      return {
        type: 'input_text' as const,
        text: assertString(part.text, `content[${index}].text`),
      };
    }
    if (part.type === 'image_url') {
      return {
        type: 'input_image' as const,
        image_url: assertNonEmptyString(
          part.image_url?.url,
          `content[${index}].image_url.url`,
        ),
      };
    }
    throw new Error(`Unsupported content type at content[${index}]`);
  });
}

function encodeToolCall(call: ToolCall): ResponsesInputItem {
  if (call.type !== 'function') {
    throw new Error('Responses requests only support function tool calls');
  }
  return {
    type: 'function_call',
    call_id: assertNonEmptyString(call.id, 'Assistant tool call id'),
    name: assertNonEmptyString(call.function?.name, 'Assistant tool call name'),
    arguments: assertString(
      call.function?.arguments,
      'Assistant tool call arguments',
    ),
  };
}

function encodeInput(messages: ResponsesChatMessage[]): ResponsesInputItem[] {
  if (messages.length === 0) {
    throw new Error('Responses requests require at least one message');
  }
  const input: ResponsesInputItem[] = [];

  messages.forEach((message, index) => {
    if (message.role === 'tool') {
      if (message.tool_calls?.length) {
        throw new Error('Tool messages cannot contain tool calls');
      }
      if (typeof message.content !== 'string') {
        throw new Error(`Tool message ${index} output must be text`);
      }
      input.push({
        type: 'function_call_output',
        call_id: assertNonEmptyString(
          message.tool_call_id,
          `Tool message ${index} tool_call_id`,
        ),
        output: message.content,
      });
      return;
    }

    if (
      message.role !== 'system' &&
      message.role !== 'developer' &&
      message.role !== 'user' &&
      message.role !== 'assistant'
    ) {
      throw new Error(`Unsupported message role at messages[${index}]`);
    }
    if (message.content !== undefined) {
      input.push({
        role: message.role,
        content: encodeContent(message.content),
      });
    } else if (!message.tool_calls?.length) {
      throw new Error(`Message ${index} requires content`);
    }
    if (message.tool_calls) {
      if (message.role !== 'assistant') {
        throw new Error('Only assistant messages may contain tool calls');
      }
      input.push(...message.tool_calls.map(encodeToolCall));
    }
  });

  return input;
}

type ToolWithStrict = OpenAIToolDefinition & {
  function: OpenAIToolDefinition['function'] & {strict?: boolean};
};

function encodeTools(tools: OpenAIToolDefinition[] | undefined) {
  if (!tools || tools.length === 0) {
    return undefined;
  }
  return tools.map(tool => {
    if (tool.type !== 'function') {
      throw new Error('Responses requests only support function tools');
    }
    const fn = (tool as ToolWithStrict).function;
    const encoded: NonNullable<ResponsesRequestBody['tools']>[number] = {
      type: 'function',
      name: assertNonEmptyString(fn?.name, 'Tool name'),
    };
    if (fn.description !== undefined) {
      encoded.description = fn.description;
    }
    if (fn.parameters !== undefined) {
      encoded.parameters = fn.parameters;
    }
    if (fn.strict !== undefined) {
      encoded.strict = fn.strict;
    }
    return encoded;
  });
}

function encodeToolChoice(
  toolChoice: OpenAIToolChoice | undefined,
  tools: ResponsesRequestBody['tools'],
): ResponsesRequestBody['tool_choice'] {
  if (toolChoice === undefined) {
    return undefined;
  }
  if (
    (toolChoice === 'required' ||
      (typeof toolChoice === 'object' && toolChoice.type === 'function')) &&
    !tools
  ) {
    throw new Error('A tool-requiring choice needs at least one tool');
  }
  if (typeof toolChoice === 'string') {
    return toolChoice;
  }

  const name = assertNonEmptyString(
    toolChoice.function?.name,
    'Tool choice name',
  );
  if (!tools?.some(tool => tool.name === name)) {
    throw new Error(`Tool choice references unknown tool "${name}"`);
  }
  return {type: 'function', name};
}

function encodeTextFormat(
  format: OpenAIResponseFormat | undefined,
): ResponsesRequestBody['text'] {
  if (!format) {
    return undefined;
  }
  if (format.type === 'text' || format.type === 'json_object') {
    return {format: {type: format.type}};
  }
  if (!format.json_schema?.schema) {
    throw new Error('json_schema response format requires a schema');
  }
  const encoded: Extract<
    NonNullable<ResponsesRequestBody['text']>['format'],
    {type: 'json_schema'}
  > = {
    type: 'json_schema',
    name: format.json_schema.name || 'response',
    schema: format.json_schema.schema,
  };
  if (format.json_schema.strict !== undefined) {
    encoded.strict = format.json_schema.strict;
  }
  return {format: encoded};
}

function positiveTokenLimit(
  params: ResponsesRequestParams,
): number | undefined {
  const values = [
    ['max_tokens', params.max_tokens],
    ['n_predict', params.n_predict],
  ] as const;
  for (const [name, value] of values) {
    if (
      value !== undefined &&
      (typeof value !== 'number' ||
        !Number.isSafeInteger(value) ||
        (value <= 0 && value !== -1))
    ) {
      throw new Error(`${name} must be a positive integer or -1`);
    }
  }

  const positive = values.filter(
    ([, value]) => value !== undefined && value > 0,
  );
  if (positive.length === 2 && positive[0][1] !== positive[1][1]) {
    throw new Error('max_tokens and n_predict must not conflict');
  }
  return positive[0]?.[1];
}

function encodeReasoning(
  intent: ReasoningIntent | undefined,
  options: ResponsesRequestOptions,
): Pick<ResponsesRequestBody, 'reasoning' | 'include'> {
  const policy = options.parameterPolicy?.reasoning;
  const includeEncrypted = options.includeReasoningEncryptedContent === true;
  if (includeEncrypted && !policy?.supportsEncryptedContent) {
    throw new Error(
      'Encrypted reasoning content was requested but is not supported',
    );
  }
  if (intent?.effort && !intent.enabled) {
    throw new Error('Disabled reasoning cannot specify an effort');
  }

  let reasoning: ResponsesRequestBody['reasoning'];
  if (intent?.enabled && intent.effort) {
    if (!policy?.supportsEffort) {
      throw new Error('Reasoning effort is not supported by this policy');
    }
    reasoning = {effort: intent.effort};
  } else if (intent && !intent.enabled && policy?.disabledEffort) {
    reasoning = {effort: policy.disabledEffort};
  }

  return {
    ...(reasoning ? {reasoning} : {}),
    ...(includeEncrypted
      ? {
          include: [
            'reasoning.encrypted_content',
          ] as ResponsesRequestBody['include'],
        }
      : {}),
  };
}

function samplingFieldSupported(
  evidence:
    | RemoteResponsesSamplingCapabilities[keyof RemoteResponsesSamplingCapabilities]
    | undefined,
  reasoningMode: ResponsesSerializedReasoningMode,
): boolean {
  if (!evidence || evidence.supported) {
    return true;
  }
  return (
    evidence.reasoningModes !== undefined &&
    !evidence.reasoningModes.includes(reasoningMode)
  );
}

export function encodeResponsesRequest(
  params: ResponsesRequestParams,
  options: ResponsesRequestOptions = {},
): ResponsesRequestBody {
  const effectiveParams = applyGenerationParameterModes(params);
  const tools = encodeTools(effectiveParams.tools);
  const toolChoice = encodeToolChoice(effectiveParams.tool_choice, tools);
  const text = encodeTextFormat(effectiveParams.response_format);
  const maxOutputTokens = positiveTokenLimit(effectiveParams);
  const reasoningFields = encodeReasoning(effectiveParams.reasoning, options);
  const reasoningMode: ResponsesSerializedReasoningMode =
    reasoningFields.reasoning === undefined ? 'absent' : 'effort';
  const sampling = options.parameterPolicy?.sampling;

  return applyGenerationParameterModes({
    model: assertNonEmptyString(effectiveParams.model, 'Model'),
    // Replay items are validated plain JSON. JSON cloning keeps the encoder
    // immutable without relying on structuredClone, which Hermes lacks.
    input: options.input
      ? (JSON.parse(
          JSON.stringify(options.input),
        ) as ResponsesHistoryInputItem[])
      : encodeInput(effectiveParams.messages),
    stream: true,
    store: false,
    ...(effectiveParams.temperature !== undefined &&
    samplingFieldSupported(sampling?.temperature, reasoningMode)
      ? {temperature: effectiveParams.temperature}
      : {}),
    ...(effectiveParams.top_p !== undefined &&
    samplingFieldSupported(sampling?.topP, reasoningMode)
      ? {top_p: effectiveParams.top_p}
      : {}),
    ...(maxOutputTokens !== undefined &&
    samplingFieldSupported(sampling?.maxOutputTokens, reasoningMode)
      ? {max_output_tokens: maxOutputTokens}
      : {}),
    ...(tools ? {tools} : {}),
    ...(toolChoice !== undefined ? {tool_choice: toolChoice} : {}),
    ...(text ? {text} : {}),
    ...reasoningFields,
    generationParameterModes: params.generationParameterModes,
  });
}

export const buildResponsesRequest = encodeResponsesRequest;
