import AsyncStorage from '@react-native-async-storage/async-storage';
import {makeAutoObservable, runInAction} from 'mobx';
import {makePersistable} from 'mobx-persist-store';

export interface ApiServerLogEntry {
  id: string;
  timestamp: number;
  method: string;
  path: string;
  status: number | null;
  durationMs?: number;
  error?: string;
}

const MAX_LOG_ENTRIES = 100;

function generateApiKey(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'pp-sk-';
  for (let i = 0; i < 32; i++) {
    key += chars[Math.floor(Math.random() * chars.length)];
  }
  return key;
}

export class ApiServerStore {
  running: boolean = false;
  port: number = 8080;
  apiKey: string = '';
  requireAuth: boolean = true;
  autoStart: boolean = false;
  lastError: string | null = null;
  requestLogs: ApiServerLogEntry[] = [];
  activeRequests: number = 0;

  constructor() {
    makeAutoObservable(this);
    makePersistable(this, {
      name: 'ApiServerStore',
      properties: ['port', 'apiKey', 'requireAuth', 'autoStart'],
      storage: AsyncStorage,
    }).then(() => {
      if (!this.apiKey) {
        runInAction(() => {
          this.apiKey = generateApiKey();
        });
      }
    });
    if (!this.apiKey) {
      this.apiKey = generateApiKey();
    }
  }

  setRunning(value: boolean) {
    runInAction(() => {
      this.running = value;
      if (!value) {
        this.activeRequests = 0;
      }
    });
  }

  setPort(port: number) {
    runInAction(() => {
      this.port = port;
    });
  }

  setApiKey(key: string) {
    runInAction(() => {
      this.apiKey = key.trim() || generateApiKey();
    });
  }

  regenerateApiKey() {
    runInAction(() => {
      this.apiKey = generateApiKey();
    });
  }

  setRequireAuth(value: boolean) {
    runInAction(() => {
      this.requireAuth = value;
    });
  }

  setAutoStart(value: boolean) {
    runInAction(() => {
      this.autoStart = value;
    });
  }

  setLastError(error: string | null) {
    runInAction(() => {
      this.lastError = error;
    });
  }

  incrementActiveRequests() {
    runInAction(() => {
      this.activeRequests += 1;
    });
  }

  decrementActiveRequests() {
    runInAction(() => {
      this.activeRequests = Math.max(0, this.activeRequests - 1);
    });
  }

  addRequestLog(entry: Omit<ApiServerLogEntry, 'id' | 'timestamp'>) {
    runInAction(() => {
      const logEntry: ApiServerLogEntry = {
        ...entry,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
      };
      this.requestLogs = [logEntry, ...this.requestLogs].slice(
        0,
        MAX_LOG_ENTRIES,
      );
    });
  }

  clearRequestLogs() {
    runInAction(() => {
      this.requestLogs = [];
    });
  }
}

export const apiServerStore = new ApiServerStore();
