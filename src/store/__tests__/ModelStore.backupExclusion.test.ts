jest.unmock('../../store');
import {runInAction} from 'mobx';
import {Platform} from 'react-native';
import * as RNFS from '@dr.pogodin/react-native-fs';

import {readDeviceSignals} from '../../services/deviceRules/signals';
import {Model, ModelOrigin} from '../../utils/types';
import {createModel} from '../../../jest/fixtures/models';
import {modelStore} from '..';
import {MODEL_LIST_VERSION} from '../ModelStore';

jest.mock('../../services/downloads', () => ({
  DownloadCancelledError: class extends Error {},
  downloadManager: {
    isDownloading: jest.fn().mockReturnValue(false),
    startDownload: jest.fn(),
    cancelDownload: jest.fn(),
    setCallbacks: jest.fn(),
    syncWithActiveDownloads: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('../../services/deviceRules/rules', () => ({
  fetchRules: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../services/deviceRules/signals', () => ({
  readDeviceSignals: jest
    .fn()
    .mockResolvedValue({ramBytes: 8 * 1e9, socModel: 'SM8850'}),
}));

const DOCS = RNFS.DocumentDirectoryPath;
const MODELS_DIR = `${DOCS}/models`;
const FLAG = {NSURLIsExcludedFromBackupKey: true};
const legacy = (filename: string) => `${DOCS}/${filename}`;

let files: Set<string>;
let warn: jest.SpyInstance;
const originalOS = Platform.OS;

const preset = (overrides: Partial<Model> = {}): Model =>
  createModel({
    id: 'a/r/x.gguf',
    author: 'a',
    repo: 'r',
    filename: 'x.gguf',
    origin: ModelOrigin.PRESET,
    isDownloaded: true,
    ...overrides,
  }) as Model;

const launch = async (models: Model[], version = MODEL_LIST_VERSION) => {
  runInAction(() => {
    modelStore.models = models;
    modelStore.version = version;
    modelStore.availableMemoryCeiling = 1;
  });
  await modelStore.initializeStore();
};

const moveInMemory = async (from: string, to: string) => {
  if (!files.has(from) || files.has(to)) {
    throw new Error(`cannot move ${from} to ${to}`);
  }
  files.delete(from);
  files.add(to);
};

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = 'ios';
  files = new Set();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  (RNFS.exists as jest.Mock).mockImplementation(async (path: string) =>
    files.has(path),
  );
  (RNFS.moveFile as jest.Mock).mockImplementation(moveInMemory);
  (RNFS.mkdir as jest.Mock).mockResolvedValue(undefined);
});

afterEach(async () => {
  await new Promise(resolve => setTimeout(resolve, 50));
  warn.mockRestore();
  Platform.OS = originalOS;
  runInAction(() => {
    modelStore.models = [];
    modelStore.version = undefined;
    modelStore.context = undefined;
    modelStore.isContextLoading = false;
    modelStore.benchmarkActive = false;
  });
});

describe('models folder backup flag at launch', () => {
  it('flags Documents/models before the presets resolve', async () => {
    await launch([]);

    const mkdir = RNFS.mkdir as jest.Mock;
    const flagIndex = mkdir.mock.calls.findIndex(
      ([path, opts]) =>
        path === MODELS_DIR && opts?.NSURLIsExcludedFromBackupKey,
    );
    expect(flagIndex).toBeGreaterThanOrEqual(0);
    expect(mkdir.mock.invocationCallOrder[flagIndex]).toBeLessThan(
      (readDeviceSignals as jest.Mock).mock.invocationCallOrder[0],
    );
    expect(
      mkdir.mock.calls.filter(([, opts]) => opts?.NSURLIsExcludedFromBackupKey),
    ).toEqual([[MODELS_DIR, FLAG]]);
  });

  it('flags again on the next launch without error', async () => {
    await launch([]);
    await launch([]);

    expect(RNFS.mkdir).toHaveBeenCalledTimes(2);
    expect(RNFS.mkdir).toHaveBeenNthCalledWith(2, MODELS_DIR, FLAG);
  });

  it('completes the launch when the flag write fails', async () => {
    (RNFS.mkdir as jest.Mock).mockRejectedValue(new Error('flag refused'));

    await launch([], 0);

    expect(warn).toHaveBeenCalled();
    expect(modelStore.version).toBe(MODEL_LIST_VERSION);
  });

  it('flags nothing and moves nothing on Android', async () => {
    Platform.OS = 'android';
    files.add(legacy('x.gguf'));

    await launch([preset()]);

    expect(RNFS.mkdir).not.toHaveBeenCalled();
    expect(RNFS.moveFile).not.toHaveBeenCalled();
    expect(files.has(legacy('x.gguf'))).toBe(true);
  });
});
