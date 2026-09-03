import {makeAutoObservable, observable} from 'mobx';

import {RemoteModelCaps, ServerConfig} from '../../src/utils/types';
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
  ensureRouterModelLoaded: jest.Mock;
  unloadRouterModel: jest.Mock;
  startRouterDownload: jest.Mock;
  cancelRouterOp: jest.Mock;
  openRouterStream: jest.Mock;
  closeRouterStream: jest.Mock;
  dismissRouterReason: jest.Mock;

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
      ensureRouterModelLoaded: false,
      unloadRouterModel: false,
      startRouterDownload: false,
      cancelRouterOp: false,
      openRouterStream: false,
      closeRouterStream: false,
      dismissRouterReason: false,
    });
    this.addServer = jest.fn().mockReturnValue('mock-server-id');
    this.updateServer = jest.fn();
    this.removeServer = jest.fn();
    this.setApiKey = jest.fn().mockResolvedValue(undefined);
    this.getApiKey = jest.fn().mockResolvedValue(undefined);
    this.removeApiKey = jest.fn().mockResolvedValue(undefined);
    this.fetchModelsForServer = jest.fn().mockResolvedValue(undefined);
    this.fetchRemoteModelCaps = jest.fn().mockResolvedValue(undefined);
    this.ensureRouterModelLoaded = jest.fn().mockResolvedValue('not-router');
    this.unloadRouterModel = jest.fn().mockResolvedValue('ready');
    this.startRouterDownload = jest.fn().mockResolvedValue({accepted: true});
    this.cancelRouterOp = jest.fn().mockResolvedValue(undefined);
    this.openRouterStream = jest.fn().mockResolvedValue(undefined);
    this.closeRouterStream = jest.fn();
    this.dismissRouterReason = jest.fn();
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
