import {makeAutoObservable, observable} from 'mobx';

import {ServerConfig} from '../../src/utils/types';
import {RemoteModelInfo} from '../../src/api/openai';

class MockServerStore {
  servers: ServerConfig[] = [];
  serverModels: Map<string, RemoteModelInfo[]> = observable.map();
  userSelectedModels: Array<{serverId: string; remoteModelId: string}> = [];
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
  fetchAllRemoteModels: jest.Mock;
  testServerConnection: jest.Mock;
  acknowledgePrivacyNotice: jest.Mock;
  addUserSelectedModel: jest.Mock;
  removeUserSelectedModel: jest.Mock;
  removeServerIfOrphaned: jest.Mock;
  getModelsNotYetAdded: jest.Mock;
  getUserSelectedModelsForServer: jest.Mock;

  constructor() {
    makeAutoObservable(this, {
      addServer: false,
      updateServer: false,
      removeServer: false,
      setApiKey: false,
      getApiKey: false,
      removeApiKey: false,
      fetchModelsForServer: false,
      fetchAllRemoteModels: false,
      testServerConnection: false,
      acknowledgePrivacyNotice: false,
      addUserSelectedModel: false,
      removeUserSelectedModel: false,
      removeServerIfOrphaned: false,
      getModelsNotYetAdded: false,
      getUserSelectedModelsForServer: false,
    });
    this.addServer = jest.fn().mockReturnValue('mock-server-id');
    this.updateServer = jest.fn();
    this.removeServer = jest.fn();
    this.setApiKey = jest.fn().mockResolvedValue(undefined);
    this.getApiKey = jest.fn().mockResolvedValue(undefined);
    this.removeApiKey = jest.fn().mockResolvedValue(undefined);
    this.fetchModelsForServer = jest.fn().mockResolvedValue(undefined);
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
  }
}

export const mockServerStore = new MockServerStore();
