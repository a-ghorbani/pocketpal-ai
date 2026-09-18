import {CompletionParams as LlamaRNCompletionParams} from 'llama.rn';

import {finiteNumber} from './finite';

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

/**
 * What an engine reports about the work behind one completion. The names are
 * the wire's and llama.rn's alike, and they are persisted into message
 * metadata, so a rename would blank the footer of every stored message.
 */
export interface CompletionTimings {
  prompt_n?: number;
  prompt_ms?: number;
  prompt_per_token_ms?: number;
  prompt_per_second?: number;
  predicted_n?: number;
  predicted_ms?: number;
  predicted_per_token_ms?: number;
  predicted_per_second?: number;
  cache_n?: number;
}

/**
 * What `metadata.timings` holds on a stored message: the engine's timings plus
 * the three facts the chat hook measures itself. Persisted under one key with
 * one consequence, so both ends name the same type — a rename that reached only
 * one of them would blank that part of every stored footer. TTFT is stored as
 * null when the turn produced no first token, so reads go through finiteNumber
 * like every other field here.
 */
export interface PersistedTurnTimings extends CompletionTimings {
  time_to_first_token_ms?: number | null;
  draft_tokens?: number;
  draft_tokens_accepted?: number;
}

const TIMING_FIELDS = [
  'prompt_n',
  'prompt_ms',
  'prompt_per_token_ms',
  'prompt_per_second',
  'predicted_n',
  'predicted_ms',
  'predicted_per_token_ms',
  'predicted_per_second',
  'cache_n',
] as const satisfies readonly (keyof CompletionTimings)[];

/** Nothing but finite numbers is written; a value nobody can use is dropped. */
export function normaliseTimings(raw: unknown): CompletionTimings | undefined {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }
  const source = raw as Record<string, unknown>;
  const timings: CompletionTimings = {};
  for (const field of TIMING_FIELDS) {
    const value = finiteNumber(source[field]);
    if (value !== undefined) {
      timings[field] = value;
    }
  }
  return Object.keys(timings).length > 0 ? timings : undefined;
}

// Mirrors llama.rn's NativeCompletionResult minus the local-only fields
// (chat_format, tokens_cached, completion_probabilities).
export interface CompletionResult {
  text: string;
  content: string;
  reasoning_content?: string;
  tool_calls?: ToolCall[];
  timings?: CompletionTimings;
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
