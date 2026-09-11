import {CompletionParams as LlamaRNCompletionParams} from 'llama.rn';

export type {ToolCall} from 'llama.rn';
import type {ToolCall} from 'llama.rn';

// `enabled: false` is a best-effort hint — reasoning the model still returns is
// never stripped from what is displayed.
export interface ReasoningIntent {
  enabled: boolean;
  effort?: string;
}

export type ApiCompletionParams = LlamaRNCompletionParams & {
  reasoning?: ReasoningIntent;
};

// Stripped before the params reach llama.rn.
export type AppOnlyCompletionParams = {
  version?: number;
  // False drops prior thinking parts from the sent context to save space.
  include_thinking_in_context?: boolean;
};

const APP_ONLY_KEYS: (keyof AppOnlyCompletionParams)[] = [
  'version',
  'include_thinking_in_context',
];

export type CompletionParams = ApiCompletionParams & AppOnlyCompletionParams;

export function toApiCompletionParams(
  params: CompletionParams,
): ApiCompletionParams {
  const apiParams: Partial<CompletionParams> = {...params};

  for (const key of APP_ONLY_KEYS) {
    delete apiParams[key];
  }

  return apiParams as ApiCompletionParams;
}

export interface CompletionStreamData {
  token?: string;
  content?: string;
  reasoning_content?: string;
  tool_calls?: ToolCall[];
  accumulated_text?: string;
}

// Mirrors llama.rn's NativeCompletionResult minus the local-only fields
// (chat_format, tokens_cached, completion_probabilities).
export interface CompletionResult {
  text: string;
  content: string;
  reasoning_content?: string;
  tool_calls?: ToolCall[];
  timings?: {
    predicted_per_second?: number;
    predicted_ms?: number;
    prompt_per_second?: number;
    prompt_ms?: number;
    prompt_n?: number;
    predicted_n?: number;
    [key: string]: number | undefined;
  };
  tokens_predicted?: number;
  tokens_evaluated?: number;
  draft_tokens?: number;
  draft_tokens_accepted?: number;
  truncated?: boolean;
  stopped_eos?: boolean;
  stopped_limit?: number;
  stopped_word?: string;
  stopping_word?: string;
  context_full?: boolean;
  interrupted?: boolean;
}

// `used` is tokens_evaluated + tokens_predicted; tokens_cached is not exposed at
// the engine boundary, so on prompt-cache-reuse turns it under-counts KV
// occupancy.
export interface CompletionResultSnapshot {
  content?: string;
  reasoning_content?: string;
  used: number;
  contextFull: boolean;
  tokensPredicted?: number;
  finishReason?: string;
  isRemote: boolean;
}

// Declared in precedence order.
export type BannerVariant =
  | 'remote-waking'
  | 'context-full'
  | 'context-warning'
  | 'context-remote-hedged'
  | 'html-soft-cap'
  | 'none';

export interface CompletionEngine {
  completion(
    params: ApiCompletionParams,
    callback?: (data: CompletionStreamData) => void,
  ): Promise<CompletionResult>;
  stopCompletion(): Promise<void>;
}
