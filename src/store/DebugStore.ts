import * as RNFS from '@dr.pogodin/react-native-fs';
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
const LOG_FILE_PATH = `${RNFS.DocumentDirectoryPath}/console.log`;
const LOG_FILE_ENCODING = 'utf8';

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

function serializeLogEntry(entry: DebugLogEntry): string {
  return `${JSON.stringify(entry)}\n`;
}

function parseLogFile(content: string): DebugLogEntry[] {
  if (!content.trim()) {
    return [];
  }

  return content
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line) as DebugLogEntry;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is DebugLogEntry => entry !== null)
    .slice(-MAX_LOG_ENTRIES);
}

export class DebugStore {
  logs: DebugLogEntry[] = [];
  captureConsole = true;
  // 类1: 引擎输入 — 底层实际收到的参数包，默认开启
  logEngineInput = true;
  // 类2: 引擎输出 — 底层吐出的结果与流式事件，默认开启
  logEngineOutput = true;
  // 类3: Prompt 构建 — 模板选择、完整 prompt 文本，默认关闭
  logPromptBuild = false;
  // 类4: 参数来源 — session 设置、thinkingAssembly 推导链，默认关闭
  logParamSource = false;
  // 类5: 模型生命周期 — 加载/释放/前后台切换，默认关闭
  logModelLifecycle = false;
  // 类6: 聊天导航 — cursor/scroll/目标位置追踪，默认关闭
  logChatNavigation = false;
  // 类7: 网络链路 — fetch/axios 请求、响应、错误全链路追踪，默认开启
  logNetwork = true;
  private fileWriteQueue: Promise<void> = Promise.resolve();
  private hasLoadedLogs = false;
  private loadLogsPromise: Promise<void> | null = null;

  constructor() {
    makeAutoObservable(this);
    makePersistable(this, {
      name: 'DebugStore',
      properties: [
        'captureConsole',
        'logEngineInput',
        'logEngineOutput',
        'logPromptBuild',
        'logParamSource',
        'logModelLifecycle',
        'logChatNavigation',
        'logNetwork',
      ],
      storage: AsyncStorage,
    });

    this.ensureLoaded();
  }

  private enqueueFileWrite(task: () => Promise<void>) {
    this.fileWriteQueue = this.fileWriteQueue.then(task).catch(() => undefined);
    return this.fileWriteQueue;
  }

  private async loadLogsFromFile() {
    try {
      const exists = await RNFS.exists(LOG_FILE_PATH);
      if (!exists) {
        runInAction(() => {
          this.hasLoadedLogs = true;
        });
        return;
      }

      const content = await RNFS.readFile(LOG_FILE_PATH, LOG_FILE_ENCODING);
      const fileLogs = parseLogFile(content);

      runInAction(() => {
        const mergedLogs = [...fileLogs, ...this.logs];
        this.logs = mergedLogs.slice(-MAX_LOG_ENTRIES);
        this.hasLoadedLogs = true;
      });
    } catch {
      runInAction(() => {
        this.hasLoadedLogs = true;
      });
    }
  }

  private rewriteLogFile(entries: DebugLogEntry[]) {
    return this.enqueueFileWrite(async () => {
      const content = entries.map(serializeLogEntry).join('');
      await RNFS.writeFile(LOG_FILE_PATH, content, LOG_FILE_ENCODING);
    });
  }

  ensureLoaded() {
    if (this.hasLoadedLogs) {
      return;
    }

    if (!this.loadLogsPromise) {
      this.loadLogsPromise = this.loadLogsFromFile().finally(() => {
        this.loadLogsPromise = null;
      });
    }
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

    this.enqueueFileWrite(async () => {
      await RNFS.appendFile(
        LOG_FILE_PATH,
        serializeLogEntry(entry),
        LOG_FILE_ENCODING,
      );

      if (this.logs.length >= MAX_LOG_ENTRIES) {
        const currentLogs = this.logs.slice(-MAX_LOG_ENTRIES);
        const content = currentLogs.map(serializeLogEntry).join('');
        await RNFS.writeFile(LOG_FILE_PATH, content, LOG_FILE_ENCODING);
      }
    });
  }

  clearLogs() {
    runInAction(() => {
      this.logs = [];
    });

    this.rewriteLogFile([]);
  }

  setCaptureConsole(enabled: boolean) {
    runInAction(() => {
      this.captureConsole = enabled;
      if (!enabled) {
        this.logNetwork = false;
      }
    });
  }

  setLogEngineInput(enabled: boolean) {
    runInAction(() => {
      this.logEngineInput = enabled;
    });
  }

  setLogEngineOutput(enabled: boolean) {
    runInAction(() => {
      this.logEngineOutput = enabled;
    });
  }

  setLogPromptBuild(enabled: boolean) {
    runInAction(() => {
      this.logPromptBuild = enabled;
    });
  }

  setLogParamSource(enabled: boolean) {
    runInAction(() => {
      this.logParamSource = enabled;
    });
  }

  setLogModelLifecycle(enabled: boolean) {
    runInAction(() => {
      this.logModelLifecycle = enabled;
    });
  }

  setLogChatNavigation(enabled: boolean) {
    runInAction(() => {
      this.logChatNavigation = enabled;
    });
  }

  setLogNetwork(enabled: boolean) {
    runInAction(() => {
      this.logNetwork = enabled && this.captureConsole;
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
