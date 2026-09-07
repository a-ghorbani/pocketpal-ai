import {toJS} from 'mobx';

import {modelStore} from '../../store';
import type {TokenData} from 'llama.rn';

import {mapCompletionResult, mapRequestToLlamaParams} from './mapper';
import type {
  EngineCompletionResult,
  OaiChatCompletionRequest,
  OaiToolCall,
} from './types';

const ENGINE_POLL_INTERVAL_MS = 150;

export class EngineUnavailableError extends Error {
  constructor(message = 'No model context available') {
    super(message);
    this.name = 'EngineUnavailableError';
  }
}

export interface StreamDelta {
  content?: string;
  reasoning_content?: string;
  tool_calls?: Array<{
    index: number;
    id?: string;
    type?: 'function';
    function?: {
      name?: string;
      arguments?: string;
    };
  }>;
}

export function hasDeltaPayload(delta: StreamDelta): boolean {
  return (
    (delta.content !== undefined && delta.content !== '') ||
    (delta.reasoning_content !== undefined && delta.reasoning_content !== '') ||
    (delta.tool_calls !== undefined && delta.tool_calls.length > 0)
  );
}

interface PrevToolCallSnapshot {
  id?: string;
  name: string;
  arguments: string;
}

/**
 * Converts llama.rn streaming TokenData into OpenAI-style incremental deltas.
 *
 * llama.rn partial callbacks carry:
 * - content / reasoning_content: incremental strings from the native chat parser
 * - tool_calls: the full list of tool calls parsed so far (arguments accumulated)
 *
 * Tool call deltas are computed by diffing the accumulated arguments per index,
 * which matches the OpenAI streaming contract (arguments concatenated by the
 * client in order).
 */
export class StreamDeltaTracker {
  private prevToolCalls: PrevToolCallSnapshot[] = [];

  reset(): void {
    this.prevToolCalls = [];
  }

  next(data: TokenData, options: {allowTokenFallback: boolean}): StreamDelta {
    const delta: StreamDelta = {};

    if (data.reasoning_content) {
      delta.reasoning_content = data.reasoning_content;
    }
    if (data.content) {
      delta.content = data.content;
    }

    const streamedToolCalls = data.tool_calls;
    if (Array.isArray(streamedToolCalls) && streamedToolCalls.length > 0) {
      const toolDeltas: NonNullable<StreamDelta['tool_calls']> = [];
      streamedToolCalls.forEach((toolCall, index) => {
        const args = toolCall.function?.arguments ?? '';
        const prev = this.prevToolCalls[index];
        if (!prev) {
          toolDeltas.push({
            index,
            id: toolCall.id || `call_${index}`,
            type: 'function',
            function: {
              name: toolCall.function?.name ?? '',
              arguments: args,
            },
          });
        } else if (args.length > prev.arguments.length) {
          toolDeltas.push({
            index,
            function: {arguments: args.slice(prev.arguments.length)},
          });
        }
      });
      this.prevToolCalls = streamedToolCalls.map(toolCall => ({
        id: toolCall.id,
        name: toolCall.function?.name ?? '',
        arguments: toolCall.function?.arguments ?? '',
      }));
      if (toolDeltas.length > 0) {
        delta.tool_calls = toolDeltas;
      }
    }

    // Fallback for transports without native chat parsing (e.g. reasoning
    // format disabled): raw token pieces become content deltas. Only used
    // when there is no parsed payload at all and no tools were requested,
    // so raw tool-call markup can never leak into content.
    if (!hasDeltaPayload(delta) && options.allowTokenFallback && data.token) {
      delta.content = data.token;
    }

    return delta;
  }
}

type TokenDataListener = (data: TokenData) => void;

/**
 * Serializes server-initiated completions against each other and against
 * app UI completions. Requests are FIFO; before each run the adapter waits
 * until the shared llama.rn context is free, then holds the engine flags so
 * new UI requests queue behind the server request as well.
 */
export class EngineAdapter {
  private queueTail: Promise<unknown> = Promise.resolve();

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queueTail.then(task);
    this.queueTail = run.catch(() => undefined);
    return run;
  }

  async waitUntilEngineFree(): Promise<void> {
    while (
      modelStore.isContextLoading ||
      modelStore.inferencing ||
      modelStore.isStreaming
    ) {
      await new Promise(resolve =>
        setTimeout(resolve, ENGINE_POLL_INTERVAL_MS),
      );
    }
  }

  async chatCompletion(
    request: OaiChatCompletionRequest,
  ): Promise<EngineCompletionResult> {
    return this.enqueue(() => this.runCompletion(request));
  }

  async streamChatCompletion(
    request: OaiChatCompletionRequest,
    onDelta: (delta: StreamDelta) => void,
  ): Promise<EngineCompletionResult> {
    return this.enqueue(() =>
      this.runCompletion(request, data => {
        const delta = this.tracker.next(data, {
          allowTokenFallback: !request.tools || request.tools.length === 0,
        });
        if (hasDeltaPayload(delta)) {
          onDelta(delta);
        }
      }),
    );
  }

  private tracker = new StreamDeltaTracker();

  private async runCompletion(
    request: OaiChatCompletionRequest,
    onToken?: TokenDataListener,
  ): Promise<EngineCompletionResult> {
    await this.waitUntilEngineFree();

    const context = modelStore.context;
    if (!context) {
      throw new EngineUnavailableError();
    }

    const params = mapRequestToLlamaParams(request, {
      chatTemplate: modelStore.activeModel?.chatTemplate?.chatTemplate,
      defaultStopWords: toJS(modelStore.activeModel?.stopWords),
    });

    this.tracker.reset();
    modelStore.setInferencing(true);
    modelStore.setIsStreaming(true);

    try {
      const completionPromise = onToken
        ? context.completion(params, onToken)
        : context.completion(params);
      modelStore.registerCompletionPromise(completionPromise);
      const nativeResult = await completionPromise;
      return mapCompletionResult(nativeResult);
    } finally {
      modelStore.clearCompletionPromise();
      modelStore.setIsStreaming(false);
      modelStore.setInferencing(false);
    }
  }
}

export const engineAdapter = new EngineAdapter();

export type {OaiToolCall};
