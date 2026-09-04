import {modelStore} from '../ModelStore';
import {serverStore} from '../ServerStore';
import {l10n} from '../../locales';
import type {RouterFailure} from '../../utils/routerState';

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
    routerReason: jest.fn(),
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
    (serverStore.routerReason as jest.Mock).mockReturnValue(undefined);
    modelStore.activeRemoteBinding = undefined;
  });

  /** What the engine does before every request, reached through the engine. */
  const refusalFor = async (reason?: RouterFailure) => {
    await modelStore.setRemoteModel(remoteModel);
    (serverStore.ensureRouterModelLoaded as jest.Mock).mockResolvedValue(
      'failed',
    );
    (serverStore.routerReason as jest.Mock).mockReturnValue(reason);
    return modelStore
      .engine!.completion({} as any)
      .then(() => 'no refusal at all')
      .catch((error: Error) => error.message);
  };

  it('refuses a request with the record the operation left', async () => {
    await expect(refusalFor({cause: 'load-failed'})).resolves.toBe(
      l10n.en.settings.routerModels.loadFailed,
    );
  });

  // Withdrawing the request leaves no record because it is not news about the
  // server. The engine still needs a message, and it says what is true: this
  // app is no longer waiting.
  it('refuses one with no record by naming the wait, not the server', async () => {
    await expect(refusalFor(undefined)).resolves.toBe(
      l10n.en.settings.routerModels.waitStopped,
    );
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
