import {CompletionParams as LlamaRNCompletionParams} from 'llama.rn';

export type {ToolCall} from 'llama.rn';
import type {ToolCall} from 'llama.rn';

/**
 * Reasoning intent carried internally on the completion params. Populated
 * from the resolver by the store/hook layer; the wire shape is decided
 * downstream (openai.ts for remote, useChatSession for local). Off is a
 * best-effort hint only — never used to strip displayed reasoning.
 */
export interface ReasoningIntent {
  enabled: boolean;
  effort?: string;
}

// Alias allows flexibility to switch API providers later. The `reasoning`
// carrier is a LOCAL intersection — the upstream llama.rn alias is not edited.
export type ApiCompletionParams = LlamaRNCompletionParams & {
  reasoning?: ReasoningIntent;
};

/**
 * App-specific completion parameters that are not part of the llama.rn API.
 * These parameters are used only within the app and should be stripped before
 * sending to the llama.rn API.
 */
export type AppOnlyCompletionParams = {
  /**
   * Schema version for the completion parameters.
   * Used for migrations when the schema changes.
   */
  version?: number;

  /**
   * Whether to include thinking parts in the context sent to the model.
   * When false, thinking parts are removed from the context to save context space.
   */
  include_thinking_in_context?: boolean;
  // Add other PocketPal-only fields here
};

/**
 * List of keys that are app-specific and should be stripped before
 * sending to the llama.rn API.
 */
const APP_ONLY_KEYS: (keyof AppOnlyCompletionParams)[] = [
  'version',
  'include_thinking_in_context',
];

/**
 * The merged type used throughout the app.
 * This includes both API parameters and app-specific parameters.
 */
export type CompletionParams = ApiCompletionParams & AppOnlyCompletionParams;

/**
 * Strips PocketPal-specific fields before sending to llama.rn.
 *
 * @param params - The app completion parameters that may include app-specific properties
 * @returns A clean API completion parameters object with only properties supported by the API
 */
export function toApiCompletionParams(
  params: CompletionParams,
): ApiCompletionParams {
  const apiParams: Partial<CompletionParams> = {...params};

  for (const key of APP_ONLY_KEYS) {
    delete apiParams[key];
  }

  return apiParams as ApiCompletionParams;
}

/**
 * Streaming callback data shape for CompletionEngine.
 * Matches the fields consumed by useChatSession streaming handler.
 */
export interface CompletionStreamData {
  token?: string;
  content?: string;
  reasoning_content?: string;
  tool_calls?: ToolCall[];
  accumulated_text?: string;
}

/**
 * Completion result shape for CompletionEngine.
 * Mirrors NativeCompletionResult from llama.rn, excluding local-only fields
 * (chat_format, tokens_cached, completion_probabilities).
 */
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
    [key: string]: number | undefined;
  };
  tokens_predicted?: number;
  tokens_evaluated?: number;
  truncated?: boolean;
  stopped_eos?: boolean;
  stopped_limit?: number;
  stopped_word?: string;
  stopping_word?: string;
  context_full?: boolean;
  interrupted?: boolean;
}

/**
 * Normalised snapshot of a finished turn, written once at the completion
 * boundary. Mirrored on the message metadata and on the session store so the
 * banner resolver reads it without recomputing.
 *
 * `used` is `tokens_evaluated + tokens_predicted` — `tokens_cached` is not
 * exposed at the engine boundary, so on prompt-cache-reuse turns this
 * under-counts KV occupancy.
 *
 * `contextFull` is the OR of context_full / truncated / truncationLikely /
 * (remote) finishReason === 'length', frozen at write time.
 */
export interface CompletionResultSnapshot {
  content?: string;
  reasoning_content?: string;
  used: number;
  contextFull: boolean;
  tokensPredicted?: number;
  finishReason?: string;
  isRemote: boolean;
}

/**
 * Variants the chat banner slot can resolve to, in precedence order.
 */
export type BannerVariant =
  | 'context-full'
  | 'context-warning'
  | 'context-remote-hedged'
  | 'html-soft-cap'
  | 'none';

/**
 * CompletionEngine interface formalizes the completion contract.
 * Both LocalCompletionEngine and OpenAICompletionEngine implement this.
 */
export interface CompletionEngine {
  completion(
    params: ApiCompletionParams,
    callback?: (data: CompletionStreamData) => void,
  ): Promise<CompletionResult>;
  stopCompletion(): Promise<void>;
}
