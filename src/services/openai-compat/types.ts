import {CompletionParams} from '../../utils/completionTypes';

export type OaiRole =
  | 'system'
  | 'user'
  | 'assistant'
  | 'tool'
  | 'function'
  | 'developer';

export interface OaiToolCall {
  id?: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface OaiFunctionDefinition {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

export interface OaiTool {
  type: string;
  function: OaiFunctionDefinition;
}

export type OaiContentPart = {
  type: string;
  text?: string;
  image_url?: {url: string};
};

export interface OaiMessage {
  role: OaiRole;
  content?: string | OaiContentPart[] | null;
  name?: string;
  tool_calls?: OaiToolCall[];
  tool_call_id?: string;
  reasoning_content?: string;
}

export interface OaiResponseFormat {
  type: 'text' | 'json_object' | 'json_schema';
  json_schema?: {
    strict?: boolean;
    schema: object;
  };
  schema?: object;
}

export interface OaiChatCompletionRequest {
  model?: string;
  messages: OaiMessage[];
  tools?: OaiTool[];
  tool_choice?: string | {type: string; function?: {name: string}};
  parallel_tool_calls?: boolean;
  functions?: OaiFunctionDefinition[];
  function_call?: string | {name: string};
  temperature?: number;
  top_p?: number;
  top_k?: number;
  min_p?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  n_predict?: number;
  stop?: string | string[];
  seed?: number;
  response_format?: OaiResponseFormat;
  frequency_penalty?: number;
  presence_penalty?: number;
  repeat_penalty?: number;
  stream?: boolean;
  stream_options?: {include_usage?: boolean};
  enable_thinking?: boolean;
  reasoning_format?: 'none' | 'auto' | 'deepseek';
  include_reasoning?: boolean;
  user?: string;
}

export interface OaiUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface OaiChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string | null;
      reasoning_content?: string;
      tool_calls?: OaiToolCall[];
    };
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  }>;
  usage: OaiUsage;
  system_fingerprint?: string;
}

export interface OaiChatCompletionChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: 'assistant';
      content?: string | null;
      reasoning_content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: 'function';
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
  }>;
  usage?: OaiUsage;
}

export interface OaiErrorBody {
  error: {
    message: string;
    type: string;
    param?: string | null;
    code?: string | null;
  };
}

export type FinishReason = 'stop' | 'length' | 'tool_calls' | 'content_filter';

export interface EngineToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface EngineCompletionResult {
  content: string;
  reasoning_content?: string;
  tool_calls?: EngineToolCall[];
  finish_reason: FinishReason;
  usage: OaiUsage;
}

export type LlamaCompletionParams = CompletionParams;

export interface ChatCompletionOutput {
  id: string;
  created: number;
  model: string;
  result: EngineCompletionResult;
  includeUsage: boolean;
}
