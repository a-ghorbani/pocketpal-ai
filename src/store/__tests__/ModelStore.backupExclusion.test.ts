jest.unmock('../../store');
import {runInAction} from 'mobx';
import {LlamaContext} from 'llama.rn';
import {Platform} from 'react-native';
import * as RNFS from '@dr.pogodin/react-native-fs';

import {downloadManager} from '../../services/downloads';
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
const target = (author: string, filename: string) =>
  `${MODELS_DIR}/preset/${author}/${filename}`;

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

const storeModel = (id: string) => modelStore.models.find(m => m.id === id);

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

describe('legacy preset relocation at launch', () => {
  it('moves an idle legacy file to models/preset/<author>/<filename>', async () => {
    files.add(legacy('x.gguf'));

    await launch([preset()]);

    expect(RNFS.moveFile).toHaveBeenCalledWith(
      legacy('x.gguf'),
      target('a', 'x.gguf'),
    );
    expect(RNFS.mkdir).toHaveBeenCalledWith(`${MODELS_DIR}/preset/a`);
    expect(files).toEqual(new Set([target('a', 'x.gguf')]));
    const model = storeModel('a/r/x.gguf')!;
    expect(model.isDownloaded).toBe(true);
    await expect(modelStore.getModelFullPath(model)).resolves.toBe(
      target('a', 'x.gguf'),
    );
  });

  it('uses "unknown" when the author is missing', async () => {
    files.add(legacy('x.gguf'));

    await launch([preset({author: undefined})]);

    expect(files).toEqual(new Set([target('unknown', 'x.gguf')]));
  });

  it('moves even when a copy sits at the repo-level path', async () => {
    const repoLevel = `${MODELS_DIR}/preset/a/r/x.gguf`;
    files.add(legacy('x.gguf'));
    files.add(repoLevel);

    await launch([preset()]);

    expect(files).toEqual(new Set([target('a', 'x.gguf'), repoLevel]));
  });

  it.each([
    [
      'a model context is loaded',
      () => {
        modelStore.context = {} as LlamaContext;
      },
    ],
    [
      'a model is loading',
      () => {
        modelStore.isContextLoading = true;
      },
    ],
    [
      'a benchmark is running',
      () => {
        modelStore.benchmarkActive = true;
      },
    ],
  ])('moves no file while %s', async (_state, setBusy) => {
    files.add(legacy('x.gguf'));
    files.add(legacy('y.gguf'));
    runInAction(setBusy);

    await launch([preset(), preset({id: 'a/r/y.gguf', filename: 'y.gguf'})]);

    expect(RNFS.moveFile).not.toHaveBeenCalled();
    expect(files).toEqual(new Set([legacy('x.gguf'), legacy('y.gguf')]));
  });

  it('moves the file before the presets resolve', async () => {
    files.add(legacy('x.gguf'));

    await launch([preset()]);

    expect(
      (RNFS.moveFile as jest.Mock).mock.invocationCallOrder[0],
    ).toBeLessThan(
      (readDeviceSignals as jest.Mock).mock.invocationCallOrder[0],
    );
  });

  it('moves no file when a model starts loading while the move is prepared', async () => {
    files.add(legacy('x.gguf'));
    (RNFS.mkdir as jest.Mock).mockImplementation(async (path: string) => {
      if (path === `${MODELS_DIR}/preset/a`) {
        runInAction(() => {
          modelStore.isContextLoading = true;
        });
      }
    });

    await launch([preset()]);

    expect(RNFS.moveFile).not.toHaveBeenCalled();
    expect(files).toEqual(new Set([legacy('x.gguf')]));
  });

  it.each([ModelOrigin.HF, ModelOrigin.LOCAL])(
    'moves no %s model file found in Documents',
    async origin => {
      files.add(legacy('x.gguf'));

      await launch([preset({origin})]);

      expect(RNFS.moveFile).not.toHaveBeenCalled();
      expect(files).toEqual(new Set([legacy('x.gguf')]));
    },
  );

  it('skips a model that is downloading and moves the others', async () => {
    (downloadManager.isDownloading as jest.Mock).mockImplementation(
      (id: string) => id === 'a/r/x.gguf',
    );
    files.add(legacy('x.gguf'));
    files.add(legacy('y.gguf'));

    await launch([preset(), preset({id: 'a/r/y.gguf', filename: 'y.gguf'})]);

    expect(files).toEqual(new Set([legacy('x.gguf'), target('a', 'y.gguf')]));
    (downloadManager.isDownloading as jest.Mock).mockReturnValue(false);
  });

  it('leaves both files when the target already exists', async () => {
    files.add(legacy('x.gguf'));
    files.add(target('a', 'x.gguf'));

    await launch([preset()]);

    expect(RNFS.moveFile).not.toHaveBeenCalled();
    expect(files).toEqual(new Set([legacy('x.gguf'), target('a', 'x.gguf')]));
    expect(warn).toHaveBeenCalledWith(
      expect.any(String),
      legacy('x.gguf'),
      target('a', 'x.gguf'),
    );
  });

  it.each<[string, Partial<Model>]>([
    ['author', {author: '..'}],
    ['filename', {filename: '../x.gguf'}],
    ['filename', {filename: 'notes.txt'}],
  ])('moves nothing when the persisted %s is unsafe', async (_f, override) => {
    const model = preset(override);
    files.add(legacy(model.filename));

    await launch([model]);

    expect(RNFS.moveFile).not.toHaveBeenCalled();
    expect(RNFS.mkdir).toHaveBeenCalledTimes(1);
  });

  it('keeps the file and its record where they were when the move fails', async () => {
    (RNFS.moveFile as jest.Mock).mockRejectedValue(new Error('move failed'));
    files.add(legacy('x.gguf'));

    await launch([preset()]);

    expect(files).toEqual(new Set([legacy('x.gguf')]));
    const model = storeModel('a/r/x.gguf')!;
    expect(model.isDownloaded).toBe(true);
    await expect(modelStore.getModelFullPath(model)).resolves.toBe(
      legacy('x.gguf'),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.any(String),
      'a/r/x.gguf',
      expect.any(Error),
    );
  });

  it('keeps the records sharing the file downloaded when a status check straddles the move', async () => {
    let statusCheck: Promise<void> | undefined;
    (RNFS.moveFile as jest.Mock).mockImplementation(
      async (from: string, to: string) => {
        statusCheck = modelStore.refreshDownloadStatuses();
        await moveInMemory(from, to);
      },
    );
    files.add(legacy('x.gguf'));

    await launch([preset(), preset({id: 'a/r2/x.gguf', repo: 'r2'})], 0);
    await statusCheck;

    expect(statusCheck).toBeDefined();
    expect(storeModel('a/r/x.gguf')?.isDownloaded).toBe(true);
    expect(storeModel('a/r2/x.gguf')?.isDownloaded).toBe(true);
  });

  it('re-checks every record that shared the moved file', async () => {
    files.add(legacy('x.gguf'));

    await launch([
      preset(),
      preset({id: 'a/r2/x.gguf', repo: 'r2'}),
      preset({id: 'b/r/x.gguf', author: 'b'}),
    ]);

    expect(files).toEqual(new Set([target('a', 'x.gguf')]));
    expect(storeModel('a/r/x.gguf')?.isDownloaded).toBe(true);
    expect(storeModel('a/r2/x.gguf')?.isDownloaded).toBe(true);
    expect(storeModel('b/r/x.gguf')?.isDownloaded).toBe(false);
  });
});
