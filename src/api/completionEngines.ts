import {LlamaContext} from 'llama.rn';

import {streamChatCompletion} from './openai';
import {
  ApiCompletionParams,
  CompletionEngine,
  CompletionResult,
  CompletionStreamData,
} from '../utils/completionTypes';

/**
 * LocalCompletionEngine wraps LlamaContext conforming to the CompletionEngine interface.
 * Thin wrapper that delegates all calls 1:1 to the native context.
 */
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
            });
          }
        : undefined,
    );
    return {
      text: result.text,
      content: result.content,
      reasoning_content: result.reasoning_content,
      timings: result.timings,
      tokens_predicted: result.tokens_predicted,
      tokens_evaluated: result.tokens_evaluated,
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

/**
 * OpenAICompletionEngine implements the CompletionEngine interface
 * using fetch + SSE parsing for OpenAI-compatible servers.
 */
export class OpenAICompletionEngine implements CompletionEngine {
  private abortController: AbortController | null = null;

  constructor(
    private serverUrl: string,
    private modelId: string,
    private apiKey?: string,
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
        stop: params.stop,
        stream: true,
      },
      this.serverUrl,
      this.apiKey,
      this.abortController.signal,
      callback,
    );
  }

  async stopCompletion(): Promise<void> {
    this.abortController?.abort();
    this.abortController = null;
  }
}
