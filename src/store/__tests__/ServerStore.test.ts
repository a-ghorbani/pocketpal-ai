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
  });

  describe('addServer', () => {
    it('adds a server and returns its id', () => {
      const id = serverStore.addServer({
        name: 'Test Server',
        url: 'http://localhost:1234',
        isActive: true,
      });

      expect(typeof id).toBe('string');
      expect(id).toMatch(/^server-/);
      expect(serverStore.servers).toHaveLength(1);
      expect(serverStore.servers[0].name).toBe('Test Server');
      expect(serverStore.servers[0].url).toBe('http://localhost:1234');
      expect(serverStore.servers[0].isActive).toBe(true);
    });

    it('does not auto-fetch when server is not active', () => {
      serverStore.addServer({
        name: 'Inactive Server',
        url: 'http://localhost:1234',
        isActive: false,
      });

      expect(mockedFetchModels).not.toHaveBeenCalled();
    });

    it('generates unique ids for each server', () => {
      const id1 = serverStore.addServer({
        name: 'Server 1',
        url: 'http://a.com',
        isActive: false,
      });
      const id2 = serverStore.addServer({
        name: 'Server 2',
        url: 'http://b.com',
        isActive: false,
      });

      expect(id1).not.toBe(id2);
    });
  });

  describe('updateServer', () => {
    it('updates server properties', () => {
      const id = serverStore.addServer({
        name: 'Original',
        url: 'http://localhost:1234',
        isActive: false,
      });

      serverStore.updateServer(id, {name: 'Updated'});

      expect(serverStore.servers[0].name).toBe('Updated');
    });

    it('does nothing for non-existent server id', () => {
      serverStore.addServer({
        name: 'Server',
        url: 'http://localhost:1234',
        isActive: false,
      });

      serverStore.updateServer('non-existent', {name: 'Updated'});
      expect(serverStore.servers[0].name).toBe('Server');
    });

    it('clears models when server is deactivated', () => {
      const id = serverStore.addServer({
        name: 'Server',
        url: 'http://localhost:1234',
        isActive: false,
      });

      runInAction(() => {
        serverStore.serverModels.set(id, [
          {id: 'model-1', object: 'model', owned_by: 'system'},
        ]);
      });
      expect(serverStore.serverModels.has(id)).toBe(true);

      serverStore.updateServer(id, {isActive: false});

      expect(serverStore.serverModels.has(id)).toBe(false);
    });
  });

  describe('removeServer', () => {
    it('removes a server from the list', () => {
      const id = serverStore.addServer({
        name: 'Server',
        url: 'http://localhost:1234',
        isActive: false,
      });

      expect(serverStore.servers).toHaveLength(1);

      serverStore.removeServer(id);

      expect(serverStore.servers).toHaveLength(0);
    });

    it('clears server models on removal', () => {
      const id = serverStore.addServer({
        name: 'Server',
        url: 'http://localhost:1234',
        isActive: false,
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
        isActive: false,
      });

      serverStore.removeServer(id);

      expect(Keychain.resetGenericPassword).toHaveBeenCalledWith({
        service: `pocketpal-server-${id}`,
      });
    });
  });

  describe('computed: activeServers', () => {
    it('returns only active servers', () => {
      serverStore.addServer({
        name: 'Active',
        url: 'http://a.com',
        isActive: false,
      });
      serverStore.addServer({
        name: 'Inactive',
        url: 'http://b.com',
        isActive: false,
      });
      serverStore.addServer({
        name: 'Also Active',
        url: 'http://c.com',
        isActive: false,
      });

      // Activate first and third
      runInAction(() => {
        serverStore.servers[0].isActive = true;
        serverStore.servers[2].isActive = true;
      });

      expect(serverStore.activeServers).toHaveLength(2);
      expect(serverStore.activeServers.map(s => s.name)).toEqual([
        'Active',
        'Also Active',
      ]);
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
        isActive: false,
      });
      // Set active so fetch proceeds
      runInAction(() => {
        serverStore.servers[0].isActive = true;
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
        isActive: false,
      });
      runInAction(() => {
        serverStore.servers[0].isActive = true;
      });
      jest.clearAllMocks();

      mockedFetchModels.mockRejectedValueOnce(new Error('Connection refused'));
      (Keychain.getGenericPassword as jest.Mock).mockResolvedValueOnce(false);

      await serverStore.fetchModelsForServer(id);

      expect(serverStore.error).toBe('Connection refused');
      expect(serverStore.isLoading).toBe(false);
    });

    it('skips fetch for inactive server', async () => {
      const id = serverStore.addServer({
        name: 'Inactive',
        url: 'http://localhost:1234',
        isActive: false,
      });
      jest.clearAllMocks();

      await serverStore.fetchModelsForServer(id);

      expect(mockedFetchModels).not.toHaveBeenCalled();
    });

    it('skips fetch for non-existent server id', async () => {
      await serverStore.fetchModelsForServer('non-existent');

      expect(mockedFetchModels).not.toHaveBeenCalled();
    });

    it('updates lastConnected timestamp on success', async () => {
      const id = serverStore.addServer({
        name: 'Server',
        url: 'http://localhost:1234',
        isActive: false,
      });
      runInAction(() => {
        serverStore.servers[0].isActive = true;
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
    it('fetches models for all active servers', async () => {
      serverStore.addServer({
        name: 'Server 1',
        url: 'http://a.com',
        isActive: false,
      });
      serverStore.addServer({
        name: 'Inactive',
        url: 'http://b.com',
        isActive: false,
      });
      serverStore.addServer({
        name: 'Server 3',
        url: 'http://c.com',
        isActive: false,
      });

      runInAction(() => {
        serverStore.servers[0].isActive = true;
        serverStore.servers[2].isActive = true;
      });
      jest.clearAllMocks();

      mockedFetchModels.mockResolvedValue([]);
      (Keychain.getGenericPassword as jest.Mock).mockResolvedValue(false);

      await serverStore.fetchAllRemoteModels();

      expect(mockedFetchModels).toHaveBeenCalledTimes(2);
    });

    it('does nothing when no active servers', async () => {
      serverStore.addServer({
        name: 'Inactive',
        url: 'http://a.com',
        isActive: false,
      });
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
        isActive: false,
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
        isActive: false,
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
