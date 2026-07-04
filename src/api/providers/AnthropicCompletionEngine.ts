/**
 * AnthropicCompletionEngine — Claude via Anthropic Messages API.
 *
 * Anthropic uses a different API format from OpenAI:
 * - Endpoint: /v1/messages (not /v1/chat/completions)
 * - Auth: x-api-key header (not Bearer)
 * - Version: anthropic-version header required
 * - Streaming: SSE with different event types
 *
 * Architecture: Client-direct, user provides API Key.
 */

import type {
  ApiCompletionParams,
  CompletionEngine,
  CompletionResult,
  CompletionStreamData,
} from '../../utils/completionTypes';
import type {ProviderModel} from './types';

const ANTHROPIC_API_VERSION = '2023-06-01';
const REQUEST_TIMEOUT_MS = 120000;

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

interface AnthropicContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: any;
  tool_use_id?: string;
  content?: string;
}

interface AnthropicStreamEvent {
  type: string;
  delta?: {
    type: string;
    text?: string;
  };
  content_block?: AnthropicContentBlock;
  message?: {
    stop_reason?: string;
  };
}

export class AnthropicCompletionEngine implements CompletionEngine {
  private abortController: AbortController | null = null;

  constructor(
    private apiKey: string,
    private modelId: string,
    private baseUrl: string = 'https://api.anthropic.com',
  ) {}

  async completion(
    params: ApiCompletionParams,
    callback?: (data: CompletionStreamData) => void,
  ): Promise<CompletionResult> {
    this.abortController = new AbortController();

    const messages = this.convertMessages(params.messages || []);
    const systemPrompt = this.extractSystemPrompt(params.messages || []);

    const requestBody: any = {
      model: this.modelId,
      messages,
      max_tokens: params.n_predict || 4096,
      stream: true,
    };

    if (systemPrompt) {
      requestBody.system = systemPrompt;
    }
    if (params.temperature !== undefined) {
      requestBody.temperature = params.temperature;
    }
    if (params.top_p !== undefined) {
      requestBody.top_p = params.top_p;
    }
    if (params.stop) {
      requestBody.stop_sequences = Array.isArray(params.stop)
        ? params.stop
        : [params.stop];
    }
    // Tool support (Anthropic format)
    const tools = (params as any).tools;
    if (tools && tools.length > 0) {
      requestBody.tools = tools.map((t: any) => ({
        name: t.function?.name || t.name,
        description: t.function?.description || t.description,
        input_schema: t.function?.parameters || t.parameters,
      }));
    }

    const url = `${this.baseUrl}/v1/messages`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': ANTHROPIC_API_VERSION,
        },
        body: JSON.stringify(requestBody),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Anthropic API error ${response.status}: ${errorBody}`,
        );
      }

      // Parse SSE stream
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body for streaming');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';
      let fullReasoning = '';
      let stopReason: string | undefined;

      while (true) {
        const {done, value} = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, {stream: true});
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (!data || data === '[DONE]') continue;

            try {
              const event: AnthropicStreamEvent = JSON.parse(data);

              if (
                event.type === 'content_block_delta' &&
                event.delta?.text
              ) {
                fullContent += event.delta.text;
                callback?.({
                  token: event.delta.text,
                  content: event.delta.text,
                  accumulated_text: fullContent,
                });
              } else if (event.type === 'message_delta') {
                if (event.message?.stop_reason) {
                  stopReason = event.message.stop_reason;
                }
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }

      const stoppedLimit = stopReason === 'max_tokens' ? 1 : undefined;
      const stoppedEos = stopReason === 'end_turn';

      return {
        text: fullContent,
        content: fullContent,
        reasoning_content: fullReasoning || undefined,
        tokens_predicted: undefined,
        tokens_evaluated: undefined,
        stopped_eos: stoppedEos,
        stopped_limit: stoppedLimit,
        stopped_word: stopReason,
        stopping_word: stopReason,
        interrupted: stopReason === undefined,
      };
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        return {
          text: '',
          content: '',
          interrupted: true,
        };
      }
      throw e;
    }
  }

  async stopCompletion(): Promise<void> {
    this.abortController?.abort();
    this.abortController = null;
  }

  /**
   * Convert OpenAI-style messages to Anthropic format.
   * Anthropic uses a separate `system` parameter instead of a system role.
   */
  private convertMessages(
    messages: any[],
  ): AnthropicMessage[] {
    return messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: typeof m.content === 'string'
          ? m.content
          : Array.isArray(m.content)
            ? m.content.map((c: any) => ({
                type: c.type || 'text',
                text: c.text,
              }))
            : m.content,
      }));
  }

  /**
   * Extract system prompt from messages (Anthropic uses separate param).
   */
  private extractSystemPrompt(messages: any[]): string | undefined {
    const systemMessages = messages.filter(m => m.role === 'system');
    if (systemMessages.length === 0) return undefined;
    return systemMessages.map(m => m.content).join('\n\n');
  }
}
