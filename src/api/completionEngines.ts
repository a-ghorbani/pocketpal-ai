import {LlamaContext} from 'llama.rn';

import {streamChatCompletion} from './openai';
import type {RemoteEndpoint} from './servers';
import {pickSamplers} from '../utils/samplerParams';
import {
  ApiCompletionParams,
  CompletionEngine,
  CompletionResult,
  CompletionStreamData,
  normaliseTimings,
} from '../utils/completionTypes';
import {RemoteModelRequestWithdrawnError} from '../utils/errors';
import {isModelNotLoaded} from './llamaServer/routerWire';

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
      timings: normaliseTimings(result.timings),
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

export interface RemoteEngineOptions {
  /**
   * Awaited before the request, with the signal Stop aborts. The engine
   * applies no timeout of its own: whoever supplies this bounds it. With
   * `reread`, the cached list is not trusted; resolves true only when a
   * router made the model ready.
   */
  ensureReady?: (
    signal: AbortSignal,
    options?: {reread: boolean},
  ) => Promise<boolean | void>;
}

export class OpenAICompletionEngine implements CompletionEngine {
  private abortController: AbortController | null = null;

  constructor(
    private endpoint: RemoteEndpoint,
    private options: RemoteEngineOptions = {},
  ) {}

  async completion(
    params: ApiCompletionParams,
    callback?: (data: CompletionStreamData) => void,
  ): Promise<CompletionResult> {
    const controller = new AbortController();
    this.abortController = controller;

    const {ensureReady} = this.options;
    if (!ensureReady) {
      return this.send(params, controller.signal, callback);
    }
    await ensureReady(controller.signal);
    if (controller.signal.aborted) {
      throw new RemoteModelRequestWithdrawnError();
    }

    let streamed = false;
    try {
      return await this.send(params, controller.signal, data => {
        streamed = true;
        callback?.(data);
      });
    } catch (error) {
      if (streamed || !isModelNotLoaded(error)) {
        throw error;
      }
      const ready = await ensureReady(controller.signal, {reread: true});
      if (controller.signal.aborted) {
        throw new RemoteModelRequestWithdrawnError();
      }
      if (ready !== true) {
        throw error;
      }
      return this.send(params, controller.signal, callback);
    }
  }

  private send(
    params: ApiCompletionParams,
    signal: AbortSignal,
    callback?: (data: CompletionStreamData) => void,
  ): Promise<CompletionResult> {
    return streamChatCompletion(
      {
        messages: params.messages || [],
        model: this.endpoint.remoteModelId,
        samplers: pickSamplers(params),
        stop: params.stop,
        stream: true,
        // llama.rn's `tools` typedef is structurally compatible with OpenAI's
        // function-tool shape but lives under a different name.
        tools: (params as any).tools,
        tool_choice: (params as any).tool_choice,
        response_format: (params as any).response_format,
        // Reasoning intent carried on the params; the server profile owns the wire shape.
        reasoning: params.reasoning,
      },
      this.endpoint,
      signal,
      callback,
    );
  }

  async stopCompletion(): Promise<void> {
    this.abortController?.abort();
    this.abortController = null;
  }
}
