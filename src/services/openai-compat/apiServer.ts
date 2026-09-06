import {NativeEventEmitter} from 'react-native';

import {modelStore, apiServerStore} from '../../store';
import NativeApiServer from '../../specs/NativeApiServer';
import {randId} from '../../utils';

import {
  buildChatCompletionResponse,
  buildDeltaChunk,
  buildFinalChunk,
  buildModelsResponse,
  buildRoleChunk,
  openAiError,
  parseChatCompletionRequest,
  RequestValidationError,
} from './mapper';
import {
  EngineUnavailableError,
  engineAdapter,
  hasDeltaPayload,
} from './engineAdapter';
import {mcpToolRegistry} from './mcpTools';
import type {ChatCompletionOutput, OaiChatCompletionRequest} from './types';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Authorization, Content-Type, api-key, x-api-key',
};

interface ServerRequestEvent {
  requestId: string;
  method: string;
  path: string;
  headers: string;
  body: string;
}

interface RespondOptions {
  withCors?: boolean;
}

export class ApiServerService {
  private started = false;
  private eventSubscription: {remove: () => void} | null = null;

  get isStarted(): boolean {
    return this.started;
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    apiServerStore.setLastError(null);
    this.attachListener();
    try {
      await NativeApiServer.start(apiServerStore.port);
      apiServerStore.setRunning(true);
      this.started = true;
    } catch (error) {
      this.detachListener();
      const message =
        error instanceof Error ? error.message : String(error ?? 'unknown');
      apiServerStore.setLastError(message);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }
    try {
      await NativeApiServer.stop();
    } finally {
      this.detachListener();
      apiServerStore.setRunning(false);
      this.started = false;
    }
  }

  private attachListener() {
    if (this.eventSubscription) {
      return;
    }
    try {
      const emitter = new NativeEventEmitter(NativeApiServer as any);
      this.eventSubscription = emitter.addListener(
        'onApiServerRequest',
        (event: ServerRequestEvent) => {
          this.handleRequest(event).catch(error => {
            console.error('[ApiServer] Unhandled request error:', error);
          });
        },
      );
    } catch (error) {
      console.error('[ApiServer] Failed to attach request listener:', error);
      this.eventSubscription = null;
    }
  }

  private detachListener() {
    this.eventSubscription?.remove();
    this.eventSubscription = null;
  }

  private async respond(
    requestId: string,
    statusCode: number,
    body: unknown,
    options: RespondOptions = {},
  ): Promise<void> {
    const headers: Record<string, string> = {};
    if (options.withCors) {
      Object.assign(headers, CORS_HEADERS);
    }
    try {
      await NativeApiServer.sendResponse(
        requestId,
        statusCode,
        JSON.stringify(headers),
        JSON.stringify(body),
      );
    } catch {
      // Client likely disconnected; nothing further to do.
    }
  }

  private async handleRequest(event: ServerRequestEvent): Promise<void> {
    const {requestId, method, path} = event;
    let headers: Record<string, string> = {};
    try {
      headers = JSON.parse(event.headers || '{}');
    } catch {
      headers = {};
    }

    const startedAt = Date.now();
    let responseStatus: number | null = null;
    let responseError: string | undefined;

    try {
      apiServerStore.incrementActiveRequests();

      if (method === 'OPTIONS') {
        responseStatus = 204;
        const headersJson = JSON.stringify({
          ...CORS_HEADERS,
          'Access-Control-Max-Age': '86400',
        });
        try {
          await NativeApiServer.sendResponse(requestId, 204, headersJson, '');
        } catch {}
        return;
      }

      if (!path.startsWith('/v1/')) {
        responseStatus = 404;
        await this.respond(
          requestId,
          404,
          openAiError(
            `Unknown path: ${path}`,
            'invalid_request_error',
            'not_found',
          ),
          {withCors: true},
        );
        return;
      }

      if (apiServerStore.requireAuth) {
        const provided = (headers.authorization || '').replace(
          /^Bearer\s+/i,
          '',
        );
        const apiKeyHeader = headers['x-api-key'] || headers['api-key'] || '';
        const candidate = provided || apiKeyHeader;
        if (!candidate || candidate !== apiServerStore.apiKey) {
          responseStatus = 401;
          await this.respond(
            requestId,
            401,
            openAiError(
              'Invalid API key',
              'authentication_error',
              'invalid_api_key',
            ),
            {withCors: true},
          );
          return;
        }
      }

      if (method === 'GET' && path === '/v1/models') {
        responseStatus = 200;
        const models = modelStore.models
          .filter(m => m.isDownloaded || m.isLocal)
          .map(m => ({id: m.id, name: m.name}));
        await this.respond(requestId, 200, buildModelsResponse(models), {
          withCors: true,
        });
        return;
      }

      if (method === 'POST' && path === '/v1/chat/completions') {
        await this.handleChatCompletions(requestId, event.body, status => {
          responseStatus = status;
        });
        return;
      }

      responseStatus = 404;
      await this.respond(
        requestId,
        404,
        openAiError(
          `Unknown path: ${path}`,
          'invalid_request_error',
          'not_found',
        ),
        {withCors: true},
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error ?? 'unknown');
      responseError = message;
      responseStatus = 500;
      await this.respond(requestId, 500, openAiError(message, 'server_error'), {
        withCors: true,
      });
    } finally {
      apiServerStore.decrementActiveRequests();
      apiServerStore.addRequestLog({
        method,
        path,
        status: responseStatus,
        durationMs: Date.now() - startedAt,
        error: responseError,
      });
    }
  }

