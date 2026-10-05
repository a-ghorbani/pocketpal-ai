import {makeAutoObservable, observable} from 'mobx';

import {mockServerStore} from './serverStore';
import {profileFor} from '../../src/api/servers';
import {
  hasRouterStatus,
  rowStateFromList,
} from '../../src/api/llamaServer/routerWire';
import type {RouterRecord} from '../../src/store/RouterStore';

/**
 * Reads derive from the mock server store through the same pure functions the
 * real store uses, so a test drives them by setting list state, and seeds
 * operations by putting records in `records`.
 */
class MockRouterStore {
  records = observable.map<string, Partial<RouterRecord>>();
  observedEviction = new Set<string>();

  ensureLoaded: jest.Mock;
  ensureReady: jest.Mock;
  unload: jest.Mock;
  cancel: jest.Mock;
  dismiss: jest.Mock;
  setPickerServer: jest.Mock;

  constructor() {
    makeAutoObservable(this, {
      ensureLoaded: false,
      ensureReady: false,
      unload: false,
      cancel: false,
      dismiss: false,
      setPickerServer: false,
    });
    this.ensureLoaded = jest.fn().mockResolvedValue('ready');
    this.ensureReady = jest.fn().mockResolvedValue(undefined);
    this.unload = jest.fn();
    this.cancel = jest.fn();
    this.dismiss = jest.fn();
    this.setPickerServer = jest.fn();
  }

  isRouter(serverId: string): boolean {
    const server = mockServerStore.servers.find(s => s.id === serverId);
    if (!server || !profileFor(server.serverType).hasRouter) {
      return false;
    }
    const rows = mockServerStore.serverModels.get(serverId) ?? [];
    if (rows.length > 0) {
      return rows.some(hasRouterStatus);
    }
    return mockServerStore.listReads[serverId]?.hasModelsKey === false;
  }

  rowState(serverId: string, remoteModelId: string) {
    return rowStateFromList(
      mockServerStore.serverModels.get(serverId) ?? [],
      remoteModelId,
      mockServerStore.listReads[serverId]?.stale !== false,
    );
  }

  residentCount(serverId: string): number {
    return (mockServerStore.serverModels.get(serverId) ?? []).filter(row => {
      const record = this.recordFor(serverId, row.id);
      if (record?.kind === 'unload' && record && this.owns(record)) {
        return false;
      }
      const state = this.rowState(serverId, row.id);
      return state === 'loaded' || state === 'sleeping';
    }).length;
  }

  recordFor(serverId: string, remoteModelId: string) {
    return this.records.get(`${serverId}/${remoteModelId}`);
  }

  owns(record: Partial<RouterRecord>): boolean {
    return (
      this.records.get(record.key ?? '') === record &&
      record.failure === undefined
    );
  }
}

export const mockRouterStore = new MockRouterStore();
