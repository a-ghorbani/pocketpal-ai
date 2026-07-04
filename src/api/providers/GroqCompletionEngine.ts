/**
 * GroqCompletionEngine — Llama models via Groq API.
 *
 * Groq uses an OpenAI-compatible API format, so this engine
 * delegates to the existing streamChatCompletion function.
 * The only difference is the base URL and API key.
 *
 * Architecture: Client-direct, user provides API Key.
 * Groq offers a generous free tier.
 */

import {streamChatCompletion} from '../openai';
import type {
  ApiCompletionParams,
  CompletionEngine,
  CompletionResult,
  CompletionStreamData,
} from '../../utils/completionTypes';

export class GroqCompletionEngine implements CompletionEngine {
  private abortController: AbortController | null = null;

  constructor(
    private apiKey: string,
    private modelId: string,
    private baseUrl: string = 'https://api.groq.com/openai',
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
        tools: (params as any).tools,
        tool_choice: (params as any).tool_choice,
        response_format: (params as any).response_format,
      },
      this.baseUrl,
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
