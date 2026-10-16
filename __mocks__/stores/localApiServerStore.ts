import {makeAutoObservable} from 'mobx';

import type {LocalApiServerStatus} from '../../src/store/LocalApiServerStore';

class MockLocalApiServerStore {
  enabled = false;
  status: LocalApiServerStatus = 'stopped';
  lastError: string | undefined = undefined;
  port = 8080;
  lanEnabled = false;
  hasApiKey = false;
  lanAddress: string | undefined = undefined;
  activeRequests = 0;
  baseUrl: string | undefined = undefined;
  servedModelId: string | undefined = undefined;

  setEnabled = jest.fn((enabled: boolean) => {
    this.enabled = enabled;
  });
  setPort = jest.fn((port: number) => {
    if (this.status !== 'stopped' || port < 1024 || port > 65535) {
      return false;
    }
    this.port = port;
    return true;
  });
  setLanEnabled = jest.fn((lanEnabled: boolean) => {
    this.lanEnabled = lanEnabled;
    return true;
  });
  setApiKey = jest.fn(async () => {
    this.hasApiKey = true;
    return true;
  });
  clearApiKey = jest.fn(async () => {
    this.hasApiKey = false;
    return true;
  });
  start = jest.fn();
  stop = jest.fn();

  constructor() {
    makeAutoObservable(this, {
      setEnabled: false,
      setPort: false,
      setLanEnabled: false,
      setApiKey: false,
      clearApiKey: false,
      start: false,
      stop: false,
    });
  }
}

export const mockLocalApiServerStore = new MockLocalApiServerStore();
