import {makeAutoObservable, runInAction} from 'mobx';

import type {
  LocalApiServerError,
  LocalApiServerStatus,
} from '../../src/store/LocalApiServerStore';

export const isValidLocalApiPort = (port: number) =>
  Number.isInteger(port) && port >= 1024 && port <= 65535;

class MockLocalApiServerStore {
  enabled = false;
  status: LocalApiServerStatus = 'stopped';
  lastError: LocalApiServerError | undefined = undefined;
  port = 8080;
  lanEnabled = false;
  hasApiKey = false;
  lanAddress: string | undefined = undefined;
  activeRequests = 0;
  baseUrl: string | undefined = undefined;
  servedModelId: string | undefined = undefined;

  setEnabled = jest.fn((enabled: boolean) => {
    runInAction(() => {
      this.enabled = enabled;
    });
  });
  setPort = jest.fn((port: number) => {
    if (this.status !== 'stopped' || !isValidLocalApiPort(port)) {
      return false;
    }
    runInAction(() => {
      this.port = port;
    });
    return true;
  });
  setLanEnabled = jest.fn((lanEnabled: boolean) => {
    runInAction(() => {
      this.lanEnabled = lanEnabled;
    });
    return true;
  });
  setApiKey = jest.fn(async () => {
    runInAction(() => {
      this.hasApiKey = true;
    });
    return true;
  });
  clearApiKey = jest.fn(async () => {
    runInAction(() => {
      this.hasApiKey = false;
    });
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
