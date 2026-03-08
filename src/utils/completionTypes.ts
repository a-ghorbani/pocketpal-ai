import {CompletionParams as LlamaRNCompletionParams} from 'llama.rn';

// Alias allows flexibility to switch API providers later
// We should move towards OpenAI Compatible API Params
export type ApiCompletionParams = LlamaRNCompletionParams;

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
}

/**
 * Completion result shape for CompletionEngine.
 * Mirrors NativeCompletionResult from llama.rn, excluding local-only fields
 * (chat_format, tokens_cached, completion_probabilities, tool_calls).
 */
export interface CompletionResult {
  text: string;
  content: string;
  reasoning_content?: string;
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
