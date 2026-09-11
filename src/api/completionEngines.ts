import {LlamaContext} from 'llama.rn';

import {streamChatCompletion} from './openai';
import {
  ApiCompletionParams,
  CompletionEngine,
  CompletionResult,
  CompletionStreamData,
} from '../utils/completionTypes';

export class LocalCompletionEngine implements CompletionEngine {
  constructor(private context: LlamaContext) {}

  async completion(
    params: ApiCompletionParams,
    callback?: (data: CompletionStreamData) => void,
  ): Promise<CompletionResult> {
    const result = await this.context.completion(
      params,
      callback
        ? data => {
            callback({
              token: data.token,
              content: data.content,
              reasoning_content: data.reasoning_content,
              tool_calls: data.tool_calls,
              accumulated_text: data.accumulated_text,
            });
          }
        : undefined,
    );
    return {
      text: result.text,
      content: result.content,
      reasoning_content: result.reasoning_content,
      tool_calls: result.tool_calls,
      timings: result.timings,
      tokens_predicted: result.tokens_predicted,
      tokens_evaluated: result.tokens_evaluated,
      draft_tokens: result.draft_tokens,
      draft_tokens_accepted: result.draft_tokens_accepted,
      truncated: result.truncated,
      stopped_eos: result.stopped_eos,
      stopped_limit: result.stopped_limit,
      stopped_word: result.stopped_word,
      stopping_word: result.stopping_word,
      context_full: result.context_full,
      interrupted: result.interrupted,
    };
  }

  async stopCompletion(): Promise<void> {
    await this.context.stopCompletion();
  }
}

export class OpenAICompletionEngine implements CompletionEngine {
  private abortController: AbortController | null = null;

  constructor(
    private serverUrl: string,
    private modelId: string,
    private apiKey?: string,
    private timeoutMs?: number,
    private serverType?: string,
  ) {}

  async completion(
    params: ApiCompletionParams,
    callback?: (data: CompletionStreamData) => void,
  ): Promise<CompletionResult> {
    this.abortController = new AbortController();

    return streamChatCompletion(
      {
        messages: params.messages || [],
        model: this.modelId,
        temperature: params.temperature,
        top_p: params.top_p,
        max_tokens: params.n_predict,
        top_k: params.top_k,
        min_p: params.min_p,
        typical_p: params.typical_p,
        xtc_threshold: params.xtc_threshold,
        xtc_probability: params.xtc_probability,
        penalty_last_n: params.penalty_last_n,
        penalty_repeat: params.penalty_repeat,
        penalty_freq: params.penalty_freq,
        penalty_present: params.penalty_present,
        mirostat: params.mirostat,
        mirostat_tau: params.mirostat_tau,
        mirostat_eta: params.mirostat_eta,
        seed: params.seed,
        stop: params.stop,
        stream: true,
        // llama.rn's `tools` typedef is structurally compatible with OpenAI's
        // function-tool shape but lives under a different name.
        tools: (params as any).tools,
        tool_choice: (params as any).tool_choice,
        response_format: (params as any).response_format,
        // Reasoning intent carried on the params; openai.ts owns the wire shape.
        reasoning: params.reasoning,
      },
      this.serverUrl,
      this.apiKey,
      this.abortController.signal,
      callback,
      this.timeoutMs,
      this.serverType,
    );
  }

  async stopCompletion(): Promise<void> {
    this.abortController?.abort();
    this.abortController = null;
  }
}
