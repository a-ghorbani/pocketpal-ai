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
              tool_calls: data.tool_calls,
              accumulated_text: data.accumulated_text,
            });
          }
        : undefined,
    );
    // TEMP MTP-ENGAGEMENT PROBE (PR-805 verify only — REVERT before merge).
    // draft_tokens / draft_tokens_accepted are TOP-LEVEL on the native result
    // (llama.rn NativeCompletionResult, siblings of timings) but are NOT mapped
    // into PocketPal's CompletionResult, so this is the only site that can see
    // them. The chat UI never surfaces them to Appium; log to Metro/JS console
    // for the V1' (draft_tokens>0) / V2-C (draft_tokens===0) engagement proof.
    // Gated on __E2E__ so it fires in the Release e2e build (where __DEV__=false).
    if (typeof __E2E__ !== 'undefined' && __E2E__) {
      const r = result as unknown as {
        draft_tokens?: number;
        draft_tokens_accepted?: number;
      };
      console.log(
        `[MTP-PROBE] draft_tokens=${r?.draft_tokens} draft_tokens_accepted=${r?.draft_tokens_accepted}`,
      );
    }
    return {
      text: result.text,
      content: result.content,
      reasoning_content: result.reasoning_content,
      tool_calls: result.tool_calls,
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
        stop: params.stop,
        stream: true,
        // Cast at the boundary: llama.rn's `tools` typedef is
        // structurally compatible with OpenAI's function-tool shape but
        // lives under a different name.
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
