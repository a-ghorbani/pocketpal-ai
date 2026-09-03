import {makeAutoObservable, observable} from 'mobx';

import {
  RemoteModelCaps,
  RemoteModelPresence,
  RemoteModelProps,
  ServerConfig,
} from '../../src/utils/types';
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

  sleepStateFor(serverId: string): 'awake' | 'asleep' | 'unknown' {
    const server = this.servers.find(s => s.id === serverId);
    if (!server) {
      return 'unknown';
    }
    const prefix = `${serverId}/`;
    let latest: RemoteModelPresence | undefined;
    for (const [key, entry] of Object.entries(this.remotePresence)) {
      if (!key.startsWith(prefix) || entry.probedUrl !== server.url) {
        continue;
      }
      if (!latest || entry.at > latest.at) {
        latest = entry;
      }
    }
    if (!latest) {
      return 'unknown';
    }
    return latest.isSleeping ? 'asleep' : 'awake';
  }

  userSelectedModels: Array<{serverId: string; remoteModelId: string}> = [];
  remoteReasoning: Record<string, ReasoningCapability> = {};
  remoteCaps: Record<string, RemoteModelCaps> = {};
  remoteProps: Record<string, RemoteModelProps> = {};
  remotePresence: Record<string, RemoteModelPresence> = {};
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
    });
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