  private async handleChatCompletions(
    requestId: string,
    rawBody: string,
    setStatus: (status: number) => void,
  ): Promise<void> {
    let request: OaiChatCompletionRequest;
    try {
      request = parseChatCompletionRequest(rawBody);
    } catch (error) {
      setStatus(400);
      const message =
        error instanceof RequestValidationError
          ? error.message
          : 'Invalid request body';
      await this.respond(
        requestId,
        400,
        openAiError(message, 'invalid_request_error'),
        {withCors: true},
      );
      return;
    }

    if (!modelStore.context) {
      setStatus(503);
      await this.respond(
        requestId,
        503,
        openAiError(
          'No model is loaded. Load a model in PocketPal first.',
          'service_unavailable',
        ),
        {withCors: true},
      );
      return;
    }

    const modelName =
      modelStore.activeModel?.name || (request.model ?? 'pocketpal');
    const completionId = `chatcmpl-${randId()}`;
    const created = Math.floor(Date.now() / 1000);
    const includeUsage = request.stream_options?.include_usage === true;
    const tools = mcpToolRegistry.getMergedTools(request.tools);
    const effectiveRequest: OaiChatCompletionRequest = {...request, tools};

    let result;
    try {
      if (request.stream) {
        try {
          await NativeApiServer.startSSE(requestId);
          setStatus(200);
        } catch {
          return; // Client disconnected before streaming started.
        }

        const sendChunk = async (payload: unknown): Promise<void> => {
          try {
            await NativeApiServer.sendSSEChunk(
              requestId,
              JSON.stringify(payload),
            );
          } catch {
            // Client disconnected; engine completion continues and the
            // final result is discarded by finishSSE failing.
          }
        };

        await sendChunk(
          buildRoleChunk({id: completionId, created, model: modelName}),
        );

        let sawToolDeltas = false;
        result = await engineAdapter.streamChatCompletion(
          effectiveRequest,
          delta => {
            if (delta.tool_calls && delta.tool_calls.length > 0) {
              sawToolDeltas = true;
            }
            if (hasDeltaPayload(delta)) {
              // Not awaited: deltas are ordered by the engine callback and
              // the native layer serializes socket writes per request.
              sendChunk(
                buildDeltaChunk({
                  id: completionId,
                  created,
                  model: modelName,
                  delta,
                }),
              );
            }
          },
        );

        // Some models/engines never emit partial tool-call deltas; deliver
        // the complete tool calls from the final result so streaming clients
        // still receive them before finish_reason=tool_calls.
        if (!sawToolDeltas && result.tool_calls && result.tool_calls.length) {
          await sendChunk(
            buildDeltaChunk({
              id: completionId,
              created,
              model: modelName,
              delta: {
                tool_calls: result.tool_calls.map((toolCall, index) => ({
                  index,
                  id: toolCall.id,
                  type: 'function',
                  function: {
                    name: toolCall.function.name,
                    arguments: toolCall.function.arguments,
                  },
                })),
              },
            }),
          );
        }

        await sendChunk(
          buildFinalChunk({
            id: completionId,
            created,
            model: modelName,
            finishReason: result.finish_reason,
            usage: includeUsage ? result.usage : undefined,
          }),
        );
        try {
          await NativeApiServer.finishSSE(requestId);
        } catch {}
        return;
      }

      result = await engineAdapter.chatCompletion(effectiveRequest);
    } catch (error) {
      if (error instanceof EngineUnavailableError) {
        setStatus(503);
        await this.respond(
          requestId,
          503,
          openAiError(
            'Model engine is busy or unavailable.',
            'service_unavailable',
          ),
          {withCors: true},
        );
        return;
      }
      throw error;
    }

    const output: ChatCompletionOutput = {
      id: completionId,
      created,
      model: modelName,
      result,
      includeUsage,
    };
    setStatus(200);
    await this.respond(
      requestId,
      200,
      buildChatCompletionResponse({
        id: output.id,
        created: output.created,
        model: output.model,
        result: output.result,
      }),
      {withCors: true},
    );
  }
}

export const apiServerService = new ApiServerService();
