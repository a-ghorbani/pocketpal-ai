import {modelStore} from '../ModelStore';
import {serverStore} from '../ServerStore';

jest.mock('../ServerStore', () => ({
  serverStore: {
    getApiKey: jest.fn().mockResolvedValue(undefined),
    servers: [
      {
        id: 'server-1',
        name: 'desktop',
        url: 'http://desktop:8080',
        serverType: 'llama.cpp',
      },
    ],
    fetchRemoteModelCaps: jest.fn().mockResolvedValue(undefined),
    ensureRouterModelLoaded: jest.fn().mockResolvedValue('ready'),
  },
}));

const remoteModel = {
  id: 'server-1/alpha',
  serverId: 'server-1',
  remoteModelId: 'alpha',
  origin: 1,
} as any;

describe('remote model readiness', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (serverStore.ensureRouterModelLoaded as jest.Mock).mockResolvedValue(
      'ready',
    );
    modelStore.activeRemoteBinding = undefined;
  });

  it('asks the server to load the model without making activation wait', async () => {
    await modelStore.setRemoteModel(remoteModel);

    expect(serverStore.ensureRouterModelLoaded).toHaveBeenCalledWith(
      'server-1',
      'alpha',
    );
    expect(modelStore.activeRemoteBinding?.remoteModelId).toBe('alpha');
  });

  it('survives a load that rejects, exactly as the capability probe does', async () => {
    (serverStore.ensureRouterModelLoaded as jest.Mock).mockRejectedValueOnce(
      new Error('unreachable'),
    );

    await expect(
      modelStore.setRemoteModel(remoteModel),
    ).resolves.toBeUndefined();
  });

  it('reads the binding rather than the mutable server record', async () => {
    await modelStore.setRemoteModel(remoteModel);
    (serverStore.ensureRouterModelLoaded as jest.Mock).mockClear();

    await expect(modelStore.ensureActiveRemoteModelReady()).resolves.toBe(
      'ready',
    );
    expect(serverStore.ensureRouterModelLoaded).toHaveBeenCalledWith(
      'server-1',
      'alpha',
    );
  });

  it('reports not-router with no binding at all', async () => {
    await expect(modelStore.ensureActiveRemoteModelReady()).resolves.toBe(
      'not-router',
    );
    expect(serverStore.ensureRouterModelLoaded).not.toHaveBeenCalled();
  });
});
