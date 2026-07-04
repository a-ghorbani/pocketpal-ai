/**
 * GeminiCompletionEngine — Google Gemini via Generative Language API.
 *
 * Gemini uses its own API format:
 * - Endpoint: /v1beta/models/{model}:streamGenerateContent
 * - Auth: API key as query parameter (not header)
 * - Streaming: SSE with JSON array chunks
 *
 * Architecture: Client-direct, user provides API Key.
 */

import type {
  ApiCompletionParams,
  CompletionEngine,
  CompletionResult,
  CompletionStreamData,
} from '../../utils/completionTypes';

interface GeminiPart {
  text?: string;
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

interface GeminiStreamChunk {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
      role?: string;
    };
    finishReason?: string;
  }>;
}

export class GeminiCompletionEngine implements CompletionEngine {
  private abortController: AbortController | null = null;

  constructor(
    private apiKey: string,
    private modelId: string,
    private baseUrl: string = 'https://generativelanguage.googleapis.com',
  ) {}

  async completion(
    params: ApiCompletionParams,
    callback?: (data: CompletionStreamData) => void,
  ): Promise<CompletionResult> {
    this.abortController = new AbortController();

    const contents = this.convertMessages(params.messages || []);
    const systemInstruction = this.extractSystemInstruction(params.messages || []);

    const requestBody: any = {
      contents,
      generationConfig: {
        maxOutputTokens: params.n_predict || 8192,
      },
    };

    if (systemInstruction) {
      requestBody.systemInstruction = {
        parts: [{text: systemInstruction}],
      };
    }
    if (params.temperature !== undefined) {
      requestBody.generationConfig.temperature = params.temperature;
    }
    if (params.top_p !== undefined) {
      requestBody.generationConfig.topP = params.top_p;
    }
    if (params.stop) {
      requestBody.generationConfig.stopSequences = Array.isArray(params.stop)
        ? params.stop
        : [params.stop];
    }

    const url = `${this.baseUrl}/v1beta/models/${this.modelId}:streamGenerateContent?alt=sse&key=${this.apiKey}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(requestBody),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Gemini API error ${response.status}: ${errorBody}`,
        );
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body for streaming');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';
      let finishReason: string | undefined;

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
              const chunk: GeminiStreamChunk = JSON.parse(data);
              const candidate = chunk.candidates?.[0];

              if (candidate?.content?.parts) {
                for (const part of candidate.content.parts) {
                  if (part.text) {
                    fullContent += part.text;
                    callback?.({
                      token: part.text,
                      content: part.text,
                      accumulated_text: fullContent,
                    });
                  }
                }
              }

              if (candidate?.finishReason) {
                finishReason = candidate.finishReason;
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }

      return {
        text: fullContent,
        content: fullContent,
        stopped_eos: finishReason === 'STOP',
        stopped_limit: finishReason === 'MAX_TOKENS' ? 1 : undefined,
        stopped_word: finishReason,
        stopping_word: finishReason,
        interrupted: finishReason === undefined,
      };
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        return {text: '', content: '', interrupted: true};
      }
      throw e;
    }
  }

  async stopCompletion(): Promise<void> {
    this.abortController?.abort();
    this.abortController = null;
  }

  /**
   * Convert OpenAI-style messages to Gemini format.
   * Gemini uses "model" instead of "assistant".
   */
  private convertMessages(messages: any[]): GeminiContent[] {
    return messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}],
      }));
  }

  /**
   * Extract system instruction (Gemini uses a separate field).
   */
  private extractSystemInstruction(messages: any[]): string | undefined {
    const systemMessages = messages.filter(m => m.role === 'system');
    if (systemMessages.length === 0) return undefined;
    return systemMessages.map(m => m.content).join('\n\n');
  }
}
