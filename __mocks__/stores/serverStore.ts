import {makeAutoObservable, observable} from 'mobx';

import {
  RemoteModelCaps,
  RemoteModelPrefs,
  ServerConfig,
  ServerPresence,
  ServerPresenceEntry,
} from '../../src/utils/types';
import {readServerIsSleeping} from '../../src/utils/serverPresence';
import {ReasoningCapability} from '../../src/utils/reasoningCapability';
import {RemoteModelInfo} from '../../src/api/openai';
import {deriveListCapsMap} from '../../src/utils/listCaps';

class MockServerStore {
  servers: ServerConfig[] = [];
  serverModels: Map<string, RemoteModelInfo[]> = observable.map();

  // Derived from the live mock state, exactly as the real store derives it, so
  // a suite that mutates `servers` or `serverModels` exercises the real
  // derivation and stays reactive. A fixed answer here would let the card
  // scenarios pass with the derivation broken.
  get listCaps() {
    return deriveListCapsMap(this.servers, this.serverModels);
  }

  userSelectedModels: Array<{serverId: string; remoteModelId: string}> = [];
  remoteReasoning: Record<string, ReasoningCapability> = {};
  remoteCaps: Record<string, RemoteModelCaps> = {};
  serverPresence: Record<string, ServerPresenceEntry> = {};
  favouriteRemoteModels: Record<string, true> = {};
  lastUsedRemoteModel: Record<string, string> = {};
  isLoading = false;
  error: string | null = null;
  privacyNoticeAcknowledged = false;

  addServer: jest.Mock;
  updateServer: jest.Mock;
  removeServer: jest.Mock;
  setApiKey: jest.Mock;
  getApiKey: jest.Mock;
  removeApiKey: jest.Mock;
  fetchModelsForServer: jest.Mock;
  fetchRemoteModelCaps: jest.Mock;
  fetchAllRemoteModels: jest.Mock;
  testServerConnection: jest.Mock;
  acknowledgePrivacyNotice: jest.Mock;
  addUserSelectedModel: jest.Mock;
  removeUserSelectedModel: jest.Mock;
  removeServerIfOrphaned: jest.Mock;
  getModelsNotYetAdded: jest.Mock;
  getUserSelectedModelsForServer: jest.Mock;
  recordRemoteReasoningObserved: jest.Mock;
  setRemoteReasoningOverride: jest.Mock;
  probeServerPresence: jest.Mock;
  toggleFavourite: jest.Mock;
  recordLastUsedRemoteModel: jest.Mock;

  // Derived from the live mock state, like `listCaps`, so a suite that sets
  // `serverPresence` exercises the real fold and stays reactive.
  isProbing = (serverId: string): boolean =>
    this.serverPresence[serverId]?.probing ?? false;

  presenceFor = (serverId: string): ServerPresence => {
    const reachability = this.serverPresence[serverId]?.reachability;
    if (reachability === undefined || reachability === 'unknown') {
      return 'unknown';
    }
    if (reachability === 'unreachable') {
      return 'unreachable';
    }
    return readServerIsSleeping(serverId) === true ? 'asleep' : 'reachable';
  };

  remoteModelPrefsFor = (serverId: string): RemoteModelPrefs => ({
    favouriteModelIds: Object.keys(this.favouriteRemoteModels)
      .filter(k => k.startsWith(`${serverId}/`))
      .map(k => k.slice(serverId.length + 1)),
    lastUsedModelId: this.lastUsedRemoteModel[serverId],
  });

  constructor() {
    makeAutoObservable(this, {
      addServer: false,
      updateServer: false,
      removeServer: false,
      setApiKey: false,
      getApiKey: false,
      removeApiKey: false,
      fetchModelsForServer: false,
      fetchRemoteModelCaps: false,
      fetchAllRemoteModels: false,
      testServerConnection: false,
      acknowledgePrivacyNotice: false,
      addUserSelectedModel: false,
      removeUserSelectedModel: false,
      removeServerIfOrphaned: false,
      getModelsNotYetAdded: false,
      getUserSelectedModelsForServer: false,
      recordRemoteReasoningObserved: false,
      setRemoteReasoningOverride: false,
      probeServerPresence: false,
      toggleFavourite: false,
      recordLastUsedRemoteModel: false,
    });
    this.probeServerPresence = jest.fn().mockResolvedValue(undefined);
    this.toggleFavourite = jest.fn();
    this.recordLastUsedRemoteModel = jest.fn();
    this.addServer = jest.fn().mockReturnValue('mock-server-id');
    this.updateServer = jest.fn();
    this.removeServer = jest.fn();
    this.setApiKey = jest.fn().mockResolvedValue(undefined);
    this.getApiKey = jest.fn().mockResolvedValue(undefined);
    this.removeApiKey = jest.fn().mockResolvedValue(undefined);
    this.fetchModelsForServer = jest.fn().mockResolvedValue(undefined);
    this.fetchRemoteModelCaps = jest.fn().mockResolvedValue(undefined);
    this.fetchAllRemoteModels = jest.fn().mockResolvedValue(undefined);
    this.testServerConnection = jest
      .fn()
      .mockResolvedValue({ok: true, modelCount: 3});
    this.acknowledgePrivacyNotice = jest.fn();
    this.addUserSelectedModel = jest.fn();
    this.removeUserSelectedModel = jest.fn();
    this.removeServerIfOrphaned = jest.fn();
    this.getModelsNotYetAdded = jest.fn().mockReturnValue([]);
    this.getUserSelectedModelsForServer = jest.fn().mockReturnValue([]);
    this.recordRemoteReasoningObserved = jest.fn();
    this.setRemoteReasoningOverride = jest.fn();
  }
}

export const mockServerStore = new MockServerStore();
