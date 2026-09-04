import {makeAutoObservable, observable} from 'mobx';

import {RemoteModelCaps, ServerConfig} from '../../src/utils/types';
import {ReasoningCapability} from '../../src/utils/reasoningCapability';
import {RemoteModelInfo} from '../../src/api/openai';
import {deriveListCapsMap} from '../../src/utils/listCaps';
import {
  mapRowStatus,
  rowMatchesKey,
  RouterFailure,
  RouterLive,
  RouterOp,
  RouterRowState,
  RouterStreamCap,
} from '../../src/utils/routerState';

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

  // Router mode, mirroring the real store's live-only shape. The read helpers
  // below go through the same pure mapping the store uses, so a test drives
  // them by setting this state rather than by stubbing an answer.
  routerEvents: Record<string, RouterLive> = {};
  routerOps: Record<string, RouterOp> = {};
  routerReasons: Record<string, RouterFailure> = {};
  routerStream: {serverId: string; state: 'connecting' | 'open'} | null = null;
  routerPolls: Set<string> = new Set();
  routerStreamCap: Record<string, RouterStreamCap> = {};
  routerObservedEviction: Set<string> = new Set();
  routerListShape: Record<
    string,
    {hasModelsKey: boolean; startedAt: number; seq: number}
  > = {};

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

  isRouterServer(serverId: string): boolean {
    const server = this.servers.find(s => s.id === serverId);
    if (server?.serverType !== 'llama.cpp') {
      return false;
    }
    const rows = this.serverModels.get(serverId) ?? [];
    return (
      rows.some(row => row.status !== null && typeof row.status === 'object') ||
      this.routerListShape[serverId]?.hasModelsKey === false
    );
  }

  routerRowState(serverId: string, remoteModelId: string): RouterRowState {
    const live = this.routerEvents[`${serverId}/${remoteModelId}`];
    if (live?.status) {
      return live.status;
    }
    const state = mapRowStatus(
      (this.serverModels.get(serverId) ?? []).find(row =>
        rowMatchesKey(row, remoteModelId),
      ),
    );
    return state === 'absent' &&
      this.routerOps[`${serverId}/${remoteModelId}`]?.kind === 'download'
      ? 'downloading'
      : state;
  }

  routerResidentCount(serverId: string): number {
    return (this.serverModels.get(serverId) ?? []).filter(row => {
      const state = this.routerRowState(serverId, row.id);
      return state === 'loaded' || state === 'loading' || state === 'sleeping';
    }).length;
  }

  routerStreamCapFor(serverId: string): RouterStreamCap {
    return this.routerStreamCap[serverId] ?? 'unknown';
  }

  routerOp(serverId: string, remoteModelId: string): RouterOp | undefined {
    return this.routerOps[`${serverId}/${remoteModelId}`];
  }

  routerLive(serverId: string, remoteModelId: string): RouterLive | undefined {
    return this.routerEvents[`${serverId}/${remoteModelId}`];
  }

  routerReason(
    serverId: string,
    remoteModelId: string,
  ): RouterFailure | undefined {
    return this.routerReasons[`${serverId}/${remoteModelId}`];
  }

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
