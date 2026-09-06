import {NativeEventEmitter} from 'react-native';

import {modelStore, apiServerStore} from '../../../store';
import {createModel} from '../../../../jest/fixtures/models';
import NativeApiServer from '../../../specs/NativeApiServer';
import {ApiServerService, apiServerService} from '../apiServer';
import {engineAdapter, EngineUnavailableError} from '../engineAdapter';
import {mcpToolRegistry} from '../mcpTools';

jest.mock('../../../specs/NativeApiServer', () => ({
  __esModule: true,
  default: {
    start: jest.fn().mockResolvedValue(true),
    stop: jest.fn().mockResolvedValue(true),
    isRunning: jest.fn().mockResolvedValue(false),
    sendResponse: jest.fn().mockResolvedValue(true),
    startSSE: jest.fn().mockResolvedValue(true),
    sendSSEChunk: jest.fn().mockResolvedValue(true),
    finishSSE: jest.fn().mockResolvedValue(true),
    addListener: jest.fn(),
    removeListeners: jest.fn(),
  },
}));

jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  const emitterInstances: Array<{addListener: jest.Mock}> = [];
  const NativeEventEmitterMock = jest.fn().mockImplementation(() => {
    const instance = {
      addListener: jest.fn(() => ({remove: jest.fn()})),
    };
    emitterInstances.push(instance);
    return instance;
  }) as any;
  NativeEventEmitterMock.__instances = emitterInstances;
  return new Proxy(RN, {
    get(target, prop, receiver) {
      if (prop === 'NativeEventEmitter') {
        return NativeEventEmitterMock;
      }
      return Reflect.get(target, prop, receiver);
    },
  });
});

const getCapturedListener = (): ((event: any) => void) => {
  const instances = (NativeEventEmitter as any).__instances;
  expect(instances.length).toBeGreaterThan(0);
  const addListenerMock = instances[instances.length - 1].addListener;
  expect(addListenerMock).toHaveBeenCalled();
  return addListenerMock.mock.calls[0][1];
};

const makeEvent = (overrides: Record<string, unknown> = {}) => ({
  requestId: 'req-1',
  method: 'POST',
  path: '/v1/chat/completions',
  headers: '{}',
  body: JSON.stringify({
    messages: [{role: 'user', content: 'Hello'}],
  }),
  ...overrides,
});

