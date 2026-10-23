jest.unmock('../../store');
import {runInAction, toJS} from 'mobx';
import {Platform} from 'react-native';
import * as RNFS from '@dr.pogodin/react-native-fs';

import {downloadManager} from '../../services/downloads';
import {fetchModelFilesDetails, fetchModelInfo} from '../../api/hf';
import {classify} from '../../services/deviceRules/classify';
import {parseDeviceRules} from '../../services/deviceRules/parse';
import {Tier} from '../../services/deviceRules/types';
import {downloadModel} from '../../utils/downloadModel';
import {processHFSearchResults} from '../../utils/hf';
import {getLLMFiles} from '../../utils/multimodalHelpers';
import {
  HuggingFaceModel,
  Model,
  ModelOrigin,
  ModelType,
} from '../../utils/types';
import {
  createModel,
  mockLlamaContextParams,
} from '../../../jest/fixtures/models';
import {isHighEndDevice} from '../../utils/deviceCapabilities';
import {hfAsModel} from '../../utils';
import {resolveHFModelForDownload} from '../../utils/hfResolve';
import en from '../../locales/en.json';
import {
  isModelFilePath,
  isValidImportedModelRef,
} from '../../utils/modelPathGuard';
import {hfStore, modelStore, palStore, serverStore} from '..';
import {routerModelsBody} from '../../../jest/fixtures/remoteModelList';
import {LOOKIE_DEFAULT_MODEL} from '../builtinPalModels';
import {ONBOARDING_PALS} from '../onboarding/onboardingPals';
import androidBundledRules from '../bundledDeviceRules/rules.android.json';
import iosBundledRules from '../bundledDeviceRules/rules.ios.json';
import {defaultModels as legacyDefaultModels} from '../../../jest/fixtures/legacyDefaultModels';
import {withEachControl} from '../../../jest/fixtures/controlCharacters';
import smolVlmModelInfo from '../../../jest/fixtures/hfApi/ggml-org__SmolVLM-500M-Instruct-GGUF.model.json';
import smolVlmTree from '../../../jest/fixtures/hfApi/ggml-org__SmolVLM-500M-Instruct-GGUF.tree.json';

jest.mock('../../utils/deviceCapabilities', () => ({
  ...jest.requireActual('../../utils/deviceCapabilities'),
  getCpuCoreCount: jest.fn().mockResolvedValue(8),
  getRecommendedThreadCount: jest.fn().mockResolvedValue(6),
  checkGpuSupport: jest.fn().mockResolvedValue({isSupported: false}),
  isHighEndDevice: jest.fn().mockResolvedValue(false),
}));

jest.mock('../../api/hf', () => ({
  fetchModelFilesDetails: jest.fn(),
  fetchModelInfo: jest.fn(),
}));

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
jest.mock('../../services/deviceRules/classify', () => {
  const actual = jest.requireActual('../../services/deviceRules/classify');
  return {...actual, classify: jest.fn(actual.classify)};
});

const DOCS = RNFS.DocumentDirectoryPath;
const TIERS: Tier[] = ['low', 'mid', 'high', 'flagship'];
const ANY_APP_VERSION = '99.0.0';
const SIGNALS = {ramBytes: 8 * 1e9, socModel: 'SM8850'};

const hfPath = (author: string, repo: string, filename: string) =>
  `${DOCS}/models/hf/${author}/${repo}/${filename}`;

const hfPathOf = (model: Model) =>
  hfPath(model.author, model.repo!, model.filename);

let existingFiles: Set<string>;

const storeModel = (id: string) => modelStore.models.find(m => m.id === id)!;

const downloadTarget = (id: string): string | undefined =>
  (downloadManager.startDownload as jest.Mock).mock.calls.find(
    ([model]) => model.id === id,
  )?.[1];

const expectDownloadsAndDeletes = async (id: string, expectedPath: string) => {
  expect(isValidImportedModelRef(toJS(storeModel(id)))).toBe(true);

  await modelStore.checkSpaceAndDownload(id);
  expect(downloadTarget(id)).toBe(expectedPath);

  runInAction(() => {
    storeModel(id).isDownloaded = true;
  });
  await modelStore.deleteModel(storeModel(id));
  expect(RNFS.unlink).toHaveBeenCalledWith(expectedPath);
  expect(storeModel(id).isDownloaded).toBe(false);
};

const setModels = (models: Model[]) => {
  runInAction(() => {
    modelStore.models = models.map(m => ({...m, isDownloaded: false}));
  });
};

const browsedSmolVlm = async (): Promise<HuggingFaceModel> => {
  const info: Record<string, unknown> = {...smolVlmModelInfo};
  for (const strippedByFetchModelInfo of ['spaces', 'cardData', 'config']) {
    delete info[strippedByFetchModelInfo];
  }
  const [listed] = processHFSearchResults([
    info as unknown as HuggingFaceModel,
  ]);
  runInAction(() => {
    hfStore.models = [listed];
  });
  (fetchModelFilesDetails as jest.Mock).mockResolvedValue(smolVlmTree);
  await hfStore.fetchModelFileDetails(listed.id);
  return toJS(hfStore.getModelById(listed.id)!);
};

