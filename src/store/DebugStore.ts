import AsyncStorage from '@react-native-async-storage/async-storage';
import {makeAutoObservable, runInAction} from 'mobx';
import {makePersistable} from 'mobx-persist-store';

type LogLevel = 'log' | 'warn' | 'error';

export interface DebugLogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  scope?: string;
  message: string;
}

const MAX_LOG_ENTRIES = 400;

function formatArg(arg: unknown): string {
  if (typeof arg === 'string') {
    return arg;
  }

  if (arg instanceof Error) {
    return `${arg.name}: ${arg.message}`;
  }

  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

export class DebugStore {
  logs: DebugLogEntry[] = [];
  captureConsole = true;
  visionDebugEnabled = false;

  constructor() {
    makeAutoObservable(this);
    makePersistable(this, {
      name: 'DebugStore',
      properties: ['captureConsole', 'visionDebugEnabled'],
      storage: AsyncStorage,
    });
  }

  addLog(level: LogLevel, args: unknown[], scope?: string) {
    if (!this.captureConsole) {
      return;
    }

    const entry: DebugLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      level,
      scope,
      message: args.map(formatArg).join(' '),
    };

    runInAction(() => {
      this.logs = [...this.logs.slice(-(MAX_LOG_ENTRIES - 1)), entry];
    });
  }

  clearLogs() {
    runInAction(() => {
      this.logs = [];
    });
  }

  setCaptureConsole(enabled: boolean) {
    runInAction(() => {
      this.captureConsole = enabled;
    });
  }

  setVisionDebugEnabled(enabled: boolean) {
    runInAction(() => {
      this.visionDebugEnabled = enabled;
    });
  }

  get formattedLogs(): string {
    return this.logs
      .map(entry => {
        const timestamp = new Date(entry.timestamp).toISOString();
        const scopePart = entry.scope ? ` [${entry.scope}]` : '';
        return `${timestamp} ${entry.level.toUpperCase()}${scopePart} ${entry.message}`;
      })
      .join('\n');
  }
}

export const debugStore = new DebugStore();
