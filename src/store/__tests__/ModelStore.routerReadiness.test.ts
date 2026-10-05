import {modelStore} from '../ModelStore';
import {serverStore} from '../ServerStore';
import {routerStore} from '../RouterStore';
import {OpenAICompletionEngine} from '../../api/completionEngines';
import {streamChatCompletion} from '../../api/openai';
import type {ServerType} from '../../utils/serverTypes';

jest.mock('../ServerStore', () => ({
  serverStore: {
    getApiKey: jest.fn().mockResolvedValue(undefined),
    servers: [] as any[],
    fetchRemoteModelCaps: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../RouterStore', () => ({
  routerStore: {
    ensureLoaded: jest.fn(),
    ensureReady: jest.fn(),
    cancel: jest.fn(),
  },
}));

jest.mock('../../api/completionEngines', () => {
  const actual = jest.requireActual('../../api/completionEngines');
  return {
    ...actual,
    OpenAICompletionEngine: jest.fn(
      (...args: any[]) => new actual.OpenAICompletionEngine(...args),
    ),
  };
});

jest.mock('../../api/openai', () => ({
  ...jest.requireActual('../../api/openai'),
  streamChatCompletion: jest.fn(),
}));

const mockedEngine = OpenAICompletionEngine as unknown as jest.Mock;
const mockedStream = streamChatCompletion as jest.Mock;
const mockedEnsureLoaded = routerStore.ensureLoaded as jest.Mock;
const mockedEnsureReady = routerStore.ensureReady as jest.Mock;

const remoteModel = (remoteModelId: string) =>
  ({
    id: `server-1/${remoteModelId}`,
    serverId: 'server-1',
    remoteModelId,
    origin: 1,
  }) as any;

const useServer = (serverType: ServerType | string) => {
  (serverStore as any).servers = [
    {
      id: 'server-1',
      name: 'desktop',
      url: 'http://desktop:8080',
      serverType,
    },
  ];
};

const settlesOnAbort = (_binding: unknown, signal: AbortSignal) =>
  new Promise<void>(resolve => {
    signal.addEventListener('abort', () => resolve());
  });

describe('remote model readiness', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedEnsureLoaded.mockResolvedValue('ready');
    mockedEnsureReady.mockResolvedValue(undefined);
    mockedStream.mockResolvedValue({text: 'ok', content: 'ok'});
    modelStore.engine = undefined;
    modelStore.activeRemoteBinding = undefined;
  });

  it.each([
    'LM Studio',
    'Ollama',
    'OpenAI',
    'vLLM',
    'unknown',
    '',
    'my server',
  ])('builds the engine as before for a %p server', async serverType => {
    useServer(serverType);

    await modelStore.setRemoteModel(remoteModel('alpha'));
    await modelStore.engine!.completion({messages: []} as any);

    expect(mockedEngine).toHaveBeenCalledTimes(1);
    expect(mockedEngine.mock.calls[0]).toHaveLength(1);
    expect(mockedEnsureLoaded).not.toHaveBeenCalled();
    expect(mockedEnsureReady).not.toHaveBeenCalled();
  });

  it('starts the load on select without waiting for it', async () => {
    useServer('llama.cpp');
    mockedEnsureLoaded.mockReturnValue(new Promise(() => {}));

    await modelStore.setRemoteModel(remoteModel('alpha'));

    expect(mockedEngine.mock.calls[0]).toHaveLength(2);
    expect(mockedEnsureLoaded).toHaveBeenCalledWith('server-1', 'alpha');
  });

  it('waits for readiness of the bound model before each request', async () => {
    useServer('llama.cpp');
    const order: string[] = [];
    mockedEnsureReady.mockImplementation(async () => {
      order.push('ready');
    });
    mockedStream.mockImplementation(async () => {
      order.push('request');
      return {text: 'ok', content: 'ok'};
    });
    await modelStore.setRemoteModel(remoteModel('alpha'));

    await modelStore.engine!.completion({
      messages: [{role: 'user', content: 'Give me JSON'}],
      response_format: {type: 'json_schema', json_schema: {schema: {}}},
    } as any);

    expect(order).toEqual(['ready', 'request']);
    expect(mockedEnsureReady.mock.calls[0][0]).toEqual({
      modelId: 'server-1/alpha',
      serverId: 'server-1',
      remoteModelId: 'alpha',
      url: 'http://desktop:8080',
      serverType: 'llama.cpp',
    });
  });

  it('releases a turn waiting on one model when another is selected, leaving its load running', async () => {
    useServer('llama.cpp');
    mockedEnsureReady.mockImplementation(settlesOnAbort);
    await modelStore.setRemoteModel(remoteModel('alpha'));
    const waiting = modelStore.engine!.completion({messages: []} as any);
    await Promise.resolve();

    await modelStore.setRemoteModel(remoteModel('beta'));

    await expect(waiting).resolves.toMatchObject({interrupted: true});
    expect(mockedStream).not.toHaveBeenCalled();
    expect(mockedEnsureLoaded).toHaveBeenLastCalledWith('server-1', 'beta');
    expect(routerStore.cancel).not.toHaveBeenCalled();
  });
});