describe('ApiServerService', () => {
  let service: ApiServerService;

  beforeEach(() => {
    service = new ApiServerService();
    jest.clearAllMocks();
    apiServerStore.setRequireAuth(false);
    apiServerStore.clearRequestLogs();
    apiServerStore.setLastError(null);
    modelStore.context = undefined;
    modelStore.inferencing = false;
    modelStore.isStreaming = false;
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await service.stop().catch(() => undefined);
  });

  it('starts and stops, tracking running state', async () => {
    await service.start();
    expect(NativeApiServer.start).toHaveBeenCalledWith(apiServerStore.port);
    expect(apiServerStore.running).toBe(true);
    expect(service.isStarted).toBe(true);

    await service.start();
    expect(NativeApiServer.start).toHaveBeenCalledTimes(1);

    await service.stop();
    expect(NativeApiServer.stop).toHaveBeenCalled();
    expect(apiServerStore.running).toBe(false);
    expect(service.isStarted).toBe(false);
  });

  it('records lastError and stays stopped when start fails', async () => {
    (NativeApiServer.start as jest.Mock).mockRejectedValueOnce(
      new Error('port busy'),
    );
    await expect(service.start()).rejects.toThrow('port busy');
    expect(apiServerStore.running).toBe(false);
    expect(apiServerStore.lastError).toBe('port busy');
  });

  it('responds 204 to OPTIONS preflight', async () => {
    await service.start();
    const listener = getCapturedListener();
    listener(makeEvent({method: 'OPTIONS'}));
    await Promise.resolve();
    await Promise.resolve();

    expect(NativeApiServer.sendResponse).toHaveBeenCalledWith(
      'req-1',
      204,
      expect.any(String),
      '',
    );
  });

  it('returns 404 for unknown paths', async () => {
    await service.start();
    const listener = getCapturedListener();
    listener(makeEvent({method: 'GET', path: '/other'}));
    await new Promise(resolve => setImmediate(resolve));

    expect(NativeApiServer.sendResponse).toHaveBeenCalledWith(
      'req-1',
      404,
      expect.any(String),
      expect.stringContaining('Unknown path'),
    );
  });

  it('requires API key when auth enabled', async () => {
    apiServerStore.setRequireAuth(true);
    await service.start();
    const listener = getCapturedListener();

    listener(makeEvent({headers: '{}'}));
    await new Promise(resolve => setImmediate(resolve));

    expect(NativeApiServer.sendResponse).toHaveBeenCalledWith(
      'req-1',
      401,
      expect.any(String),
      expect.stringContaining('Invalid API key'),
    );
  });

  it('accepts Bearer token and x-api-key header', async () => {
    apiServerStore.setRequireAuth(true);
    apiServerStore.setApiKey('test-key-123');
    await service.start();
    const listener = getCapturedListener();

    const engineCompletion = jest.fn().mockResolvedValue({
      content: 'ok',
      tokens_evaluated: 1,
      tokens_predicted: 1,
    });
    modelStore.context = {completion: engineCompletion} as any;

    listener(
      makeEvent({
        headers: JSON.stringify({authorization: 'Bearer test-key-123'}),
      }),
    );
    await new Promise(resolve => setImmediate(resolve));

    const lastCall = (
      NativeApiServer.sendResponse as jest.Mock
    ).mock.calls.slice(-1)[0];
    expect(lastCall[1]).toBe(200);

    listener(
      makeEvent({
        requestId: 'req-2',
        headers: JSON.stringify({'x-api-key': 'test-key-123'}),
      }),
    );
    await new Promise(resolve => setImmediate(resolve));
    expect(engineCompletion).toHaveBeenCalledTimes(2);
  });

  it('rejects wrong API key', async () => {
    apiServerStore.setRequireAuth(true);
    apiServerStore.setApiKey('right-key');
    await service.start();
    const listener = getCapturedListener();

    listener(
      makeEvent({headers: JSON.stringify({authorization: 'Bearer nope'})}),
    );
    await new Promise(resolve => setImmediate(resolve));

    expect(NativeApiServer.sendResponse).toHaveBeenCalledWith(
      'req-1',
      401,
      expect.any(String),
      expect.any(String),
    );
  });

  it('returns 503 when no model context is loaded', async () => {
    await service.start();
    const listener = getCapturedListener();

    listener(makeEvent());
    await new Promise(resolve => setImmediate(resolve));

    expect(NativeApiServer.sendResponse).toHaveBeenCalledWith(
      'req-1',
      503,
      expect.any(String),
      expect.stringContaining('No model is loaded'),
    );
  });

  it('returns 400 on invalid JSON body', async () => {
    modelStore.context = {completion: jest.fn()} as any;
    await service.start();
    const listener = getCapturedListener();

    listener(makeEvent({body: 'not-json'}));
    await new Promise(resolve => setImmediate(resolve));

    expect(NativeApiServer.sendResponse).toHaveBeenCalledWith(
      'req-1',
      400,
      expect.any(String),
      expect.stringContaining('not valid JSON'),
    );
  });

  it('serves GET /v1/models with downloaded models', async () => {
    modelStore.models = [
      createModel({id: 'model-1', isDownloaded: false}),
      createModel({id: 'model-2', isDownloaded: true, name: 'Downloaded'}),
    ] as any;
    await service.start();
    const listener = getCapturedListener();

    listener(makeEvent({method: 'GET', path: '/v1/models', body: ''}));
    await new Promise(resolve => setImmediate(resolve));

    const call = (NativeApiServer.sendResponse as jest.Mock).mock.calls[0];
    expect(call[1]).toBe(200);
    const body = JSON.parse(call[3]);
    expect(body.object).toBe('list');
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe('model-2');
  });

  it('handles non-streaming chat completion end to end', async () => {
    modelStore.activeModelId = 'model-2';
    modelStore.models = [
      createModel({id: 'model-2', name: 'Test Model'}),
    ] as any;
    const completion = jest.fn().mockResolvedValue({
      content: 'Hello there',
      reasoning_content: 'hmm',
      tool_calls: [],
      tokens_evaluated: 12,
      tokens_predicted: 3,
    });
    modelStore.context = {completion} as any;
    await service.start();
    const listener = getCapturedListener();

    listener(makeEvent());
    await new Promise(resolve => setImmediate(resolve));

    expect(completion).toHaveBeenCalledTimes(1);
    const completionParams = completion.mock.calls[0][0];
    expect(completionParams.jinja).toBe(true);
    expect(completionParams.messages).toEqual([
      {role: 'user', content: 'Hello'},
    ]);

    const call = (NativeApiServer.sendResponse as jest.Mock).mock.calls[0];
    expect(call[1]).toBe(200);
    const body = JSON.parse(call[3]);
    expect(body.object).toBe('chat.completion');
    expect(body.model).toBe('Test Model');
    expect(body.choices[0].message.content).toBe('Hello there');
    expect(body.choices[0].message.reasoning_content).toBe('hmm');
    expect(body.choices[0].finish_reason).toBe('stop');
    expect(body.usage).toEqual({
      prompt_tokens: 12,
      completion_tokens: 3,
      total_tokens: 15,
    });

    expect(apiServerStore.requestLogs).toHaveLength(1);
    expect(apiServerStore.requestLogs[0].status).toBe(200);
  });

  it('streams SSE chunks for streaming requests', async () => {
    modelStore.context = {} as any;
    const deltas = [{content: 'He'}, {content: 'llo'}];
    jest
      .spyOn(engineAdapter, 'streamChatCompletion')
      .mockImplementation(async (_request, onDelta) => {
        deltas.forEach(onDelta);
        return {
          content: 'Hello',
          finish_reason: 'stop',
          usage: {prompt_tokens: 1, completion_tokens: 2, total_tokens: 3},
        };
      });

    await service.start();
    const listener = getCapturedListener();

    listener(
      makeEvent({
        body: JSON.stringify({
          messages: [{role: 'user', content: 'hi'}],
          stream: true,
        }),
      }),
    );
    await new Promise(resolve => setImmediate(resolve));

    expect(NativeApiServer.startSSE).toHaveBeenCalledWith('req-1');
    const chunkCalls = (NativeApiServer.sendSSEChunk as jest.Mock).mock.calls;
    expect(chunkCalls.length).toBeGreaterThanOrEqual(4);

    const payloads = chunkCalls.map(call => JSON.parse(call[1]));
    expect(payloads[0].choices[0].delta.role).toBe('assistant');
    expect(payloads[1].choices[0].delta).toEqual({content: 'He'});
    expect(payloads[2].choices[0].delta).toEqual({content: 'llo'});
    expect(payloads[payloads.length - 1].choices[0].finish_reason).toBe('stop');
    expect(NativeApiServer.finishSSE).toHaveBeenCalledWith('req-1');
  });

  it('emits tool call delta once from final result', async () => {
    modelStore.context = {} as any;
    jest
      .spyOn(engineAdapter, 'streamChatCompletion')
      .mockImplementation(async () => ({
        content: '',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {name: 'get_weather', arguments: '{"city":"SF"}'},
          },
        ],
        finish_reason: 'tool_calls',
        usage: {prompt_tokens: 5, completion_tokens: 7, total_tokens: 12},
      }));

    await service.start();
    const listener = getCapturedListener();

    listener(
      makeEvent({
        body: JSON.stringify({
          messages: [{role: 'user', content: 'hi'}],
          stream: true,
        }),
      }),
    );
    await new Promise(resolve => setImmediate(resolve));

    const payloads = (NativeApiServer.sendSSEChunk as jest.Mock).mock.calls.map(
      call => JSON.parse(call[1]),
    );
    const toolChunks = payloads.filter(
      chunk => chunk.choices[0].delta.tool_calls,
    );
    expect(toolChunks).toHaveLength(1);
    expect(toolChunks[0].choices[0].delta.tool_calls[0]).toEqual({
      index: 0,
      id: 'call_1',
      type: 'function',
      function: {name: 'get_weather', arguments: '{"city":"SF"}'},
    });

    const finalChunk = payloads[payloads.length - 1];
    expect(finalChunk.choices[0].finish_reason).toBe('tool_calls');
  });

  it('includes usage chunk when stream_options.include_usage', async () => {
    modelStore.context = {} as any;
    jest
      .spyOn(engineAdapter, 'streamChatCompletion')
      .mockImplementation(async () => ({
        content: 'x',
        finish_reason: 'stop',
        usage: {prompt_tokens: 1, completion_tokens: 2, total_tokens: 3},
      }));

    await service.start();
    const listener = getCapturedListener();

    listener(
      makeEvent({
        body: JSON.stringify({
          messages: [{role: 'user', content: 'hi'}],
          stream: true,
          stream_options: {include_usage: true},
        }),
      }),
    );
    await new Promise(resolve => setImmediate(resolve));

    const finalPayload = JSON.parse(
      (NativeApiServer.sendSSEChunk as jest.Mock).mock.calls.slice(-1)[0][1],
    );
    expect(finalPayload.usage).toEqual({
      prompt_tokens: 1,
      completion_tokens: 2,
      total_tokens: 3,
    });
  });

  it('returns 503 when engine becomes unavailable', async () => {
    modelStore.context = {completion: jest.fn()} as any;
    jest
      .spyOn(engineAdapter, 'chatCompletion')
      .mockRejectedValue(new EngineUnavailableError());

    await service.start();
    const listener = getCapturedListener();

    listener(makeEvent());
    await new Promise(resolve => setImmediate(resolve));

    expect(NativeApiServer.sendResponse).toHaveBeenCalledWith(
      'req-1',
      503,
      expect.any(String),
      expect.stringContaining('unavailable'),
    );
  });

  it('merges MCP registry tools into the request', async () => {
    mcpToolRegistry.registerServer('srv', [
      {name: 'tool_a', description: 'A tool', inputSchema: {type: 'object'}},
    ]);
    const completion = jest.fn().mockResolvedValue({
      content: 'done',
      tokens_evaluated: 1,
      tokens_predicted: 1,
    });
    modelStore.context = {completion} as any;
    await service.start();
    const listener = getCapturedListener();

    listener(
      makeEvent({
        body: JSON.stringify({
          messages: [{role: 'user', content: 'hi'}],
          tools: [
            {
              type: 'function',
              function: {name: 'client_tool', parameters: {}},
            },
          ],
        }),
      }),
    );
    await new Promise(resolve => setImmediate(resolve));

    const params = completion.mock.calls[0][0];
    const toolNames = params.tools.map((tool: any) => tool.function.name);
    expect(toolNames).toEqual(['client_tool', 'mcp__srv__tool_a']);
    mcpToolRegistry.removeServer('srv');
  });

  it('logs error status when handler throws', async () => {
    const completion = jest.fn().mockRejectedValue(new Error('engine blew up'));
    modelStore.context = {completion} as any;
    await service.start();
    const listener = getCapturedListener();

    listener(makeEvent());
    await new Promise(resolve => setImmediate(resolve));

    expect(NativeApiServer.sendResponse).toHaveBeenCalledWith(
      'req-1',
      500,
      expect.any(String),
      expect.stringContaining('engine blew up'),
    );
    expect(apiServerStore.requestLogs[0].status).toBe(500);
    expect(apiServerStore.requestLogs[0].error).toBe('engine blew up');
    expect(apiServerStore.activeRequests).toBe(0);
  });

  it('exposes a shared singleton', () => {
    expect(apiServerService).toBeInstanceOf(ApiServerService);
  });
});
