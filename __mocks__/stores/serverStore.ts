import {makeAutoObservable, observable} from 'mobx';

import {ServerConfig} from '../../src/utils/types';
import {RemoteModelInfo} from '../../src/api/openai';

class MockServerStore {
  servers: ServerConfig[] = [];
  serverModels: Map<string, RemoteModelInfo[]> = observable.map();
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
  }

  get activeServers() {
    return this.servers.filter(s => s.isActive);
  }
}

export const mockServerStore = new MockServerStore();
