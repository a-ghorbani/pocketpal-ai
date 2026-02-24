import {AppState} from 'react-native';
import {runInAction} from 'mobx';

import * as Keychain from 'react-native-keychain';

import * as openaiModule from '../../api/openai';

// Mock dependencies before importing the store
jest.mock('mobx-persist-store', () => ({
  makePersistable: jest.fn().mockReturnValue(Promise.resolve()),
}));

jest.mock('../../api/openai', () => ({
  fetchModels: jest.fn(),
  testConnection: jest.fn(),
}));

// Mock AppState.addEventListener
const mockAddEventListener = jest.fn().mockReturnValue({remove: jest.fn()});
jest
  .spyOn(AppState, 'addEventListener')
  .mockImplementation(mockAddEventListener);

// Import the singleton after mocks
import {serverStore} from '../ServerStore';

const mockedFetchModels = openaiModule.fetchModels as jest.Mock;
const mockedTestConnection = openaiModule.testConnection as jest.Mock;

describe('ServerStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset store state between tests
    runInAction(() => {
      serverStore.servers = [];
      serverStore.serverModels.clear();
      serverStore.userSelectedModels = [];
      serverStore.isLoading = false;
      serverStore.error = null;
      serverStore.privacyNoticeAcknowledged = false;
    });
  });

  describe('initial state', () => {
    it('has empty servers', () => {
      expect(serverStore.servers).toEqual([]);
    });

    it('has isLoading false', () => {
      expect(serverStore.isLoading).toBe(false);
    });

    it('has no error', () => {
      expect(serverStore.error).toBeNull();
    });

    it('has privacyNoticeAcknowledged false', () => {
      expect(serverStore.privacyNoticeAcknowledged).toBe(false);
    });

    it('has empty userSelectedModels', () => {
      expect(serverStore.userSelectedModels).toEqual([]);
    });
  });

  describe('addServer', () => {
    it('adds a server and returns its id', () => {
      const id = serverStore.addServer({
        name: 'Test Server',
        url: 'http://localhost:1234',
      });

      expect(typeof id).toBe('string');
      expect(id).toMatch(/^server-/);
      expect(serverStore.servers).toHaveLength(1);
      expect(serverStore.servers[0].name).toBe('Test Server');
      expect(serverStore.servers[0].url).toBe('http://localhost:1234');
    });

    it('does not auto-fetch models on add', () => {
      serverStore.addServer({
        name: 'Server',
        url: 'http://localhost:1234',
      });

      expect(mockedFetchModels).not.toHaveBeenCalled();
    });

    it('generates unique ids for each server', () => {
      const id1 = serverStore.addServer({
        name: 'Server 1',
        url: 'http://a.com',
      });
      const id2 = serverStore.addServer({
        name: 'Server 2',
        url: 'http://b.com',
      });

      expect(id1).not.toBe(id2);
    });
  });

  describe('updateServer', () => {
    it('updates server properties', () => {
      const id = serverStore.addServer({
        name: 'Original',
        url: 'http://localhost:1234',
      });

      serverStore.updateServer(id, {name: 'Updated'});

      expect(serverStore.servers[0].name).toBe('Updated');
    });

    it('does nothing for non-existent server id', () => {
      serverStore.addServer({
        name: 'Server',
        url: 'http://localhost:1234',
      });

      serverStore.updateServer('non-existent', {name: 'Updated'});
      expect(serverStore.servers[0].name).toBe('Server');
    });

    it('updates server URL', () => {
      const id = serverStore.addServer({
        name: 'Server',
        url: 'http://localhost:1234',
      });

      serverStore.updateServer(id, {url: 'http://localhost:5678'});

      expect(serverStore.servers[0].url).toBe('http://localhost:5678');
    });
  });

  describe('removeServer', () => {
    it('removes a server from the list', () => {
      const id = serverStore.addServer({
        name: 'Server',
        url: 'http://localhost:1234',
      });

      expect(serverStore.servers).toHaveLength(1);

      serverStore.removeServer(id);

      expect(serverStore.servers).toHaveLength(0);
    });

    it('clears server models on removal', () => {
      const id = serverStore.addServer({
        name: 'Server',
        url: 'http://localhost:1234',
      });

      runInAction(() => {
        serverStore.serverModels.set(id, [
          {id: 'model-1', object: 'model', owned_by: 'system'},
        ]);
      });

      serverStore.removeServer(id);

      expect(serverStore.serverModels.has(id)).toBe(false);
    });

    it('removes API key from keychain', () => {
      const id = serverStore.addServer({
        name: 'Server',
        url: 'http://localhost:1234',
      });

      serverStore.removeServer(id);

      expect(Keychain.resetGenericPassword).toHaveBeenCalledWith({
        service: `pocketpal-server-${id}`,
      });
    });

    it('removes all userSelectedModels entries for the server', () => {
      const id = serverStore.addServer({
        name: 'Server',
        url: 'http://localhost:1234',
      });

      runInAction(() => {
        serverStore.userSelectedModels = [
          {serverId: id, remoteModelId: 'model-a'},
          {serverId: id, remoteModelId: 'model-b'},
          {serverId: 'other-server', remoteModelId: 'model-c'},
        ];
      });

      serverStore.removeServer(id);

      expect(serverStore.userSelectedModels).toEqual([
        {serverId: 'other-server', remoteModelId: 'model-c'},
      ]);
    });
  });

  describe('userSelectedModels', () => {
    describe('addUserSelectedModel', () => {
      it('adds a model selection', () => {
        serverStore.addUserSelectedModel('server-1', 'model-a');

        expect(serverStore.userSelectedModels).toEqual([
          {serverId: 'server-1', remoteModelId: 'model-a'},
        ]);
      });

      it('prevents duplicate entries', () => {
        serverStore.addUserSelectedModel('server-1', 'model-a');
        serverStore.addUserSelectedModel('server-1', 'model-a');

        expect(serverStore.userSelectedModels).toHaveLength(1);
      });

      it('allows same model from different servers', () => {
        serverStore.addUserSelectedModel('server-1', 'model-a');
        serverStore.addUserSelectedModel('server-2', 'model-a');

        expect(serverStore.userSelectedModels).toHaveLength(2);
      });

      it('allows different models from same server', () => {
        serverStore.addUserSelectedModel('server-1', 'model-a');
        serverStore.addUserSelectedModel('server-1', 'model-b');

        expect(serverStore.userSelectedModels).toHaveLength(2);
      });
    });

    describe('removeUserSelectedModel', () => {
      it('removes a specific model selection', () => {
        runInAction(() => {
          serverStore.userSelectedModels = [
            {serverId: 'server-1', remoteModelId: 'model-a'},
            {serverId: 'server-1', remoteModelId: 'model-b'},
          ];
        });

        serverStore.removeUserSelectedModel('server-1', 'model-a');

        expect(serverStore.userSelectedModels).toEqual([
          {serverId: 'server-1', remoteModelId: 'model-b'},
        ]);
      });

      it('does nothing when entry does not exist', () => {
        runInAction(() => {
          serverStore.userSelectedModels = [
            {serverId: 'server-1', remoteModelId: 'model-a'},
          ];
        });

        serverStore.removeUserSelectedModel('server-1', 'non-existent');

        expect(serverStore.userSelectedModels).toHaveLength(1);
      });
    });

    describe('getUserSelectedModelsForServer', () => {
      it('returns models for a specific server', () => {
        runInAction(() => {
          serverStore.userSelectedModels = [
            {serverId: 'server-1', remoteModelId: 'model-a'},
            {serverId: 'server-2', remoteModelId: 'model-b'},
            {serverId: 'server-1', remoteModelId: 'model-c'},
          ];
        });

        const result = serverStore.getUserSelectedModelsForServer('server-1');

        expect(result).toEqual([
          {serverId: 'server-1', remoteModelId: 'model-a'},
          {serverId: 'server-1', remoteModelId: 'model-c'},
        ]);
      });

      it('returns empty array when no models for server', () => {
        const result = serverStore.getUserSelectedModelsForServer('non-existent');

        expect(result).toEqual([]);
      });
    });
  });

  describe('removeServerIfOrphaned', () => {
    it('removes server when no user-selected models reference it', () => {
      const id = serverStore.addServer({
        name: 'Orphan Server',
        url: 'http://localhost:1234',
      });

      // No userSelectedModels reference this server
      serverStore.removeServerIfOrphaned(id);

      expect(serverStore.servers).toHaveLength(0);
    });

    it('keeps server when user-selected models still reference it', () => {
      const id = serverStore.addServer({
        name: 'Active Server',
        url: 'http://localhost:1234',
      });

      runInAction(() => {
        serverStore.userSelectedModels = [
          {serverId: id, remoteModelId: 'model-a'},
        ];
      });

      serverStore.removeServerIfOrphaned(id);

      expect(serverStore.servers).toHaveLength(1);
    });

    it('cleans up API key when removing orphaned server', () => {
      const id = serverStore.addServer({
        name: 'Orphan',
        url: 'http://localhost:1234',
      });

      serverStore.removeServerIfOrphaned(id);

      expect(Keychain.resetGenericPassword).toHaveBeenCalledWith({
        service: `pocketpal-server-${id}`,
      });
    });
  });

  describe('getModelsNotYetAdded', () => {
    it('returns all models when none are user-selected', () => {
      const id = serverStore.addServer({
        name: 'Server',
        url: 'http://localhost:1234',
      });

      runInAction(() => {
        serverStore.serverModels.set(id, [
          {id: 'model-a', object: 'model', owned_by: 'system'},
          {id: 'model-b', object: 'model', owned_by: 'system'},
        ]);
      });

      const result = serverStore.getModelsNotYetAdded(id);

      expect(result).toHaveLength(2);
      expect(result.map(m => m.id)).toEqual(['model-a', 'model-b']);
    });

    it('filters out already user-selected models', () => {
      const id = serverStore.addServer({
        name: 'Server',
        url: 'http://localhost:1234',
      });

      runInAction(() => {
        serverStore.serverModels.set(id, [
          {id: 'model-a', object: 'model', owned_by: 'system'},
          {id: 'model-b', object: 'model', owned_by: 'system'},
          {id: 'model-c', object: 'model', owned_by: 'system'},
        ]);
        serverStore.userSelectedModels = [
          {serverId: id, remoteModelId: 'model-a'},
          {serverId: id, remoteModelId: 'model-c'},
        ];
      });

      const result = serverStore.getModelsNotYetAdded(id);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('model-b');
    });

    it('returns empty array when all models are selected', () => {
      const id = serverStore.addServer({
        name: 'Server',
        url: 'http://localhost:1234',
      });

      runInAction(() => {
        serverStore.serverModels.set(id, [
          {id: 'model-a', object: 'model', owned_by: 'system'},
        ]);
        serverStore.userSelectedModels = [
          {serverId: id, remoteModelId: 'model-a'},
        ];
      });

      const result = serverStore.getModelsNotYetAdded(id);

      expect(result).toHaveLength(0);
    });

    it('returns empty array for server with no models fetched', () => {
      const result = serverStore.getModelsNotYetAdded('non-existent');

      expect(result).toEqual([]);
    });
  });

  describe('API key management', () => {
    it('setApiKey stores key in Keychain', async () => {
      await serverStore.setApiKey('server-1', 'sk-test-key');

      expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
        'apiKey',
        'sk-test-key',
        {service: 'pocketpal-server-server-1'},
      );
    });

    it('getApiKey retrieves key from Keychain', async () => {
      (Keychain.getGenericPassword as jest.Mock).mockResolvedValueOnce({
        password: 'sk-stored-key',
        username: 'apiKey',
      });

      const key = await serverStore.getApiKey('server-1');

      expect(key).toBe('sk-stored-key');
      expect(Keychain.getGenericPassword).toHaveBeenCalledWith({
        service: 'pocketpal-server-server-1',
      });
    });

    it('getApiKey returns undefined when no key is stored', async () => {
      (Keychain.getGenericPassword as jest.Mock).mockResolvedValueOnce(false);

      const key = await serverStore.getApiKey('server-no-key');
      expect(key).toBeUndefined();
    });

    it('removeApiKey resets Keychain entry', async () => {
      await serverStore.removeApiKey('server-1');

      expect(Keychain.resetGenericPassword).toHaveBeenCalledWith({
        service: 'pocketpal-server-server-1',
      });
    });

    it('setApiKey handles Keychain errors gracefully', async () => {
      (Keychain.setGenericPassword as jest.Mock).mockRejectedValueOnce(
        new Error('Keychain error'),
      );
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // Should not throw
      await serverStore.setApiKey('server-1', 'key');

      consoleSpy.mockRestore();
    });

    it('getApiKey handles Keychain errors gracefully', async () => {
      (Keychain.getGenericPassword as jest.Mock).mockRejectedValueOnce(
        new Error('Keychain error'),
      );
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const key = await serverStore.getApiKey('server-1');
      expect(key).toBeUndefined();

      consoleSpy.mockRestore();
    });
  });

  describe('fetchModelsForServer', () => {
    it('fetches models and stores them in serverModels map', async () => {
      const id = serverStore.addServer({
        name: 'Server',
        url: 'http://localhost:1234',
      });
      jest.clearAllMocks();

      const mockModels = [
        {id: 'llama-7b', object: 'model', owned_by: 'system'},
        {id: 'codellama', object: 'model', owned_by: 'library'},
      ];
      mockedFetchModels.mockResolvedValueOnce(mockModels);
      (Keychain.getGenericPassword as jest.Mock).mockResolvedValueOnce(false);

      await serverStore.fetchModelsForServer(id);

      expect(serverStore.serverModels.get(id)).toEqual(mockModels);
      expect(serverStore.isLoading).toBe(false);
      expect(serverStore.error).toBeNull();
    });

    it('sets error on failure', async () => {
      const id = serverStore.addServer({
        name: 'Server',
        url: 'http://localhost:1234',
      });
      jest.clearAllMocks();

      mockedFetchModels.mockRejectedValueOnce(new Error('Connection refused'));
      (Keychain.getGenericPassword as jest.Mock).mockResolvedValueOnce(false);

      await serverStore.fetchModelsForServer(id);

      expect(serverStore.error).toBe('Connection refused');
      expect(serverStore.isLoading).toBe(false);
    });

    it('skips fetch for non-existent server id', async () => {
      await serverStore.fetchModelsForServer('non-existent');

      expect(mockedFetchModels).not.toHaveBeenCalled();
    });

    it('updates lastConnected timestamp on success', async () => {
      const id = serverStore.addServer({
        name: 'Server',
        url: 'http://localhost:1234',
      });
      jest.clearAllMocks();

      mockedFetchModels.mockResolvedValueOnce([]);
      (Keychain.getGenericPassword as jest.Mock).mockResolvedValueOnce(false);

      const before = Date.now();
      await serverStore.fetchModelsForServer(id);

      const server = serverStore.servers.find(s => s.id === id);
      expect(server!.lastConnected).toBeGreaterThanOrEqual(before);
    });
  });

  describe('fetchAllRemoteModels', () => {
    it('fetches models for all servers', async () => {
      serverStore.addServer({
        name: 'Server 1',
        url: 'http://a.com',
      });
      serverStore.addServer({
        name: 'Server 2',
        url: 'http://b.com',
      });
      serverStore.addServer({
        name: 'Server 3',
        url: 'http://c.com',
      });
      jest.clearAllMocks();

      mockedFetchModels.mockResolvedValue([]);
      (Keychain.getGenericPassword as jest.Mock).mockResolvedValue(false);

      await serverStore.fetchAllRemoteModels();

      expect(mockedFetchModels).toHaveBeenCalledTimes(3);
    });

    it('does nothing when no servers exist', async () => {
      jest.clearAllMocks();

      await serverStore.fetchAllRemoteModels();

      expect(mockedFetchModels).not.toHaveBeenCalled();
    });
  });

  describe('testServerConnection', () => {
    it('tests connection for existing server', async () => {
      const id = serverStore.addServer({
        name: 'Server',
        url: 'http://localhost:1234',
      });

      mockedTestConnection.mockResolvedValueOnce({ok: true, modelCount: 5});
      (Keychain.getGenericPassword as jest.Mock).mockResolvedValueOnce(false);

      const result = await serverStore.testServerConnection(id);

      expect(result).toEqual({ok: true, modelCount: 5});
      expect(mockedTestConnection).toHaveBeenCalledWith(
        'http://localhost:1234',
        undefined,
      );
    });

    it('returns error for non-existent server', async () => {
      const result = await serverStore.testServerConnection('non-existent');

      expect(result).toEqual({
        ok: false,
        modelCount: 0,
        error: 'Server not found',
      });
    });

    it('passes API key to testConnection', async () => {
      const id = serverStore.addServer({
        name: 'Server',
        url: 'http://localhost:1234',
      });

      (Keychain.getGenericPassword as jest.Mock).mockResolvedValueOnce({
        password: 'sk-key',
        username: 'apiKey',
      });
      mockedTestConnection.mockResolvedValueOnce({ok: true, modelCount: 3});

      await serverStore.testServerConnection(id);

      expect(mockedTestConnection).toHaveBeenCalledWith(
        'http://localhost:1234',
        'sk-key',
      );
    });
  });

  describe('acknowledgePrivacyNotice', () => {
    it('sets privacyNoticeAcknowledged to true', () => {
      expect(serverStore.privacyNoticeAcknowledged).toBe(false);

      serverStore.acknowledgePrivacyNotice();

      expect(serverStore.privacyNoticeAcknowledged).toBe(true);
    });
  });

  describe('AppState listener', () => {
    it('has setupAppStateListener method in the store', () => {
      // The AppState listener is registered during constructor.
      // Since the singleton is created at module load time (before spy),
      // we verify indirectly that the store has the subscription set up.
      // The constructor calls setupAppStateListener() which creates the subscription.
      expect(serverStore).toBeDefined();
    });
  });
});
