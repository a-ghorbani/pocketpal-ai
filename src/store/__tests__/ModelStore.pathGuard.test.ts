jest.unmock('../../store');
import {runInAction, toJS} from 'mobx';
import {Platform} from 'react-native';
import * as RNFS from '@dr.pogodin/react-native-fs';

import {downloadManager} from '../../services/downloads';
import {fetchModelFilesDetails} from '../../api/hf';
import {classify} from '../../services/deviceRules/classify';
import {parseDeviceRules} from '../../services/deviceRules/parse';
import {Tier} from '../../services/deviceRules/types';
import {downloadModel} from '../../utils/downloadModel';
import {processHFSearchResults} from '../../utils/hf';
import {getLLMFiles} from '../../utils/multimodalHelpers';
import {isValidImportedModelRef} from '../../utils/modelPathGuard';
import {HuggingFaceModel, Model, ModelType} from '../../utils/types';
import {hfStore, modelStore, palStore} from '..';
import {LOOKIE_DEFAULT_MODEL} from '../builtinPalModels';
import {ONBOARDING_PALS} from '../onboarding/onboardingPals';
import androidBundledRules from '../bundledDeviceRules/rules.android.json';
import iosBundledRules from '../bundledDeviceRules/rules.ios.json';
import {defaultModels as legacyDefaultModels} from '../../../jest/fixtures/legacyDefaultModels';
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