const resolvePresets = (rawRules: unknown, tiers: Tier[]): Model[] => {
  const rules = parseDeviceRules(rawRules, ANY_APP_VERSION);
  const byId = new Map<string, Model>();
  for (const tier of tiers) {
    (classify as jest.Mock).mockReturnValueOnce(tier);
    for (const model of modelStore.resolvePresetModels(rules, SIGNALS as any)) {
      if (!byId.has(model.id)) {
        byId.set(model.id, model);
      }
    }
  }
  return [...byId.values()];
};

describe('every model kind main persists still downloads and deletes', () => {
  let savedOS: typeof Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    savedOS = Platform.OS;
    existingFiles = new Set();
    (RNFS.exists as jest.Mock).mockImplementation(async (path: string) =>
      existingFiles.has(path),
    );
    (RNFS.unlink as jest.Mock).mockImplementation(async (path: string) => {
      existingFiles.delete(path);
    });
    (downloadManager.startDownload as jest.Mock).mockResolvedValue(undefined);
    (downloadManager.syncWithActiveDownloads as jest.Mock).mockResolvedValue(
      undefined,
    );
    runInAction(() => {
      modelStore.models = [];
      modelStore.activeModelId = undefined;
    });
  });

  afterEach(() => {
    Platform.OS = savedOS;
  });

  describe('HF browser (captured HF API response)', () => {
    it('LLM and mmproj files', async () => {
      const browsed = await browsedSmolVlm();
      for (const file of getLLMFiles(browsed.siblings)) {
        await modelStore.addHFModel(browsed, file);
      }
      const added = toJS(modelStore.models);
      expect(added.some(m => m.modelType === ModelType.PROJECTION)).toBe(true);
      expect(added).toHaveLength(4);

      for (const model of added) {
        await expectDownloadsAndDeletes(
          model.id,
          hfPath(
            'ggml-org',
            'SmolVLM-500M-Instruct-GGUF',
            model.hfModelFile!.rfilename,
          ),
        );
      }
    });

    it('legacy HF path without the repo segment', async () => {
      const browsed = await browsedSmolVlm();
      const [file] = getLLMFiles(browsed.siblings);
      const model = (await modelStore.addHFModel(browsed, file))!;
      const legacyPath = `${DOCS}/models/hf/ggml-org/${file.rfilename}`;
      existingFiles.add(legacyPath);

      await expectDownloadsAndDeletes(model.id, legacyPath);
    });
  });

  it('built-in pal model with its mmproj', async () => {
    await modelStore.addHFModel(
      LOOKIE_DEFAULT_MODEL.hfModel!,
      LOOKIE_DEFAULT_MODEL.hfModelFile!,
    );
    const added = toJS(modelStore.models);
    expect(added.some(m => m.modelType === ModelType.PROJECTION)).toBe(true);

    for (const model of added) {
      await expectDownloadsAndDeletes(model.id, hfPathOf(model));
    }
  });

  it('onboarding pal models', async () => {
    const entries = ONBOARDING_PALS.flatMap(pal => pal.models);
    for (const entry of entries) {
      await modelStore.registerOnboardingPalModel(entry);
    }
    const added = toJS(modelStore.models);
    expect(added.length).toBeGreaterThan(0);

    for (const model of added) {
      const entry = entries.find(e => `${e.repo}/${e.filename}` === model.id)!;
      await expectDownloadsAndDeletes(
        model.id,
        hfPath(entry.author, entry.repo.split('/')[1], entry.filename),
      );
    }
  });

  describe.each([
    ['android', androidBundledRules],
    ['ios', iosBundledRules],
  ] as const)('%s bundled rule presets', (os, rawRules) => {
    it('every tier, including mmproj projectors', async () => {
      Platform.OS = os;
      const presets = resolvePresets(rawRules, TIERS);
      expect(presets.some(m => m.modelType === ModelType.PROJECTION)).toBe(
        true,
      );
      setModels(presets);

      for (const model of presets) {
        await expectDownloadsAndDeletes(model.id, hfPathOf(model));
      }
    });
  });

  it('rule draft built from another bundled candidate', async () => {
    Platform.OS = 'android';
    const rules = JSON.parse(JSON.stringify(androidBundledRules));
    const [target, draftSource] = rules.tiers.mid.candidates;
    target.draft = {
      hf_repo: draftSource.hf_repo,
      hf_filename: draftSource.hf_filename,
      size_bytes: draftSource.size_bytes,
    };
    const presets = resolvePresets(rules, ['mid']);
    const draft = presets.find(m => m.modelType === ModelType.DRAFT)!;
    expect(draft.id).toBe(`${draftSource.hf_repo}/${draftSource.hf_filename}`);
    setModels(presets);

    await expectDownloadsAndDeletes(
      draft.id,
      hfPath(
        draftSource.hf_repo.split('/')[0],
        draftSource.hf_repo.split('/')[1],
        draftSource.hf_filename,
      ),
    );
  });

  it('PalsHub fallback model never enters the store, so downloading it stays a no-op', async () => {
    const browsed = await browsedSmolVlm();
    const [file] = getLLMFiles(browsed.siblings);
    const fallback: Model = (palStore as any).createBasicModelFromReference({
      repo_id: browsed.id,
      filename: file.rfilename,
      author: browsed.author,
      downloadUrl: file.url,
      size: file.size,
    });

    await downloadModel(fallback);

    expect(modelStore.models).toHaveLength(0);
    expect(downloadManager.startDownload).not.toHaveBeenCalled();
  });

  describe('legacy PRESET entries', () => {
    const presetBranches: [string, (m: Model) => string, boolean][] = [
      ['Documents root', m => `${DOCS}/${m.filename}`, true],
      [
        'preset/<author>',
        m => `${DOCS}/models/preset/${m.author}/${m.filename}`,
        true,
      ],
      [
        'preset/<author>/<repo>',
        m => `${DOCS}/models/preset/${m.author}/${m.repo}/${m.filename}`,
        false,
      ],
    ];

    it.each(presetBranches)(
      'resolve to the %s path',
      async (_branch, pathOf, fileExists) => {
        expect(legacyDefaultModels.length).toBeGreaterThan(0);
        for (const legacy of legacyDefaultModels) {
          setModels([legacy]);
          existingFiles = new Set(fileExists ? [pathOf(legacy)] : []);

          await expectDownloadsAndDeletes(legacy.id, pathOf(legacy));
        }
      },
    );
  });

  it('remote models from a captured model list pass the imported ref check', () => {
    const savedServers = serverStore.servers;
    const savedSelections = serverStore.userSelectedModels;
    try {
      const serverIds = ['192.168.1.20', 'Home/Mac'].map(name =>
        serverStore.addServer({name, url: 'http://192.168.1.20:8080'}),
      );
      for (const serverId of serverIds) {
        for (const {id} of routerModelsBody.data) {
          serverStore.addUserSelectedModel(serverId, id);
        }
      }
      const remote = toJS(modelStore.remoteModels).filter(m =>
        serverIds.includes(m.serverId!),
      );
      expect(remote).toHaveLength(2 * routerModelsBody.data.length);
      expect(remote.some(m => m.remoteModelId!.includes('/'))).toBe(true);

      for (const model of remote) {
        expect(isValidImportedModelRef(model)).toBe(true);
      }
    } finally {
      runInAction(() => {
        serverStore.servers = savedServers;
        serverStore.userSelectedModels = savedSelections;
      });
    }
  });

  describe('LOCAL picker imports', () => {
    it.each([
      `${DOCS}/models/local/model.gguf`,
      `${DOCS}/models/local/model.bin`,
      `${DOCS}/models/model.gguf`,
    ])('%s is deleted', async path => {
      existingFiles.add(path);
      await modelStore.addLocalModel(path);
      const [model] = toJS(modelStore.models);
      expect(isValidImportedModelRef(model)).toBe(true);

      await modelStore.checkSpaceAndDownload(model.id);
      expect(downloadManager.startDownload).not.toHaveBeenCalled();

      await modelStore.deleteModel(storeModel(model.id));
      expect(RNFS.unlink).toHaveBeenCalledWith(path);
      expect(modelStore.models).toHaveLength(0);
    });
  });
});

