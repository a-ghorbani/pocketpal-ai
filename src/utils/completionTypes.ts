import {CompletionParams as LlamaRNCompletionParams} from 'llama.rn';

export type {ToolCall} from 'llama.rn';
import type {ToolCall} from 'llama.rn';
import type {
  CompletionProviderState,
  ResponsesIncompleteReason,
  ResponsesTerminalStatus,
  ResponsesUsage,
} from '../api/responsesTypes';

// `enabled: false` is a best-effort hint — reasoning the model still returns is
// never stripped from what is displayed.
export interface ReasoningIntent {
  enabled: boolean;
  effort?: string;
}

export type GenerationParameterMode = 'inherit' | 'send' | 'omit';

export const OPTIONAL_GENERATION_PARAMETER_KEYS = [
  'n_predict',
  'temperature',
  'top_k',
  'top_p',
  'min_p',
  'xtc_threshold',
  'xtc_probability',
  'typical_p',
  'penalty_last_n',
  'penalty_repeat',
  'penalty_freq',
  'penalty_present',
  'mirostat',
  'mirostat_tau',
  'mirostat_eta',
  'seed',
  'n_probs',
  'stop',
  'jinja',
  'enable_thinking',
  'reasoning',
  'reasoning_effort',
  'include_thinking_in_context',
] as const;

export type OptionalGenerationParameter =
  (typeof OPTIONAL_GENERATION_PARAMETER_KEYS)[number];

export type GenerationParameterModes = Partial<
  Record<OptionalGenerationParameter, GenerationParameterMode>
>;

export type ApiCompletionParams = LlamaRNCompletionParams & {
  reasoning?: ReasoningIntent;
  max_tokens?: number;
  reasoning_effort?: string;
  /**
   * App-owned intent metadata. Engines must resolve and remove it immediately
   * before constructing wire JSON or invoking llama.rn.
   */
  generationParameterModes?: GenerationParameterModes;
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

export type RemoteGenerationSettings = Partial<
  Pick<
    CompletionParams,
    | 'version'
    | 'n_predict'
    | 'temperature'
    | 'top_k'
    | 'top_p'
    | 'min_p'
    | 'xtc_threshold'
    | 'xtc_probability'
    | 'typical_p'
    | 'penalty_last_n'
    | 'penalty_repeat'
    | 'penalty_freq'
    | 'penalty_present'
    | 'mirostat'
    | 'mirostat_tau'
    | 'mirostat_eta'
    | 'seed'
    | 'n_probs'
    | 'stop'
    | 'jinja'
    | 'enable_thinking'
    | 'reasoning'
    | 'reasoning_effort'
    | 'include_thinking_in_context'
    | 'generationParameterModes'
  >
>;

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
    cache_n?: number;
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
  terminal_status?: ResponsesTerminalStatus;
  incomplete_reason?: ResponsesIncompleteReason;
  refusal?: string;
  usage?: ResponsesUsage;
  provider_state?: CompletionProviderState;
}

// An absent `used` means the count is unknown, and must never be shown as zero.
// llama.rn's local `tokens_evaluated` is the whole prompt; a llama.cpp server's
// `timings.prompt_n` is only the part it evaluated, the reused prefix being in
// `cache_n`.
export interface CompletionResultSnapshot {
  content?: string;
  reasoning_content?: string;
  used?: number;
  contextFull: boolean;
  tokensPredicted?: number;
  finishReason?: string;
  terminalStatus?: ResponsesTerminalStatus;
  incompleteReason?: ResponsesIncompleteReason;
  refusal?: string;
  isRemote: boolean;
}

// Declared in precedence order.
export type BannerVariant =
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
