jest.unmock('../../store');

import {runInAction} from 'mobx';

import {restoreStartupSelection} from '../startupSelection';
import {
  chatSessionStore,
  modelStore,
  palStore,
  serverStore,
  startupSelectionStore,
} from '../../store';
import {ModelOrigin} from '../../utils/types';

const localModel = {
  id: 'local-model',
  name: 'Local model',
  origin: ModelOrigin.LOCAL,
  modelType: 'llm',
  isDownloaded: true,
} as any;

describe('restoreStartupSelection', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    runInAction(() => {
      startupSelectionStore.hasPalPreference = false;
      startupSelectionStore.palId = undefined;
      startupSelectionStore.modelSelection = undefined;
      startupSelectionStore.restoreAttempted = false;
      startupSelectionStore.isRestoring = false;
      startupSelectionStore.suppressPalDefaultAutoLoad = false;
      chatSessionStore.activeSessionId = null;
      chatSessionStore.newChatPalId = undefined;
      modelStore.models = [];
      modelStore.activeModelId = undefined;
      palStore.pals = [];
      serverStore.servers = [];
      serverStore.serverModels.clear();
      serverStore.userSelectedModels = [];
      serverStore.remoteModelPreferences = {};
    });
  });

  afterAll(async () => {
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  it('restores a remembered local model before the remembered Pal', async () => {
    modelStore.models = [localModel];
    palStore.pals = [{id: 'pal-1', name: 'Pal'} as any];
    startupSelectionStore.modelSelection = {
      modelId: localModel.id,
      origin: ModelOrigin.LOCAL,
    };
    startupSelectionStore.hasPalPreference = true;
    startupSelectionStore.palId = 'pal-1';
    const selectModel = jest.fn().mockResolvedValue(undefined);
    const setActivePal = jest.spyOn(chatSessionStore, 'setActivePal');

    await restoreStartupSelection({selectModel});

    expect(selectModel).toHaveBeenCalledWith(localModel);
    expect(setActivePal).toHaveBeenCalledWith('pal-1');
    expect(selectModel.mock.invocationCallOrder[0]).toBeLessThan(
      setActivePal.mock.invocationCallOrder[0],
    );
  });

  it('restores an explicit No Pal preference', async () => {
    startupSelectionStore.hasPalPreference = true;
    startupSelectionStore.palId = undefined;
    const setActivePal = jest.spyOn(chatSessionStore, 'setActivePal');

    await restoreStartupSelection();

    expect(setActivePal).toHaveBeenCalledWith(undefined);
  });

  it('clears an unavailable model and suppresses the Pal default auto-load', async () => {
    palStore.pals = [{id: 'pal-1', name: 'Pal'} as any];
    startupSelectionStore.modelSelection = {
      modelId: 'deleted-model',
      origin: ModelOrigin.LOCAL,
    };
    startupSelectionStore.hasPalPreference = true;
    startupSelectionStore.palId = 'pal-1';
    const selectModel = jest.fn();

    await restoreStartupSelection({selectModel});

    expect(selectModel).not.toHaveBeenCalled();
    expect(startupSelectionStore.modelSelection).toBeUndefined();
    expect(startupSelectionStore.suppressPalDefaultAutoLoad).toBe(true);
    expect(chatSessionStore.newChatPalId).toBe('pal-1');
  });

  it('validates a matching remote server before restoring its model', async () => {
    serverStore.servers = [
      {
        id: 'server-1',
        name: 'Server',
        url: 'https://example.test/v1/',
        serverType: 'OpenAI',
        apiMode: 'chat-completions',
        credentialRevision: 2,
      },
    ];
    serverStore.userSelectedModels = [
      {serverId: 'server-1', remoteModelId: 'model-a'},
    ];
    startupSelectionStore.modelSelection = {
      modelId: 'server-1/model-a',
      origin: ModelOrigin.REMOTE,
      remoteServer: {
        normalizedUrl: 'https://example.test/v1',
        serverType: 'OpenAI',
        credentialRevision: 2,
      },
    };
    const testConnection = jest
      .spyOn(serverStore, 'testServerConnection')
      .mockResolvedValue({ok: true, modelCount: 1});
    const selectModel = jest.fn().mockResolvedValue(undefined);

    await restoreStartupSelection({selectModel});

    expect(testConnection).toHaveBeenCalledWith('server-1');
    expect(selectModel).toHaveBeenCalledWith(
      expect.objectContaining({id: 'server-1/model-a'}),
    );
  });

  it('clears a remote preference when its server is unavailable', async () => {
    serverStore.servers = [
      {
        id: 'server-1',
        name: 'Server',
        url: 'https://example.test/v1',
        serverType: 'OpenAI',
        apiMode: 'chat-completions',
        credentialRevision: 2,
      },
    ];
    serverStore.userSelectedModels = [
      {serverId: 'server-1', remoteModelId: 'model-a'},
    ];
    startupSelectionStore.modelSelection = {
      modelId: 'server-1/model-a',
      origin: ModelOrigin.REMOTE,
      remoteServer: {
        normalizedUrl: 'https://example.test/v1',
        serverType: 'OpenAI',
        credentialRevision: 2,
      },
    };
    jest
      .spyOn(serverStore, 'testServerConnection')
      .mockResolvedValue({ok: false, modelCount: 0, error: 'Offline'});
    const selectModel = jest.fn();

    await restoreStartupSelection({selectModel});

    expect(selectModel).not.toHaveBeenCalled();
    expect(startupSelectionStore.modelSelection).toBeUndefined();
    expect(startupSelectionStore.suppressPalDefaultAutoLoad).toBe(true);
  });

  it('clears a remote preference when the server origin changed', async () => {
    serverStore.servers = [
      {
        id: 'server-1',
        name: 'Server',
        url: 'https://changed.example/v1',
        serverType: 'OpenAI',
        apiMode: 'chat-completions',
        credentialRevision: 2,
      },
    ];
    serverStore.userSelectedModels = [
      {serverId: 'server-1', remoteModelId: 'model-a'},
    ];
    startupSelectionStore.modelSelection = {
      modelId: 'server-1/model-a',
      origin: ModelOrigin.REMOTE,
      remoteServer: {
        normalizedUrl: 'https://original.example/v1',
        serverType: 'OpenAI',
        credentialRevision: 2,
      },
    };
    const testConnection = jest.spyOn(serverStore, 'testServerConnection');
    const selectModel = jest.fn();

    await restoreStartupSelection({selectModel});

    expect(testConnection).not.toHaveBeenCalled();
    expect(selectModel).not.toHaveBeenCalled();
    expect(startupSelectionStore.modelSelection).toBeUndefined();
  });

  it('does not apply startup defaults over a resumed session', async () => {
    chatSessionStore.activeSessionId = 'session-1';
    startupSelectionStore.hasPalPreference = true;
    startupSelectionStore.palId = 'pal-1';
    const setActivePal = jest.spyOn(chatSessionStore, 'setActivePal');

    await restoreStartupSelection();

    expect(setActivePal).not.toHaveBeenCalled();
    expect(startupSelectionStore.restoreAttempted).toBe(true);
  });
});