describe('model sink guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    existingFiles = new Set();
    (RNFS.exists as jest.Mock).mockImplementation(async (path: string) =>
      existingFiles.has(path),
    );
    (RNFS.unlink as jest.Mock).mockImplementation(async (path: string) => {
      existingFiles.delete(path);
    });
    (downloadManager.startDownload as jest.Mock).mockResolvedValue(undefined);
    runInAction(() => {
      modelStore.models = [];
      modelStore.activeModelId = undefined;
      modelStore.downloadError = null;
    });
  });

  const hfModel = (overrides: Partial<Model>): Model =>
    createModel({
      id: 'a/r/x.gguf',
      author: 'a',
      repo: 'r',
      filename: 'x.gguf',
      origin: ModelOrigin.HF,
      ...overrides,
    }) as Model;

  const expectDownloadRefused = async (model: Model) => {
    setModels([model]);
    await expect(modelStore.checkSpaceAndDownload(model.id)).rejects.toThrow();
    expect(downloadManager.startDownload).not.toHaveBeenCalled();
    expect(modelStore.downloadError).not.toBeNull();
  };

  const expectDeleteSkipped = async (model: Model) => {
    runInAction(() => {
      modelStore.models = [{...model, isDownloaded: true, progress: 100}];
    });
    await modelStore.deleteModel(storeModel(model.id));
    expect(RNFS.unlink).not.toHaveBeenCalled();
    expect(storeModel(model.id).isDownloaded).toBe(true);
    expect(storeModel(model.id).progress).toBe(100);
  };

  const expectDownloadAndDeleteAt = async (model: Model, path: string) => {
    setModels([model]);
    await expectDownloadsAndDeletes(model.id, path);
    expect(isModelFilePath(path, {local: false})).toBe(true);
  };

  describe.each([
    [
      'filename',
      (v: string) => ({filename: v}),
      'x.gguf',
      hfPath('a', 'r', 'x.gguf'),
    ],
    ['author', (v: string) => ({author: v}), 'v', hfPath('v', 'r', 'x.gguf')],
    ['repo', (v: string) => ({repo: v}), 'v', hfPath('a', 'v', 'x.gguf')],
  ])('%s segment', (_field, overrides, validValue, validPath) => {
    it.each(['..', '../..', '/etc/hosts', 'file:///data/local/tmp/x'])(
      '%p: no download and no unlink',
      async bad => {
        const model = hfModel(overrides(bad));
        await expectDownloadRefused(model);
        jest.clearAllMocks();
        await expectDeleteSkipped(model);
      },
    );

    it('valid value downloads and deletes as today', async () => {
      await expectDownloadAndDeleteAt(
        hfModel(overrides(validValue)),
        validPath,
      );
    });
  });

  describe('empty segment keeps the existing fallbacks', () => {
    it('empty author resolves to unknown', async () => {
      await expectDownloadAndDeleteAt(
        hfModel({author: ''}),
        hfPath('unknown', 'r', 'x.gguf'),
      );
    });

    it('empty repo is inferred from the id', async () => {
      await expectDownloadAndDeleteAt(
        hfModel({repo: ''}),
        hfPath('a', 'r', 'x.gguf'),
      );
    });

    it('empty repo with no inferable id resolves to unknown', async () => {
      await expectDownloadAndDeleteAt(
        hfModel({repo: '', id: 'x.gguf'}),
        hfPath('a', 'unknown', 'x.gguf'),
      );
    });

    it('empty filename fails in getModelFullPath before any sink', async () => {
      const model = hfModel({filename: ''});
      await expectDownloadRefused(model);
      runInAction(() => {
        modelStore.models = [{...model, isDownloaded: true}];
      });
      await expect(
        modelStore.deleteModel(storeModel(model.id)),
      ).rejects.toThrow('Model filename is undefined');
      expect(RNFS.unlink).not.toHaveBeenCalled();
    });
  });

  describe('paths that would mark a folder or escape the models root', () => {
    it.each([
      ['Q4/z/..', `${DOCS}/models/hf/a/r/Q4/z/..`],
      ['../..', `${DOCS}/models/hf/a/r/../..`],
      ['Q4', `${DOCS}/models/hf/a/r/Q4`],
      ['../../../x.gguf', `${DOCS}/models/hf/a/r/../../../x.gguf`],
    ])('filename %p resolving to %s', async (filename, path) => {
      const model = hfModel({filename});
      expect(await modelStore.getModelFullPath(model)).toBe(path);
      await expectDownloadRefused(model);
      jest.clearAllMocks();
      await expectDeleteSkipped(model);
    });

    it('nested HF file under the models root downloads and deletes', async () => {
      await expectDownloadAndDeleteAt(
        hfModel({id: 'a/r/Q4/x.gguf', filename: 'Q4/x.gguf'}),
        hfPath('a', 'r', 'Q4/x.gguf'),
      );
    });

    it.each([
      ['/tmp/x.gguf', false],
      [`${DOCS}/models/local/x.bin`, true],
    ])(
      'LOCAL %s: removed from the list, unlinked only under the models root',
      async (fullPath, unlinked) => {
        existingFiles.add(fullPath);
        const local = createModel({
          id: 'local-1',
          filename: fullPath.split('/').pop(),
          fullPath,
          isLocal: true,
          origin: ModelOrigin.LOCAL,
          isDownloaded: true,
        }) as Model;
        runInAction(() => {
          modelStore.models = [local];
        });

        await modelStore.deleteModel(storeModel(local.id));

        expect(modelStore.models).toHaveLength(0);
        if (unlinked) {
          expect(RNFS.unlink).toHaveBeenCalledWith(fullPath);
        } else {
          expect(RNFS.unlink).not.toHaveBeenCalled();
        }
      },
    );
  });

  describe('control characters in a path segment', () => {
    const expectRefusedAndSkipped = async (model: Model, path: string) => {
      expect(await modelStore.getModelFullPath(model)).toBe(path);
      await expectDownloadRefused(model);
      jest.clearAllMocks();
      await expectDeleteSkipped(model);
    };

    it.each(
      withEachControl(c => [`x${c}.gguf`, `${c}x.gguf`, `Q4/a${c}b.gguf`]),
    )('filename %s: no download and no unlink', async (_shown, filename) => {
      await expectRefusedAndSkipped(
        hfModel({filename}),
        hfPath('a', 'r', filename),
      );
    });

    it.each(withEachControl(c => [`a${c}b`, `${c}ab`, `ab${c}`]))(
      'author or repo %s: no download and no unlink',
      async (_shown, segment) => {
        await expectRefusedAndSkipped(
          hfModel({author: segment}),
          hfPath(segment, 'r', 'x.gguf'),
        );
        jest.clearAllMocks();
        await expectRefusedAndSkipped(
          hfModel({repo: segment}),
          hfPath('a', segment, 'x.gguf'),
        );
      },
    );

    it.each(withEachControl(c => [`${DOCS}/models/local/a${c}b`]))(
      'LOCAL %s leaves the list without an unlink',
      async (_shown, fullPath) => {
        existingFiles.add(fullPath);
        const local = createModel({
          id: 'local-1',
          filename: fullPath.split('/').pop(),
          fullPath,
          isLocal: true,
          origin: ModelOrigin.LOCAL,
          isDownloaded: true,
        }) as Model;
        runInAction(() => {
          modelStore.models = [local];
        });

        await modelStore.deleteModel(storeModel(local.id));

        expect(modelStore.models).toHaveLength(0);
        expect(RNFS.unlink).not.toHaveBeenCalled();
      },
    );

    it.each(withEachControl(c => [`x.gguf${c}`]))(
      'filename %s is also refused by the .gguf rule',
      async (_shown, filename) => {
        await expectRefusedAndSkipped(
          hfModel({filename}),
          hfPath('a', 'r', filename),
        );
      },
    );
  });

  describe('legacy preset at the Documents root', () => {
    const preset = (filename: string) =>
      createModel({
        id: `a/r/${filename}`,
        author: 'a',
        repo: 'r',
        filename,
        origin: ModelOrigin.PRESET,
      }) as Model;

    it('Documents/x.gguf is deleted', async () => {
      existingFiles.add(`${DOCS}/x.gguf`);
      await expectDownloadAndDeleteAt(preset('x.gguf'), `${DOCS}/x.gguf`);
    });

    it.each(['models', 'pal-images'])(
      'Documents/%s is neither downloaded to nor deleted',
      async folder => {
        existingFiles.add(`${DOCS}/${folder}`);
        const model = preset(folder);
        expect(await modelStore.getModelFullPath(model)).toBe(
          `${DOCS}/${folder}`,
        );
        await expectDownloadRefused(model);
        jest.clearAllMocks();
        await expectDeleteSkipped(model);
      },
    );
  });
});

describe('model load guard', () => {
  const {initLlama, loadLlamaModelInfo, LlamaContext} = require('llama.rn');
  const refused = en.errors.modelPathRefused;
  const MTP_META = {n_embd: 1024, nextn_predict_layers: 1} as any;
  const TARGET_META = {n_embd: 1024} as any;
  const savedOS = Platform.OS;
  let ctx: any;

  afterEach(() => {
    Platform.OS = savedOS;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    existingFiles = new Set();
    (RNFS.exists as jest.Mock).mockImplementation(async (path: string) =>
      existingFiles.has(path),
    );
    (isHighEndDevice as jest.Mock).mockResolvedValue(true);
    ctx = new LlamaContext(mockLlamaContextParams);
    ctx.isMultimodalEnabled = jest.fn().mockResolvedValue(true);
    (initLlama as jest.Mock).mockResolvedValue(ctx);
    (loadLlamaModelInfo as jest.Mock).mockResolvedValue({});
    (RNFS.hash as jest.Mock).mockResolvedValue('sha');
    modelStore.setSpeculativeEnabled(false);
    runInAction(() => {
      modelStore.models = [];
      modelStore.activeModelId = undefined;
    });
  });

  const resetLoadState = () => {
    jest.clearAllMocks();
    runInAction(() => {
      modelStore.context = undefined;
      modelStore.activeModelId = undefined;
      modelStore.modelLoadError = null;
      modelStore.isContextLoading = false;
    });
  };

  const markDownloaded = () => {
    runInAction(() => {
      modelStore.models.forEach(m => {
        m.isDownloaded = true;
      });
    });
  };

  const expectNativeReads = async (
    id: string,
    path: string,
    extra: {draft?: string; mmproj?: string} = {},
  ) => {
    resetLoadState();
    await modelStore.initContext(storeModel(id));
    expect(modelStore.modelLoadError).toBeNull();
    const params = (initLlama as jest.Mock).mock.calls[0][0];
    expect(params.model).toBe(path);
    if (extra.draft) {
      expect(params.model_draft).toBe(extra.draft);
    }
    if (extra.mmproj) {
      expect(ctx.initMultimodal).toHaveBeenCalledWith(
        expect.objectContaining({path: extra.mmproj}),
      );
    }

    await modelStore.fetchAndPersistGGUFMetadata(storeModel(id));
    expect(loadLlamaModelInfo).toHaveBeenCalledWith(path);

    runInAction(() => {
      storeModel(id).isDownloaded = true;
    });
    await modelStore.updateModelHash(id, true);
    expect(RNFS.hash).toHaveBeenCalledWith(path, 'sha256');
  };

  const expectLoadRefused = async (id: string) => {
    resetLoadState();
    await expect(modelStore.initContext(storeModel(id))).rejects.toThrow(
      refused,
    );
    expect(initLlama).not.toHaveBeenCalled();
    expect(ctx.initMultimodal).not.toHaveBeenCalled();
    expect(modelStore.modelLoadError?.message).toBe(refused);
  };

  const expectReadsSkipped = async (id: string) => {
    jest.clearAllMocks();
    await modelStore.fetchAndPersistGGUFMetadata(storeModel(id));
    runInAction(() => {
      storeModel(id).isDownloaded = true;
    });
    await modelStore.updateModelHash(id, true).catch(() => {});
    expect(loadLlamaModelInfo).not.toHaveBeenCalled();
    expect(RNFS.hash).not.toHaveBeenCalled();
  };

  const expectRejectedBeforeInit = async (id: string) => {
    resetLoadState();
    await expect(modelStore.initContext(storeModel(id))).rejects.toThrow();
    expect(initLlama).not.toHaveBeenCalled();
    expect(modelStore.modelLoadError).toBeNull();
  };

  const craftedHf = (overrides: Partial<Model>): Model =>
    createModel({
      id: 'a/r/crafted',
      author: 'a',
      repo: 'r',
      filename: 'x.gguf',
      origin: ModelOrigin.HF,
      isDownloaded: true,
      ...overrides,
    }) as Model;

  const craftedLocal = (fullPath: string): Model =>
    createModel({
      id: 'local-crafted',
      author: '',
      filename: fullPath.split('/').pop(),
      fullPath,
      isLocal: true,
      origin: ModelOrigin.LOCAL,
      isDownloaded: true,
    }) as Model;

  describe('valid models reach native code with their resolved paths', () => {
    it('HF browser LLM loads with its projector', async () => {
      const browsed = await browsedSmolVlm();
      const [file] = getLLMFiles(browsed.siblings);
      const llm = (await modelStore.addHFModel(browsed, file))!;
      markDownloaded();
      const projector = storeModel(storeModel(llm.id).defaultProjectionModel!);

      await expectNativeReads(llm.id, hfPathOf(storeModel(llm.id)), {
        mmproj: hfPathOf(projector),
      });
      await expectNativeReads(projector.id, hfPathOf(projector));
    });

    it('HF model at the legacy path without the repo segment', async () => {
      const browsed = await browsedSmolVlm();
      const [file] = getLLMFiles(browsed.siblings);
      const llm = (await modelStore.addHFModel(browsed, file))!;
      const legacyPath = `${DOCS}/models/hf/ggml-org/${file.rfilename}`;
      existingFiles.add(legacyPath);
      markDownloaded();
      runInAction(() => {
        storeModel(llm.id).visionEnabled = false;
      });

      await expectNativeReads(llm.id, legacyPath);
    });

    it('built-in pal model with its projector', async () => {
      const llm = (await modelStore.addHFModel(
        LOOKIE_DEFAULT_MODEL.hfModel!,
        LOOKIE_DEFAULT_MODEL.hfModelFile!,
      ))!;
      markDownloaded();
      const projector = storeModel(storeModel(llm.id).defaultProjectionModel!);

      await expectNativeReads(llm.id, hfPathOf(storeModel(llm.id)), {
        mmproj: hfPathOf(projector),
      });
    });

    it('onboarding pal models', async () => {
      for (const entry of ONBOARDING_PALS.flatMap(pal => pal.models)) {
        await modelStore.registerOnboardingPalModel(entry);
      }
      markDownloaded();
      for (const model of toJS(modelStore.models)) {
        await expectNativeReads(model.id, hfPathOf(model));
      }
    });

    it.each([
      ['android', androidBundledRules],
      ['ios', iosBundledRules],
    ] as const)(
      '%s rule presets, projectors included',
      async (os, rawRules) => {
        Platform.OS = os;
        setModels(resolvePresets(rawRules, TIERS));
        markDownloaded();
        runInAction(() => {
          modelStore.models.forEach(m => {
            m.visionEnabled = false;
          });
        });
        for (const model of toJS(modelStore.models)) {
          await expectNativeReads(model.id, hfPathOf(model));
        }
      },
      60000,
    );

    it.each<[string, (m: Model) => string, boolean]>([
      ['Documents root', m => `${DOCS}/${m.filename}`, true],
      [
        'preset/<author>',
        m => `${DOCS}/models/preset/${m.author}/${m.filename}`,
        true,
      ],
      [
        'preset/<author>/<repo>',
        m => `${DOCS}/models/preset/${m.author}/${m.repo}/${m.filename}`,
        false,
      ],
    ])(
      'legacy presets at the %s path',
      async (_branch, pathOf, fileExists) => {
        for (const legacy of legacyDefaultModels) {
          setModels([{...legacy, supportsMultimodal: false}]);
          markDownloaded();
          existingFiles = new Set(fileExists ? [pathOf(legacy)] : []);
          await expectNativeReads(legacy.id, pathOf(legacy));
        }
      },
      30000,
    );

    it.each([
      `${DOCS}/models/local/model.gguf`,
      `${DOCS}/models/local/model.bin`,
      `${DOCS}/models/model.gguf`,
    ])('LOCAL import at %s', async path => {
      existingFiles.add(path);
      await modelStore.addLocalModel(path);
      const [model] = toJS(modelStore.models);

      await expectNativeReads(model.id, path);
    });

    it('LOCAL model from an old iOS container loads at its re-anchored path', async () => {
      const recovered = `${DOCS}/models/local/m.gguf`;
      existingFiles.add(recovered);
      runInAction(() => {
        modelStore.models = [
          craftedLocal(
            '/var/mobile/Containers/Data/Application/5D7C1A2B-3E4F-4A5B-8C9D-0E1F2A3B4C5D/Documents/models/local/m.gguf',
          ),
        ];
      });

      await expectNativeReads('local-crafted', recovered);
    });

    it('rule draft pairs with its target', async () => {
      Platform.OS = 'android';
      const rules = JSON.parse(JSON.stringify(androidBundledRules));
      const [target, draftSource] = rules.tiers.mid.candidates;
      target.draft = {
        hf_repo: draftSource.hf_repo,
        hf_filename: draftSource.hf_filename,
        size_bytes: draftSource.size_bytes,
      };
      setModels(resolvePresets(rules, ['mid']));
      markDownloaded();
      const draft = modelStore.models.find(
        m => m.modelType === ModelType.DRAFT,
      )!;
      const targetModel = modelStore.models.find(
        m => m.defaultDraftModel === draft.id,
      )!;
      runInAction(() => {
        draft.ggufMetadata = MTP_META;
        targetModel.ggufMetadata = TARGET_META;
      });
      modelStore.setSpeculativeEnabled(true);

      await expectNativeReads(targetModel.id, hfPathOf(targetModel), {
        draft: hfPathOf(draft),
      });
    });

    it('LOCAL non-gguf draft pairs with an HF target', async () => {
      const draftPath = `${DOCS}/models/local/draft.bin`;
      existingFiles.add(draftPath);
      const [entry] = ONBOARDING_PALS[0].models;
      const target = (await modelStore.registerOnboardingPalModel(entry))!;
      await modelStore.addLocalModel(draftPath);
      markDownloaded();
      const draft = modelStore.models.find(m => m.fullPath === draftPath)!;
      runInAction(() => {
        draft.ggufMetadata = MTP_META;
        storeModel(target.id).ggufMetadata = TARGET_META;
        storeModel(target.id).defaultDraftModel = draft.id;
      });
      modelStore.setSpeculativeEnabled(true);

      await expectNativeReads(target.id, hfPathOf(storeModel(target.id)), {
        draft: draftPath,
      });
    });

    it('an in-root projector that fails to initialize still degrades to text-only', async () => {
      const llm = (await modelStore.addHFModel(
        LOOKIE_DEFAULT_MODEL.hfModel!,
        LOOKIE_DEFAULT_MODEL.hfModelFile!,
      ))!;
      markDownloaded();
      ctx.initMultimodal = jest.fn().mockRejectedValue(new Error('mmproj'));
      resetLoadState();

      await modelStore.initContext(storeModel(llm.id));

      expect(initLlama).toHaveBeenCalledTimes(1);
      expect(ctx.initMultimodal).toHaveBeenCalled();
      expect(modelStore.isMultimodalActive).toBe(false);
      expect(modelStore.modelLoadError).toBeNull();
    });
  });

  describe('crafted paths never reach native code', () => {
    const MAIN: [string, () => Model][] = [
      ['HF filename ..', () => craftedHf({filename: '..'})],
      ['HF filename ../..', () => craftedHf({filename: '../..'})],
      [
        'HF filename x<U+0000>.gguf',
        () => craftedHf({filename: 'x\u0000.gguf'}),
      ],
      ['HF filename ../../x.gguf', () => craftedHf({filename: '../../x.gguf'})],
      [
        'HF repo <U+0000>',
        () => craftedHf({repo: '\u0000', filename: 'm.gguf'}),
      ],
      ['LOCAL /etc/hosts', () => craftedLocal('/etc/hosts')],
      [
        'LOCAL file:///data/local/tmp/x',
        () => craftedLocal('file:///data/local/tmp/x'),
      ],
      ['LOCAL /tmp/x.gguf', () => craftedLocal('/tmp/x.gguf')],
    ];

    it.each(MAIN)('%s: load refused', async (_case, build) => {
      const model = build();
      runInAction(() => {
        modelStore.models = [model];
      });
      await expectLoadRefused(model.id);
    });

    it.each(MAIN)('%s: model info and hash not read', async (_case, build) => {
      const model = build();
      runInAction(() => {
        modelStore.models = [model];
      });
      await expectReadsSkipped(model.id);
    });

    const PROJECTOR_FILENAMES = [
      '..',
      '../..',
      '/etc/hosts',
      'file:///data/local/tmp/x',
      'mmproj-a\u0000b.gguf',
    ];

    const withProjector = async (filename: string) => {
      const llm = (await modelStore.addHFModel(
        LOOKIE_DEFAULT_MODEL.hfModel!,
        LOOKIE_DEFAULT_MODEL.hfModelFile!,
      ))!;
      const projector = craftedHf({
        id: 'a/r/mmproj-crafted',
        filename,
        modelType: ModelType.PROJECTION,
      });
      runInAction(() => {
        modelStore.models.push(projector);
        storeModel(llm.id).isDownloaded = true;
        storeModel(llm.id).defaultProjectionModel = projector.id;
      });
      return llm.id;
    };

    it.each(PROJECTOR_FILENAMES)(
      'projector filename %j: the whole load is refused',
      async filename => {
        await expectLoadRefused(await withProjector(filename));
      },
    );

    it('an empty projector filename fails before init, as before', async () => {
      await expectRejectedBeforeInit(await withProjector(''));
    });

    const withDraft = async (draft: Model) => {
      const [entry] = ONBOARDING_PALS[0].models;
      const target = (await modelStore.registerOnboardingPalModel(entry))!;
      runInAction(() => {
        modelStore.models.push({...draft, ggufMetadata: MTP_META});
        storeModel(target.id).isDownloaded = true;
        storeModel(target.id).ggufMetadata = TARGET_META;
        storeModel(target.id).defaultDraftModel = draft.id;
      });
      modelStore.setSpeculativeEnabled(true);
      return target.id;
    };

    it.each<[string, () => Model]>([
      ['HF draft filename ..', () => craftedHf({filename: '..'})],
      ['HF draft filename ../..', () => craftedHf({filename: '../..'})],
      [
        'HF draft filename x<U+0000>.gguf',
        () => craftedHf({filename: 'x\u0000.gguf'}),
      ],
      ['LOCAL draft /etc/hosts', () => craftedLocal('/etc/hosts')],
      [
        'LOCAL draft file:///data/local/tmp/x',
        () => craftedLocal('file:///data/local/tmp/x'),
      ],
    ])('%s: the whole load is refused', async (_case, build) => {
      await expectLoadRefused(await withDraft(build()));
    });

    it('an empty draft filename fails before init, as before', async () => {
      await expectRejectedBeforeInit(
        await withDraft(craftedHf({filename: ''})),
      );
    });

    it('an empty main filename fails before init, as before', async () => {
      const model = craftedHf({filename: ''});
      runInAction(() => {
        modelStore.models = [model];
      });
      await expectRejectedBeforeInit(model.id);
      await expectReadsSkipped(model.id);
    });

    it('a PalsHub ref whose HF resolve failed is marked downloaded but never loads', async () => {
      (fetchModelInfo as jest.Mock).mockRejectedValue(new Error('offline'));
      (fetchModelFilesDetails as jest.Mock).mockRejectedValue(
        new Error('offline'),
      );
      const {hfModel, modelFile} = await resolveHFModelForDownload(
        'a/r',
        '../../x.gguf',
        undefined,
        {
          author: 'a',
          size: 1,
          downloadUrl: 'https://huggingface.co/a/r/resolve/main/x.gguf',
        },
      );
      const ghost = hfAsModel(hfModel, modelFile);
      existingFiles.add(hfPathOf(ghost));

      await modelStore.addHFModel(hfModel, modelFile);
      expect(storeModel(ghost.id).isDownloaded).toBe(true);

      await expectLoadRefused(ghost.id);
      await expectReadsSkipped(ghost.id);
    });

    it.each<[string, () => Model]>([
      ['HF filename x.bin', () => craftedHf({filename: 'x.bin'})],
      [
        'PRESET filename x.bin',
        () => craftedHf({filename: 'x.bin', origin: ModelOrigin.PRESET}),
      ],
      [
        'LOCAL models/local/../../../etc/hosts',
        () => craftedLocal(`${DOCS}/models/local/../../../etc/hosts`),
      ],
      [
        'LOCAL models/local/a<U+0000>b.gguf',
        () => craftedLocal(`${DOCS}/models/local/a\u0000b.gguf`),
      ],
    ])('%s: load refused, model info and hash not read', async (_c, build) => {
      const model = build();
      runInAction(() => {
        modelStore.models = [model];
      });
      await expectLoadRefused(model.id);
      await expectReadsSkipped(model.id);
    });

    it('an empty LOCAL fullPath fails before init, as before', async () => {
      const model = craftedLocal('');
      runInAction(() => {
        modelStore.models = [model];
      });
      await expectRejectedBeforeInit(model.id);
      await expectReadsSkipped(model.id);
    });

    it('a non-gguf projector file: the whole load is refused', async () => {
      await expectLoadRefused(await withProjector('mmproj-x.bin'));
    });

    it('a non-gguf HF draft file: the whole load is refused', async () => {
      await expectLoadRefused(await withDraft(craftedHf({filename: 'dr.bin'})));
    });

    describe('projector path passed by the caller', () => {
      const lookie = async () => {
        const llm = (await modelStore.addHFModel(
          LOOKIE_DEFAULT_MODEL.hfModel!,
          LOOKIE_DEFAULT_MODEL.hfModelFile!,
        ))!;
        markDownloaded();
        resetLoadState();
        return storeModel(llm.id);
      };

      it.each([
        '/etc/hosts',
        'file:///data/local/tmp/x.gguf',
        `${DOCS}/models/hf/a/r/../../../../x.gguf`,
        `${DOCS}/models/hf/a/r/mmproj-x.bin`,
        `${DOCS}/models/hf/a/r/mmproj-a\u0000b.gguf`,
      ])('%j: the whole load is refused', async path => {
        const llm = await lookie();
        await expect(modelStore.initContext(llm, path)).rejects.toThrow(
          refused,
        );
        expect(initLlama).not.toHaveBeenCalled();
        expect(ctx.initMultimodal).not.toHaveBeenCalled();
        expect(modelStore.modelLoadError?.message).toBe(refused);
      });

      it('an in-root projector path reaches initMultimodal', async () => {
        const llm = await lookie();
        const projectorPath = hfPathOf(storeModel(llm.defaultProjectionModel!));

        await modelStore.initContext(llm, projectorPath);

        expect(modelStore.modelLoadError).toBeNull();
        expect((initLlama as jest.Mock).mock.calls[0][0].model).toBe(
          hfPathOf(llm),
        );
        expect(ctx.initMultimodal).toHaveBeenCalledWith(
          expect.objectContaining({path: projectorPath}),
        );
      });
    });
  });
});
