jest.unmock('../../store');
import {runInAction} from 'mobx';
import {LlamaContext} from 'llama.rn';
import {Alert, Platform} from 'react-native';

import {
  downloadManager,
  DownloadCancelledError,
} from '../../services/downloads';

import {GGUFMetadata, Model, ModelOrigin, ModelType} from '../../utils/types';
import {getDisplayNameFromFilename} from '../../utils/formatters';
import {
  basicModel,
  createModel,
  mockLlamaContextParams,
  mockHFModel1,
} from '../../../jest/fixtures/models';
import * as RNFS from '@dr.pogodin/react-native-fs';

import {modelStore, uiStore, serverStore} from '..';
import {LOOKIE_DEFAULT_MODEL} from '../builtinPalModels';
import {classify} from '../../services/deviceRules/classify';
import {getVisionModelSizeBreakdown} from '../../utils/multimodalHelpers';
import {MODEL_LIST_VERSION} from '../ModelStore';
import {parseDeviceRules} from '../../services/deviceRules/parse';
import {fetchRules} from '../../services/deviceRules/rules';
import {readDeviceSignals} from '../../services/deviceRules/signals';
import androidBundledRules from '../bundledDeviceRules/rules.android.json';
import iosBundledRules from '../bundledDeviceRules/rules.ios.json';
import {t} from '../../locales';
import {
  getCpuCoreCount,
  getRecommendedThreadCount,
} from '../../utils/deviceCapabilities';

// Mock deviceCapabilities
jest.mock('../../utils/deviceCapabilities', () => ({
  ...jest.requireActual('../../utils/deviceCapabilities'),
  getCpuCoreCount: jest.fn().mockResolvedValue(8),
  getRecommendedThreadCount: jest.fn().mockResolvedValue(6),
  checkGpuSupport: jest.fn().mockResolvedValue({isSupported: false}),
  isHighEndDevice: jest.fn().mockResolvedValue(false),
}));

// Mock the HF API
jest.mock('../../api/hf', () => ({
  fetchModelFilesDetails: jest.fn(),
}));

// Mock the download manager
jest.mock('../../services/downloads', () => {
  class MockDownloadCancelledError extends Error {
    modelId: string;
    constructor(modelId: string) {
      super(`Download cancelled for ${modelId}`);
      this.name = 'DownloadCancelledError';
      this.modelId = modelId;
    }
  }
  return {
    DownloadCancelledError: MockDownloadCancelledError,
    downloadManager: {
      isDownloading: jest.fn(),
      startDownload: jest.fn(),
      cancelDownload: jest.fn(),
      setCallbacks: jest.fn(),
      syncWithActiveDownloads: jest.fn().mockResolvedValue(undefined),
    },
  };
});

// Control the network rules fetch and device-signal read at the module boundary
// while keeping the real parse/classify. Defaults: no fetched override (bundled
// floor), mid-tier Android signals.
jest.mock('../../services/deviceRules/rules', () => ({
  fetchRules: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../services/deviceRules/signals', () => ({
  readDeviceSignals: jest
    .fn()
    .mockResolvedValue({ramBytes: 8 * 1e9, socModel: 'SM8850'}),
}));

// Mock the HF store
// jest.mock('../HFStore', () => ({
//   hfStore: {
//     shouldUseToken: true,
//     hfToken: 'test-token',
//   },
// }));

// RNFS is mocked globally in jest/setup.ts

// Generic PRESET-origin model fixture used across the suite.
const presetModelFixture: Model = createModel({
  id: 'bartowski/gemma-2-2b-it-GGUF/gemma-2-2b-it-Q6_K.gguf',
  author: 'bartowski',
  repo: 'gemma-2-2b-it-GGUF',
  name: 'Gemma-2-2b-it (Q6_K)',
  filename: 'gemma-2-2b-it-Q6_K.gguf',
  origin: ModelOrigin.PRESET,
  params: 2614341888,
}) as Model;

describe('ModelStore', () => {
  let showErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset RNFS mock state
    (RNFS as any).__resetMockState?.();

    showErrorSpy = jest.spyOn(uiStore, 'showError');
    modelStore.models = []; // Clear models before each test
    modelStore.context = undefined;
    modelStore.activeModelId = undefined;

    // Re-setup download manager mocks after clearAllMocks
    (downloadManager.syncWithActiveDownloads as jest.Mock).mockResolvedValue(
      undefined,
    );
    (downloadManager.startDownload as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    showErrorSpy.mockRestore();
  });

  describe('mergeModelLists', () => {
    it('drops non-downloaded PRESET stubs', () => {
      modelStore.models = [{...presetModelFixture, isDownloaded: false}];

      runInAction(() => {
        modelStore.mergeModelLists();
      });

      expect(modelStore.models).toHaveLength(0);
    });

    it('keeps a downloaded legacy PRESET model regardless of origin', () => {
      const downloadedPreset = {...presetModelFixture, isDownloaded: true};
      modelStore.models = [downloadedPreset];

      runInAction(() => {
        modelStore.mergeModelLists();
      });

      expect(modelStore.models).toHaveLength(1);
      expect(modelStore.models[0].id).toBe(downloadedPreset.id);
      expect(modelStore.models[0].isDownloaded).toBe(true);
    });

    it('keeps downloaded models, drops non-downloaded PRESET stubs in one pass', () => {
      const downloadedPreset = {
        ...presetModelFixture,
        id: 'kept/repo/kept.gguf',
        isDownloaded: true,
      };
      const stub = {
        ...presetModelFixture,
        id: 'stub/repo/stub.gguf',
        isDownloaded: false,
      };
      modelStore.models = [downloadedPreset, stub];

      runInAction(() => {
        modelStore.mergeModelLists();
      });

      const ids = modelStore.models.map(m => m.id);
      expect(ids).toContain('kept/repo/kept.gguf');
      expect(ids).not.toContain('stub/repo/stub.gguf');
    });

    it('preserves HF model customizations while refreshing defaults', () => {
      const hfModel = {
        ...presetModelFixture,
        id: 'hf/repo/hf.gguf',
        origin: ModelOrigin.HF,
        isDownloaded: true,
        chatTemplate: {
          ...presetModelFixture.chatTemplate,
          template: 'existing',
        },
        stopWords: ['custom_stop_1', 'custom_stop_2'],
        hfModel: mockHFModel1,
      };
      modelStore.models = [hfModel];

      runInAction(() => {
        modelStore.mergeModelLists();
      });

      expect(modelStore.models[0].chatTemplate).toEqual(
        expect.objectContaining({template: 'existing'}),
      );
      expect(modelStore.models[0].stopWords).toEqual(
        expect.arrayContaining(['custom_stop_1', 'custom_stop_2']),
      );
    });
  });

  describe('resolvePresetModels', () => {
    let savedOS: typeof Platform.OS;
    beforeAll(() => {
      savedOS = Platform.OS;
      Platform.OS = 'android';
    });
    afterAll(() => {
      Platform.OS = savedOS;
    });

    const midOnlyClassifier = {
      ramBands: [{id: 'all', maxBytes: null}],
      tierMatrix: [{ramBand: 'all', socClass: 'mid', tier: 'mid' as const}],
      socModelToClass: {'Tensor G3': 'mid'},
    };

    const makeRules = (models: any[]) => ({
      schemaVersion: '1.2.0-draft',
      platform: 'android',
      rulesVersion: '2026-06-10.1',
      classifier: midOnlyClassifier,
      tiers: {
        low: {models: []},
        mid: {models},
        high: {models: []},
        flagship: {models: []},
      },
    });

    const signals = {ramBytes: 8 * 1e9, socModel: 'Tensor G3'};

    const llmCandidate = {
      model: 'gemma-3-1b-it',
      hfRepo: 'ggml-org/gemma-3-1b-it-GGUF',
      hfFilename: 'gemma-3-1b-it-Q4_K_M.gguf',
      params: 999885952,
      sizeBytes: 806058240,
    };

    const visionCandidate = {
      model: 'smolvlm-500m',
      hfRepo: 'ggml-org/SmolVLM-500M-Instruct-GGUF',
      hfFilename: 'SmolVLM-500M-Instruct-Q8_0.gguf',
      params: 500000000,
      sizeBytes: 500,
      multimodal: true,
      mmproj: {
        hfRepo: 'ggml-org/SmolVLM-500M-Instruct-GGUF',
        hfFilename: 'mmproj-SmolVLM-500M-Instruct-Q8_0.gguf',
        sizeBytes: 100,
        modalities: ['vision'],
      },
    };

    it('synthesizes a tier LLM into an origin:HF Model with a derived downloadUrl', () => {
      const presets = modelStore.resolvePresetModels(
        makeRules([llmCandidate]) as any,
        signals as any,
      );
      expect(presets).toHaveLength(1);
      const m = presets[0];
      expect(m.origin).toBe(ModelOrigin.HF);
      expect(m.id).toBe(
        'ggml-org/gemma-3-1b-it-GGUF/gemma-3-1b-it-Q4_K_M.gguf',
      );
      expect(m.downloadUrl).toBe(
        'https://huggingface.co/ggml-org/gemma-3-1b-it-GGUF/resolve/main/gemma-3-1b-it-Q4_K_M.gguf',
      );
      expect(m.isRulePreset).toBe(true);
      expect(m.size).toBe(806058240);
      expect(m.params).toBe(999885952);
      // HF-derivable data (oid/lfs) is not baked; it resolves at download.
      expect(m.hfModelFile?.oid).toBeUndefined();
      expect(m.hfModelFile?.lfs).toBeUndefined();
    });

    it('applies the optional display_name, else derives it', () => {
      const named = {...llmCandidate, displayName: 'My Curated Gemma'};
      const [withName] = modelStore.resolvePresetModels(
        makeRules([named]) as any,
        signals as any,
      );
      expect(withName.name).toBe('My Curated Gemma');

      const [derived] = modelStore.resolvePresetModels(
        makeRules([llmCandidate]) as any,
        signals as any,
      );
      expect(derived.name).not.toBe('My Curated Gemma');
      expect(derived.name).toBeTruthy();
    });

    it('expands a multimodal candidate into the LLM plus exactly one projector stub', () => {
      const presets = modelStore.resolvePresetModels(
        makeRules([visionCandidate]) as any,
        signals as any,
      );
      const ids = presets.map(m => m.id);
      expect(ids).toContain(
        'ggml-org/SmolVLM-500M-Instruct-GGUF/SmolVLM-500M-Instruct-Q8_0.gguf',
      );
      expect(ids).toContain(
        'ggml-org/SmolVLM-500M-Instruct-GGUF/mmproj-SmolVLM-500M-Instruct-Q8_0.gguf',
      );
      // One LLM + one projector, never the old multi-quant sibling set.
      expect(presets).toHaveLength(2);
      const projectors = presets.filter(m => /\/mmproj/i.test(m.id));
      expect(projectors).toHaveLength(1);
    });

    it('dedups a repeated candidate, first wins', () => {
      const presets = modelStore.resolvePresetModels(
        makeRules([llmCandidate, llmCandidate]) as any,
        signals as any,
      );
      expect(presets).toHaveLength(1);
    });

    it('synthesizes the projector stub as a downloadable Model (derived url)', () => {
      // The vision LLM pairs the projection id; the synthesized sibling must put
      // the projector Model in the store so _downloadProjectionModelIfNeeded
      // finds it by id, with a non-empty /resolve/main/ url so
      // checkSpaceAndDownload does not early-return on !model.downloadUrl.
      const presets = modelStore.resolvePresetModels(
        makeRules([visionCandidate]) as any,
        signals as any,
      );
      const proj = presets.find(m =>
        m.id.endsWith('/mmproj-SmolVLM-500M-Instruct-Q8_0.gguf'),
      );
      expect(proj).toBeDefined();
      expect(proj?.downloadUrl).toBe(
        'https://huggingface.co/ggml-org/SmolVLM-500M-Instruct-GGUF/resolve/main/mmproj-SmolVLM-500M-Instruct-Q8_0.gguf',
      );
    });

    it('carries the projector size on the LLM so the fit check can add it', () => {
      // min_ram_gb may exclude projector memory; the synthesized mmproj sibling
      // carries its size so getVisionModelSizeBreakdown adds it to the fit check.
      const [llm] = modelStore.resolvePresetModels(
        makeRules([visionCandidate]) as any,
        signals as any,
      );
      const projSibling = llm.hfModel?.siblings?.find(s =>
        /mmproj/i.test(s.rfilename),
      );
      expect(projSibling?.size).toBe(100);
    });

    it('pairs the LLM stub with its projector stub via defaultProjectionModel', () => {
      // The LLM stub's defaultProjectionModel must equal the projector stub's id
      // so the download path (this.models.find(m => m.id === projModelId))
      // resolves and the projector downloads alongside the LLM.
      const presets = modelStore.resolvePresetModels(
        makeRules([visionCandidate]) as any,
        signals as any,
      );
      const llm = presets.find(
        m =>
          m.id ===
          'ggml-org/SmolVLM-500M-Instruct-GGUF/SmolVLM-500M-Instruct-Q8_0.gguf',
      );
      const proj = presets.find(m => /\/mmproj/i.test(m.id));
      expect(llm?.defaultProjectionModel).toBe(proj?.id);
      expect(llm?.compatibleProjectionModels).toContain(proj?.id);
    });

    it('feeds the projector size into the fit/space breakdown', () => {
      // hasEnoughSpace sizes a vision model via getVisionModelSizeBreakdown,
      // which reads the synthesized mmproj sibling. The projector size must add
      // to the total so the ~1GB projector enters the pre-download fit check.
      const [llm] = modelStore.resolvePresetModels(
        makeRules([visionCandidate]) as any,
        signals as any,
      );
      const breakdown = getVisionModelSizeBreakdown(
        llm.hfModelFile!,
        llm.hfModel!,
      );
      expect(breakdown.hasProjection).toBe(true);
      expect(breakdown.projectionSize).toBe(100);
      expect(breakdown.llmSize).toBe(500);
      expect(breakdown.totalSize).toBe(600);
    });

    it('classifies the bundled floor (non-low) when offline', () => {
      // The bundled path must run rules through classify, not force the low
      // floor. A mid-tier device + a mid-only tier matrix resolves mid.
      const tier = classify(
        signals as any,
        makeRules([llmCandidate]).classifier as any,
        'android',
      );
      expect(tier).toBe('mid');
    });
  });

  describe('bundled offline floor (committed rules.<platform>.json)', () => {
    let savedOS: typeof Platform.OS;
    afterEach(() => {
      Platform.OS = savedOS;
    });
    beforeEach(() => {
      savedOS = Platform.OS;
    });

    // Projector (mmproj) Models are synthesized from the candidate's explicit
    // mmproj into a sibling with a derived /resolve/main/ url — so EVERY resolved
    // preset, LLM and projector alike, has a non-empty downloadUrl and is
    // downloadable (a vision preset's projector would never download otherwise).
    const isProjection = (id: string) => /\/mmproj/i.test(id);

    it('android: parses + classifies non-low and resolves origin:HF presets', () => {
      Platform.OS = 'android';
      const rules = parseDeviceRules(androidBundledRules);
      const signals = {ramBytes: 16 * 1e9, socModel: 'SM8850'};
      const tier = classify(signals as any, rules.classifier, 'android');
      expect(tier).not.toBe('low');
      expect(rules.tiers[tier].models.length).toBeGreaterThan(0);

      const presets = modelStore.resolvePresetModels(rules, signals as any);
      expect(presets.length).toBeGreaterThan(0);
      for (const m of presets) {
        expect(m.origin).toBe(ModelOrigin.HF);
        expect(m.downloadUrl).toContain('/resolve/main/');
      }
    });

    it('ios: parses + classifies non-low and resolves origin:HF presets', () => {
      Platform.OS = 'ios';
      const rules = parseDeviceRules(iosBundledRules);
      const signals = {ramBytes: 8 * 1e9, machine: 'iPhone16,1'};
      const tier = classify(signals as any, rules.classifier, 'ios');
      expect(tier).not.toBe('low');
      expect(rules.tiers[tier].models.length).toBeGreaterThan(0);

      const presets = modelStore.resolvePresetModels(rules, signals as any);
      expect(presets.length).toBeGreaterThan(0);
      for (const m of presets) {
        expect(m.origin).toBe(ModelOrigin.HF);
        expect(m.downloadUrl).toContain('/resolve/main/');
      }
    });

    it('every synthesized mmproj projection carries a downloadable url', () => {
      // Regression lock: the synthesized projector sibling must carry a derived
      // url so the projector Model is downloadable (checkSpaceAndDownload early-
      // returns on !downloadUrl). Walk both platforms; require at least one.
      let sawProjection = false;
      for (const [os, raw] of [
        ['android', androidBundledRules],
        ['ios', iosBundledRules],
      ] as const) {
        Platform.OS = os;
        const rules = parseDeviceRules(raw);
        const signals = {
          ramBytes: 16 * 1e9,
          socModel: 'SM8850',
          machine: 'iPhone16,1',
        };
        // resolvePresetModels classifies internally; one call covers the device's
        // tier. Materialized projections must each carry a downloadable url.
        const presets = modelStore.resolvePresetModels(rules, signals as any);
        for (const m of presets.filter(p => isProjection(p.id))) {
          sawProjection = true;
          expect(m.downloadUrl).toContain('/resolve/main/');
          expect(m.downloadUrl).not.toBe('');
        }
      }
      expect(sawProjection).toBe(true);
    });

    it('android: resolved LLMs defer oid/lfs to download (none baked)', () => {
      Platform.OS = 'android';
      const rules = parseDeviceRules(androidBundledRules);
      const signals = {ramBytes: 16 * 1e9, socModel: 'SM8850'};
      const presets = modelStore.resolvePresetModels(rules, signals as any);
      const llms = presets.filter(m => !isProjection(m.id));
      expect(llms.length).toBeGreaterThan(0);
      for (const m of llms) {
        // Thin stubs carry no baked oid/lfs; they self-heal at download.
        expect(m.hfModelFile?.oid).toBeUndefined();
        expect(m.hfModelFile?.lfs).toBeUndefined();
      }
    });

    it('all four tiers parse to a non-empty, origin:HF model set on android', () => {
      const rules = parseDeviceRules(androidBundledRules);
      for (const tier of ['low', 'mid', 'high', 'flagship'] as const) {
        expect(rules.tiers[tier].models.length).toBeGreaterThan(0);
      }
    });

    it('all four tiers parse to a non-empty, origin:HF model set on ios', () => {
      const rules = parseDeviceRules(iosBundledRules);
      for (const tier of ['low', 'mid', 'high', 'flagship'] as const) {
        expect(rules.tiers[tier].models.length).toBeGreaterThan(0);
      }
    });
  });

  describe('preset migration / reconcile', () => {
    let savedOS: typeof Platform.OS;
    beforeAll(() => {
      savedOS = Platform.OS;
      Platform.OS = 'android';
    });
    afterAll(() => {
      Platform.OS = savedOS;
    });

    // A rule preset (origin HF) sharing the legacy PRESET's {repo,filename}.
    const rulePresetForGemma: Model = createModel({
      id: 'bartowski/gemma-2-2b-it-GGUF/gemma-2-2b-it-Q6_K.gguf',
      author: 'bartowski',
      repo: 'gemma-2-2b-it-GGUF',
      name: 'Gemma-2-2b-it (Q6_K)',
      filename: 'gemma-2-2b-it-Q6_K.gguf',
      origin: ModelOrigin.HF,
      isDownloaded: false,
    }) as Model;

    it('keeps a downloaded legacy PRESET and suppresses the same-{repo,filename} rule stub', () => {
      const downloadedPreset = {...presetModelFixture, isDownloaded: true};
      modelStore.models = [downloadedPreset];

      runInAction(() => {
        modelStore.mergeModelLists([rulePresetForGemma]);
      });

      const matching = modelStore.models.filter(
        m =>
          `${m.repo}/${m.filename}` ===
          'gemma-2-2b-it-GGUF/gemma-2-2b-it-Q6_K.gguf',
      );
      expect(matching).toHaveLength(1);
      expect(matching[0].origin).toBe(ModelOrigin.PRESET);
      expect(matching[0].isDownloaded).toBe(true);
    });

    it('suppresses a rule stub already downloaded from the HF browser', () => {
      const downloadedHF = {
        ...rulePresetForGemma,
        isDownloaded: true,
        hfModel: mockHFModel1,
      };
      modelStore.models = [downloadedHF];

      runInAction(() => {
        modelStore.mergeModelLists([rulePresetForGemma]);
      });

      const matching = modelStore.models.filter(
        m =>
          `${m.repo}/${m.filename}` ===
          'gemma-2-2b-it-GGUF/gemma-2-2b-it-Q6_K.gguf',
      );
      expect(matching).toHaveLength(1);
      expect(matching[0].isDownloaded).toBe(true);
    });

    it('adds a not-downloaded rule preset as origin HF', () => {
      modelStore.models = [];

      runInAction(() => {
        modelStore.mergeModelLists([rulePresetForGemma]);
      });

      expect(modelStore.models).toHaveLength(1);
      expect(modelStore.models[0].origin).toBe(ModelOrigin.HF);
      expect(modelStore.models[0].filename).toBe('gemma-2-2b-it-Q6_K.gguf');
    });

    it('reconcilePresets is a no-op when the preset already exists at any origin', () => {
      const downloadedPreset = {...presetModelFixture, isDownloaded: true};
      modelStore.models = [downloadedPreset];

      runInAction(() => {
        modelStore.reconcilePresets([rulePresetForGemma]);
      });

      expect(modelStore.models).toHaveLength(1);
      expect(modelStore.models[0].origin).toBe(ModelOrigin.PRESET);
    });
  });

  describe('model list version gate', () => {
    it('pins MODEL_LIST_VERSION to the single data-driven bump', () => {
      // The data-driven preset list is one re-merge bump (14 -> 15); a second
      // bump would force-drop persisted user state. Lock it so it is not
      // re-bumped silently.
      expect(MODEL_LIST_VERSION).toBe(15);
    });
  });

  describe('resetModels repopulates the default list', () => {
    let savedOS: typeof Platform.OS;
    beforeEach(() => {
      savedOS = Platform.OS;
      Platform.OS = 'android';
      (readDeviceSignals as jest.Mock).mockResolvedValue({
        ramBytes: 16 * 1e9,
        socModel: 'SM8850',
      });
      (fetchRules as jest.Mock).mockResolvedValue(null);
    });
    afterEach(async () => {
      // resetModels fires an un-awaited loadMissingGGUFMetadata; let it settle
      // before clearing so it cannot bleed into the next test.
      await new Promise(resolve => setTimeout(resolve, 50));
      Platform.OS = savedOS;
      runInAction(() => {
        modelStore.models = [];
      });
    });

    it('re-resolves device presets while keeping local and HF models', async () => {
      const localModel = createModel({
        id: 'local/my-model.gguf',
        author: 'local',
        repo: 'local',
        filename: 'my-model.gguf',
        fullPath: '/tmp/my-model.gguf',
        origin: ModelOrigin.LOCAL,
        isLocal: true,
        isDownloaded: true,
      }) as Model;
      const hfModel = createModel({
        id: 'hf/repo/hf.gguf',
        author: 'hf',
        repo: 'repo',
        filename: 'hf.gguf',
        origin: ModelOrigin.HF,
        isDownloaded: true,
        hfModel: mockHFModel1,
      }) as Model;
      modelStore.models = [localModel, hfModel];

      await modelStore.resetModels();

      // Local and HF models survive the reset.
      expect(modelStore.models.some(m => m.id === 'local/my-model.gguf')).toBe(
        true,
      );
      expect(modelStore.models.some(m => m.id === 'hf/repo/hf.gguf')).toBe(
        true,
      );

      // The device-appropriate rule presets are repopulated in-session.
      const presets = modelStore.models.filter(m => m.isRulePreset === true);
      expect(presets.length).toBeGreaterThan(0);

      // Reset stop words contain no exact duplicates (the preset reconcile
      // re-appends defaults onto the just-reset kept models).
      const keptLocal = modelStore.models.find(
        m => m.id === 'local/my-model.gguf',
      ) as Model;
      const keptHF = modelStore.models.find(
        m => m.id === 'hf/repo/hf.gguf',
      ) as Model;
      expect(keptLocal.stopWords).toEqual([...new Set(keptLocal.stopWords)]);
      expect(keptHF.stopWords).toEqual([...new Set(keptHF.stopWords)]);
    });
  });

  describe('migration with empty preset resolve', () => {
    let savedOS: typeof Platform.OS;
    beforeEach(() => {
      savedOS = Platform.OS;
      Platform.OS = 'android';
      runInAction(() => {
        modelStore.models = [];
        modelStore.version = undefined;
        modelStore.availableMemoryCeiling = 1;
      });
      (fetchRules as jest.Mock).mockResolvedValue(null);
    });
    afterEach(async () => {
      // initializeStore fires several un-awaited background tasks; let them
      // settle before clearing state so they cannot bleed into the next test.
      await new Promise(resolve => setTimeout(resolve, 50));
      Platform.OS = savedOS;
      runInAction(() => {
        modelStore.models = [];
      });
      (readDeviceSignals as jest.Mock).mockResolvedValue({
        ramBytes: 8 * 1e9,
        socModel: 'SM8850',
      });
    });

    it('does not finalize the migration when presets resolve empty', async () => {
      // A transient signal-read failure makes resolvePresets return [].
      (readDeviceSignals as jest.Mock).mockRejectedValue(
        new Error('signals exploded'),
      );

      await modelStore.initializeStore();

      // An empty resolve must not lock in an empty default list: leave the
      // version unbumped so the migration retries on the next launch.
      expect(modelStore.version).toBeUndefined();
    });

    it('finalizes the migration once presets resolve non-empty', async () => {
      (readDeviceSignals as jest.Mock).mockResolvedValue({
        ramBytes: 16 * 1e9,
        socModel: 'SM8850',
      });

      await modelStore.initializeStore();

      // The bundled floor resolved a non-empty preset list, so the one-time
      // migration finalizes.
      expect(modelStore.version).toBe(MODEL_LIST_VERSION);
      expect(modelStore.models.some(m => m.isRulePreset === true)).toBe(true);
    });
  });

  describe('reconcilePresets pruning (steady-state drift)', () => {
    let savedOS: typeof Platform.OS;
    beforeAll(() => {
      savedOS = Platform.OS;
      Platform.OS = 'android';
    });
    afterAll(() => {
      Platform.OS = savedOS;
    });

    const ruleA: Model = createModel({
      id: 'ggml-org/repo-a/a.gguf',
      author: 'ggml-org',
      repo: 'repo-a',
      filename: 'a.gguf',
      origin: ModelOrigin.HF,
      isDownloaded: false,
    }) as Model;
    const ruleB: Model = createModel({
      id: 'ggml-org/repo-b/b.gguf',
      author: 'ggml-org',
      repo: 'repo-b',
      filename: 'b.gguf',
      origin: ModelOrigin.HF,
      isDownloaded: false,
    }) as Model;

    it('prunes a non-downloaded rule stub no longer in the fresh set', () => {
      modelStore.models = [{...ruleA, isRulePreset: true}];

      runInAction(() => {
        modelStore.reconcilePresets([{...ruleB, isRulePreset: true}]);
      });

      const ids = modelStore.models.map(m => m.id);
      expect(ids).toContain('ggml-org/repo-b/b.gguf');
      expect(ids).not.toContain('ggml-org/repo-a/a.gguf');
    });

    it('never prunes a downloaded rule preset even if dropped from the set', () => {
      modelStore.models = [{...ruleA, isRulePreset: true, isDownloaded: true}];

      runInAction(() => {
        modelStore.reconcilePresets([{...ruleB, isRulePreset: true}]);
      });

      const ids = modelStore.models.map(m => m.id);
      expect(ids).toContain('ggml-org/repo-a/a.gguf');
      expect(ids).toContain('ggml-org/repo-b/b.gguf');
    });

    it('never prunes a user-added HF model not in the rule set', () => {
      const userHF: Model = createModel({
        id: 'someone/user-repo/user.gguf',
        author: 'someone',
        repo: 'user-repo',
        filename: 'user.gguf',
        origin: ModelOrigin.HF,
        isDownloaded: false,
      }) as Model; // no isRulePreset marker

      modelStore.models = [userHF];

      runInAction(() => {
        modelStore.reconcilePresets([{...ruleB, isRulePreset: true}]);
      });

      const ids = modelStore.models.map(m => m.id);
      expect(ids).toContain('someone/user-repo/user.gguf');
      expect(ids).toContain('ggml-org/repo-b/b.gguf');
    });

    it('never prunes a LOCAL model', () => {
      const local: Model = createModel({
        id: 'local-model',
        origin: ModelOrigin.LOCAL,
        isLocal: true,
        isDownloaded: true,
      }) as Model;

      modelStore.models = [local];

      runInAction(() => {
        modelStore.reconcilePresets([{...ruleB, isRulePreset: true}]);
      });

      const ids = modelStore.models.map(m => m.id);
      expect(ids).toContain('local-model');
    });
  });

  describe('resolvePresets / startup integration', () => {
    let savedOS: typeof Platform.OS;
    beforeEach(() => {
      savedOS = Platform.OS;
      Platform.OS = 'android';
      modelStore.models = [];
      modelStore.deviceTier = null;
      modelStore.rulesVersion = null;
      (fetchRules as jest.Mock).mockResolvedValue(null);
      (readDeviceSignals as jest.Mock).mockResolvedValue({
        ramBytes: 16 * 1e9,
        socModel: 'SM8850',
      });
    });
    afterEach(() => {
      Platform.OS = savedOS;
      (fetchRules as jest.Mock).mockResolvedValue(null);
    });

    it('applies the bundled floor (no fetch) and sets deviceTier/rulesVersion', async () => {
      const presets = await (modelStore as any).resolvePresets();

      // The bundled floor populated a non-empty origin:HF preset set without the
      // network fetch being consulted on this path.
      expect(fetchRules).not.toHaveBeenCalled();
      expect(presets.length).toBeGreaterThan(0);
      expect(presets.every((m: Model) => m.origin === ModelOrigin.HF)).toBe(
        true,
      );
      expect(presets.every((m: Model) => m.isRulePreset === true)).toBe(true);
      expect(modelStore.deviceTier).not.toBeNull();
      expect(modelStore.rulesVersion).toBeTruthy();
    });

    it('returns [] and completes when bundled parse throws (startup not bricked)', async () => {
      (readDeviceSignals as jest.Mock).mockRejectedValue(
        new Error('signals exploded'),
      );
      await expect((modelStore as any).resolvePresets()).resolves.toEqual([]);
    });

    it('upgrades to fetched rules and reconciles when newer rules arrive', async () => {
      const fetchedRules = parseDeviceRules({
        schema_version: '1.2.0-draft',
        platform: 'android',
        rules_version: '2999-01-01.1',
        classifier: {
          ram_bands: [{id: 'all', max_bytes: null}],
          tier_matrix: [{ram_band: 'all', soc_class: 'mid', tier: 'mid'}],
          soc_model_to_class: {SM8850: 'mid'},
        },
        tiers: {
          mid: {
            candidates: [
              {
                model: 'fetched',
                hf_repo: 'ggml-org/fetched-repo',
                hf_filename: 'fetched.gguf',
                size_bytes: 500,
              },
            ],
          },
        },
      });
      (fetchRules as jest.Mock).mockResolvedValue(fetchedRules);

      await (modelStore as any).upgradeToFetchedRules();

      const ids = modelStore.models.map(m => m.id);
      expect(ids).toContain('ggml-org/fetched-repo/fetched.gguf');
      expect(modelStore.rulesVersion).toBe('2999-01-01.1');
    });

    it('leaves the bundled presets in place when the fetch returns null', async () => {
      modelStore.models = [
        {...presetModelFixture, origin: ModelOrigin.HF, isRulePreset: true},
      ];
      (fetchRules as jest.Mock).mockResolvedValue(null);

      await (modelStore as any).upgradeToFetchedRules();

      expect(modelStore.models).toHaveLength(1);
    });
  });

  describe('legacy PRESET that is also a fresh rule entry (overlap)', () => {
    let savedOS: typeof Platform.OS;
    beforeAll(() => {
      savedOS = Platform.OS;
      Platform.OS = 'android';
    });
    afterAll(() => {
      Platform.OS = savedOS;
    });

    it('collapses a non-downloaded legacy PRESET + same-id rule entry to one HF card', () => {
      // Pre-merge state: a non-downloaded legacy PRESET stub.
      const legacyPreset = {...presetModelFixture, isDownloaded: false};
      modelStore.models = [legacyPreset];

      // The same model now also appears in the rule set (origin HF, same id).
      const rulePreset: Model = createModel({
        id: presetModelFixture.id,
        author: presetModelFixture.author,
        repo: presetModelFixture.repo,
        filename: presetModelFixture.filename,
        origin: ModelOrigin.HF,
        isDownloaded: false,
      }) as Model;

      runInAction(() => {
        // mergeModelLists drops the non-downloaded PRESET stub, then reconcile
        // re-adds the rule entry: exactly one card, origin HF.
        modelStore.mergeModelLists([{...rulePreset, isRulePreset: true}]);
      });

      const matching = modelStore.models.filter(
        m => m.id === presetModelFixture.id,
      );
      expect(matching).toHaveLength(1);
      expect(matching[0].origin).toBe(ModelOrigin.HF);
    });
  });

  describe('built-in Lookie model download', () => {
    let originalExists: any;

    beforeEach(() => {
      jest.clearAllMocks();
      (RNFS as any).__resetMockState?.();
      modelStore.models = [];
      (downloadManager.syncWithActiveDownloads as jest.Mock).mockResolvedValue(
        undefined,
      );
      (downloadManager.startDownload as jest.Mock).mockResolvedValue(undefined);
      // Nothing is pre-downloaded so the LLM/mmproj are not marked downloaded
      // (which would make checkSpaceAndDownload early-return).
      originalExists = (RNFS.exists as jest.Mock).getMockImplementation();
      (RNFS.exists as jest.Mock).mockResolvedValue(false);
    });

    afterEach(async () => {
      // downloadHFModel leaves an unawaited checkSpaceAndDownload chain; let it
      // settle, then clear the store and restore the RNFS.exists default so this
      // test's state can't bleed into the next one.
      await new Promise(resolve => setTimeout(resolve, 50));
      runInAction(() => {
        modelStore.models = [];
      });
      if (originalExists) {
        (RNFS.exists as jest.Mock).mockImplementation(originalExists);
      }
    });

    // Regression: SmolVLM is in no tier and was never reconciled into the store,
    // so the warning's download tap must route through the model's own hfModel
    // (downloadHFModel -> addHFModel), NOT a store id lookup. No tier seeding.
    it('materializes the LLM + mmproj into the store and downloads both', async () => {
      expect(LOOKIE_DEFAULT_MODEL.hfModel).toBeDefined();

      await modelStore.downloadHFModel(
        LOOKIE_DEFAULT_MODEL.hfModel!,
        LOOKIE_DEFAULT_MODEL.hfModelFile!,
        {enableVision: true},
      );
      // downloadHFModel kicks off checkSpaceAndDownload without awaiting it
      // (it waits 200ms internally for mmproj materialization first); let the
      // download chain settle before asserting.
      await new Promise(resolve => setTimeout(resolve, 50));

      const llm = modelStore.models.find(
        m =>
          m.id ===
          'ggml-org/SmolVLM-500M-Instruct-GGUF/SmolVLM-500M-Instruct-Q8_0.gguf',
      );
      const mmproj = modelStore.models.find(
        m =>
          m.id ===
          'ggml-org/SmolVLM-500M-Instruct-GGUF/mmproj-SmolVLM-500M-Instruct-Q8_0.gguf',
      );

      expect(llm).toBeDefined();
      expect(llm?.origin).toBe(ModelOrigin.HF);
      expect(llm?.supportsMultimodal).toBe(true);
      expect(mmproj).toBeDefined();
      expect(mmproj?.downloadUrl).toContain('/resolve/main/');

      // Vision-enabled, so both the LLM and its projection are downloaded.
      expect(downloadManager.startDownload).toHaveBeenCalledTimes(2);
    });
  });

  describe('model management', () => {
    it('should add local model correctly', async () => {
      const localPath = '/path/to/model.bin';
      await modelStore.addLocalModel(localPath);

      expect(modelStore.models).toHaveLength(1);
      expect(modelStore.models[0]).toEqual(
        expect.objectContaining({
          isLocal: true,
          origin: ModelOrigin.LOCAL,
          fullPath: localPath,
          isDownloaded: true,
        }),
      );
    });

    it('should delete model and release context if active', async () => {
      const model = presetModelFixture;
      modelStore.models = [model];
      modelStore.activeModelId = model.id;

      await modelStore.deleteModel(model);
      // await when(() => modelStore.activeModelId === undefined); // wait for mobx to propagate changes

      expect(modelStore.activeModelId).toBeUndefined();
      expect(modelStore.context).toBeUndefined();
    });
  });

  describe('model name management', () => {
    it('should update model name for local model', () => {
      const localModel = {
        ...basicModel,
        id: 'local-test-id',
        name: 'Original Name',
        origin: ModelOrigin.LOCAL,
      };
      runInAction(() => {
        modelStore.models = [localModel];
      });

      modelStore.updateModelName('local-test-id', 'New Name');

      expect(modelStore.models[0].name).toBe('New Name');
    });

    it('should update model name for preset model', () => {
      const presetModel = {
        ...basicModel,
        id: 'preset-test-id',
        name: 'Gemma-2-2b-it (Q6_K)',
        origin: ModelOrigin.PRESET,
      };
      runInAction(() => {
        modelStore.models = [presetModel];
      });

      modelStore.updateModelName('preset-test-id', 'New Name');

      // Name should be updated
      expect(modelStore.models[0].name).toBe('New Name');
    });

    it('should reset local model name by stripping .gguf extension', () => {
      const localModel = {
        ...basicModel,
        id: 'local-test-id',
        name: 'Modified Name',
        filename: 'my-model-file.gguf',
        origin: ModelOrigin.LOCAL,
      };
      runInAction(() => {
        modelStore.models = [localModel];
      });

      modelStore.resetModelName('local-test-id');

      expect(modelStore.models[0].name).toBe('my-model-file');
    });

    it('should reset preset model name to the filename-derived name', () => {
      const presetModel = {
        ...presetModelFixture,
        name: 'User Modified Name', // User changed it
      };
      runInAction(() => {
        modelStore.models = [presetModel];
      });

      modelStore.resetModelName(presetModel.id);

      // Display-name reset is now filename-derived for every origin.
      expect(modelStore.models[0].name).toBe(
        getDisplayNameFromFilename(presetModelFixture.filename),
      );
    });

    it('should reset any preset model name from its filename', () => {
      const orphanPresetModel = {
        ...basicModel,
        id: 'orphan-preset-id',
        name: 'Modified Name',
        filename: 'orphan-model.gguf',
        origin: ModelOrigin.PRESET,
      };
      runInAction(() => {
        modelStore.models = [orphanPresetModel];
      });

      modelStore.resetModelName('orphan-preset-id');

      // Should fall back to stripping .gguf from filename
      expect(modelStore.models[0].name).toBe('orphan-model');
    });
  });

  describe('projection model deletion', () => {
    beforeEach(() => {
      jest.clearAllMocks();

      // Reset RNFS mock state
      (RNFS as any).__resetMockState?.();

      // Reset store state
      modelStore.models = [];
      modelStore.context = undefined;
      modelStore.activeModelId = undefined;
      modelStore.activeProjectionModelId = undefined;

      // Re-setup download manager mocks after clearAllMocks
      (downloadManager.syncWithActiveDownloads as jest.Mock).mockResolvedValue(
        undefined,
      );
      (downloadManager.startDownload as jest.Mock).mockResolvedValue(undefined);
    });

    it('should allow deletion of unused projection model', () => {
      const projModel = {
        ...presetModelFixture,
        id: 'test-proj-model',
        modelType: ModelType.PROJECTION,
        isDownloaded: true,
      };

      modelStore.models = [projModel];

      const result = modelStore.canDeleteProjectionModel(projModel.id);
      expect(result.canDelete).toBe(true);
    });

    it('should prevent deletion of active projection model', () => {
      const projModel = {
        ...presetModelFixture,
        id: 'test-proj-model',
        modelType: ModelType.PROJECTION,
        isDownloaded: true,
      };

      modelStore.context = new LlamaContext(mockLlamaContextParams);
      modelStore.models = [projModel];
      modelStore.activeProjectionModelId = projModel.id;

      const result = modelStore.canDeleteProjectionModel(projModel.id);
      expect(result.canDelete).toBe(false);
      expect(result.reason).toBe('Projection model is currently active');
    });

    it('should allow deletion of projection model used by downloaded LLM with warning', () => {
      const projModel = {
        ...presetModelFixture,
        id: 'test-proj-model',
        modelType: ModelType.PROJECTION,
        isDownloaded: true,
      };

      const llmModel = {
        ...presetModelFixture,
        id: 'test-llm-model',
        supportsMultimodal: true,
        defaultProjectionModel: projModel.id,
        isDownloaded: true,
      };

      modelStore.models = [projModel, llmModel];

      const result = modelStore.canDeleteProjectionModel(projModel.id);
      expect(result.canDelete).toBe(true);
      expect(result.dependentModels).toHaveLength(1);
      expect(result.dependentModels![0].id).toBe(llmModel.id);
    });

    it('should allow deletion of projection model used only by non-downloaded LLM', () => {
      const projModel = {
        ...presetModelFixture,
        id: 'test-proj-model',
        modelType: ModelType.PROJECTION,
        isDownloaded: true,
      };

      const llmModel = {
        ...presetModelFixture,
        id: 'test-llm-model',
        supportsMultimodal: true,
        defaultProjectionModel: projModel.id,
        isDownloaded: false, // Not downloaded
      };

      modelStore.models = [projModel, llmModel];

      const result = modelStore.canDeleteProjectionModel(projModel.id);
      expect(result.canDelete).toBe(true);
    });

    it('should get LLMs using projection model', () => {
      const projModel = {
        ...presetModelFixture,
        id: 'test-proj-model',
        modelType: ModelType.PROJECTION,
        isDownloaded: true,
      };

      const llmModel1 = {
        ...presetModelFixture,
        id: 'test-llm-model-1',
        supportsMultimodal: true,
        defaultProjectionModel: projModel.id,
        isDownloaded: true,
      };

      const llmModel2 = {
        ...presetModelFixture,
        id: 'test-llm-model-2',
        supportsMultimodal: true,
        defaultProjectionModel: projModel.id,
        isDownloaded: false,
      };

      const unrelatedModel = {
        ...presetModelFixture,
        id: 'test-unrelated-model',
        supportsMultimodal: true,
        defaultProjectionModel: 'other-proj-model',
        isDownloaded: true,
      };

      modelStore.models = [projModel, llmModel1, llmModel2, unrelatedModel];

      const allLLMs = modelStore.getLLMsUsingProjectionModel(projModel.id);
      expect(allLLMs).toHaveLength(2);
      expect(allLLMs.map(m => m.id)).toContain(llmModel1.id);
      expect(allLLMs.map(m => m.id)).toContain(llmModel2.id);

      const downloadedLLMs = modelStore.getDownloadedLLMsUsingProjectionModel(
        projModel.id,
      );
      expect(downloadedLLMs).toHaveLength(1);
      expect(downloadedLLMs[0].id).toBe(llmModel1.id);
    });

    it('should automatically cleanup orphaned projection model when LLM is deleted', async () => {
      // Mock RNFS.exists to return false so backwards compat checks use new path consistently
      (RNFS.exists as jest.Mock).mockResolvedValue(false);

      const projModel = {
        ...presetModelFixture,
        id: 'test-proj-model',
        modelType: ModelType.PROJECTION,
        isDownloaded: true,
      };

      const llmModel = {
        ...presetModelFixture,
        id: 'test-llm-model',
        supportsMultimodal: true,
        defaultProjectionModel: projModel.id,
        isDownloaded: true,
      };

      modelStore.models = [projModel, llmModel];

      // Verify projection model is initially present and downloaded
      expect(
        modelStore.models.find(m => m.id === projModel.id)?.isDownloaded,
      ).toBe(true);

      // Delete the LLM model
      await modelStore.deleteModel(llmModel);

      // Verify the projection model was automatically cleaned up
      const remainingProjModel = modelStore.models.find(
        m => m.id === projModel.id,
      );
      expect(remainingProjModel?.isDownloaded).toBe(false);
    });

    it('should not cleanup projection model if multiple LLMs use it', async () => {
      const projModel = {
        ...presetModelFixture,
        id: 'test-proj-model',
        modelType: ModelType.PROJECTION,
        isDownloaded: true,
      };

      const llmModel1 = {
        ...presetModelFixture,
        id: 'test-llm-model-1',
        supportsMultimodal: true,
        defaultProjectionModel: projModel.id,
        isDownloaded: true,
      };

      const llmModel2 = {
        ...presetModelFixture,
        id: 'test-llm-model-2',
        supportsMultimodal: true,
        defaultProjectionModel: projModel.id,
        isDownloaded: true,
      };

      modelStore.models = [projModel, llmModel1, llmModel2];

      // Delete one LLM model
      await modelStore.deleteModel(llmModel1);

      // Verify the projection model is still downloaded (still used by llmModel2)
      const remainingProjModel = modelStore.models.find(
        m => m.id === projModel.id,
      );
      expect(remainingProjModel?.isDownloaded).toBe(true);
    });

    it('should cleanup multiple orphaned projection models when LLM is deleted', async () => {
      const projModel1 = {
        ...presetModelFixture,
        id: 'test-proj-model-1',
        modelType: ModelType.PROJECTION,
        isDownloaded: true,
      };

      const projModel2 = {
        ...presetModelFixture,
        id: 'test-proj-model-2',
        modelType: ModelType.PROJECTION,
        isDownloaded: true,
      };

      const llmModel = {
        ...presetModelFixture,
        id: 'test-llm-model',
        supportsMultimodal: true,
        defaultProjectionModel: projModel1.id,
        compatibleProjectionModels: [projModel1.id, projModel2.id],
        isDownloaded: true,
      };

      modelStore.models = [projModel1, projModel2, llmModel];

      // Verify both projection models are initially downloaded
      expect(
        modelStore.models.find(m => m.id === projModel1.id)?.isDownloaded,
      ).toBe(true);
      expect(
        modelStore.models.find(m => m.id === projModel2.id)?.isDownloaded,
      ).toBe(true);

      // Delete the LLM model
      await modelStore.deleteModel(llmModel);

      // Verify both projection models were automatically cleaned up
      const remainingProjModel1 = modelStore.models.find(
        m => m.id === projModel1.id,
      );
      const remainingProjModel2 = modelStore.models.find(
        m => m.id === projModel2.id,
      );
      expect(remainingProjModel1?.isDownloaded).toBe(false);
      expect(remainingProjModel2?.isDownloaded).toBe(false);
    });

    it('should only cleanup orphaned projection models, not ones used by other LLMs', async () => {
      const projModel1 = {
        ...presetModelFixture,
        id: 'test-proj-model-1',
        modelType: ModelType.PROJECTION,
        isDownloaded: true,
        fullPath: '/path/to/proj-model-1.gguf', // Unique path
        isLocal: true,
        origin: ModelOrigin.LOCAL,
      };

      const projModel2 = {
        ...presetModelFixture,
        id: 'test-proj-model-2',
        modelType: ModelType.PROJECTION,
        isDownloaded: true,
        fullPath: '/path/to/proj-model-2.gguf', // Unique path
        isLocal: true,
        origin: ModelOrigin.LOCAL,
      };

      const llmModel1 = {
        ...presetModelFixture,
        id: 'test-llm-model-1',
        supportsMultimodal: true,
        defaultProjectionModel: projModel1.id,
        compatibleProjectionModels: [projModel1.id, projModel2.id],
        isDownloaded: true,
        fullPath: '/path/to/llm-model-1.gguf', // Unique path
        isLocal: true,
        origin: ModelOrigin.LOCAL,
      };

      const llmModel2 = {
        ...presetModelFixture,
        id: 'test-llm-model-2',
        supportsMultimodal: true,
        defaultProjectionModel: projModel2.id, // Uses projModel2
        isDownloaded: true,
        fullPath: '/path/to/llm-model-2.gguf', // Unique path
        isLocal: true,
        origin: ModelOrigin.LOCAL,
      };

      modelStore.models = [projModel1, projModel2, llmModel1, llmModel2];

      // Delete llmModel1
      await modelStore.deleteModel(llmModel1);

      // projModel1 should be cleaned up (only used by deleted llmModel1)
      // projModel2 should remain (still used by llmModel2)
      const remainingProjModel1 = modelStore.models.find(
        m => m.id === projModel1.id,
      );
      const remainingProjModel2 = modelStore.models.find(
        m => m.id === projModel2.id,
      );
      // For LOCAL models, they are removed from the store entirely when deleted
      expect(remainingProjModel1).toBeUndefined(); // projModel1 should be removed
      expect(remainingProjModel2).toBeDefined(); // projModel2 should remain
    });

    it('should set isDownloaded to false after deletion to enable orphaned cleanup', async () => {
      const projModel = {
        ...presetModelFixture,
        id: 'test-proj-model',
        modelType: ModelType.PROJECTION,
        isDownloaded: true,
        fullPath: '/path/to/test-proj-model.gguf', // Unique path
        isLocal: true,
        origin: ModelOrigin.LOCAL,
      };

      const llmModel = {
        ...presetModelFixture,
        id: 'test-llm-model',
        supportsMultimodal: true,
        defaultProjectionModel: projModel.id,
        isDownloaded: true,
        fullPath: '/path/to/test-llm-model.gguf', // Unique path
        isLocal: true,
        origin: ModelOrigin.LOCAL,
      };

      modelStore.models = [projModel, llmModel];

      // Verify both models are initially downloaded
      expect(llmModel.isDownloaded).toBe(true);
      expect(projModel.isDownloaded).toBe(true);

      // Delete the LLM model
      await modelStore.deleteModel(llmModel);

      // For LOCAL models, they are removed from the store entirely
      // So we check that they're no longer in the store
      const remainingLlmModel = modelStore.models.find(
        m => m.id === llmModel.id,
      );
      const remainingProjModel = modelStore.models.find(
        m => m.id === projModel.id,
      );

      // Verify LLM model was removed from store (for LOCAL models)
      expect(remainingLlmModel).toBeUndefined();

      // Verify projection model was automatically cleaned up (also removed from store)
      expect(remainingProjModel).toBeUndefined();
    });
  });

  describe('context management', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      // Reset store state
      modelStore.models = [];
      modelStore.context = undefined;
      modelStore.activeModelId = undefined;
    });

    it('should handle app state changes correctly', async () => {
      // Setup
      modelStore.useAutoRelease = true;
      const mockRelease = jest.fn();
      modelStore.context = {
        release: mockRelease, // Create the mock function first
      } as any;
      modelStore.activeModelId = 'test-id';
      modelStore.appState = 'active'; // Set initial app state to 'active'

      // Simulate going to background
      await modelStore.handleAppStateChange('background');

      // Check if context was released
      expect(mockRelease).toHaveBeenCalled(); // Check the mock function directly
      expect(modelStore.context).toBeUndefined();
    });

    it('should not release context when auto-release is disabled', async () => {
      // Setup
      modelStore.useAutoRelease = false;
      const mockRelease = jest.fn();
      modelStore.context = {
        release: mockRelease, // Create the mock function first
      } as any;
      modelStore.activeModelId = 'test-id';

      // Simulate going to background
      await modelStore.handleAppStateChange('background');

      // Check that context was not released
      expect(mockRelease).not.toHaveBeenCalled(); // Check the mock function directly
      expect(modelStore.context).toBeDefined();
    });

    it('should reinitialize context when coming back to foreground', async () => {
      // Setup
      modelStore.useAutoRelease = true;
      const model = {...presetModelFixture, isDownloaded: true}; // Ensure model is downloaded
      modelStore.models = [model];
      modelStore.activeModelId = model.id;

      // Set up the auto-release state to simulate that the model was auto-released
      modelStore.wasAutoReleased = true;
      modelStore.lastAutoReleasedModelId = model.id;

      const mockInitContext = jest
        .fn()
        .mockResolvedValue(new LlamaContext(mockLlamaContextParams));
      modelStore.initContext = mockInitContext;

      // Simulate coming to foreground
      modelStore.appState = 'background';
      await modelStore.handleAppStateChange('active');

      expect(mockInitContext).toHaveBeenCalledWith(model);
    });
  });

  describe('benchmark mode', () => {
    // The pre-existing 'context management → should reinitialize context'
    // test (~line 711) reassigns `modelStore.initContext` to a `jest.fn()`
    // and never restores it. That mocked replacement bypasses our
    // `if (this.benchmarkActive) throw ...` gate, so we capture the
    // original method once and restore it before each gate test.
    const originalInitContext = modelStore.initContext;

    beforeEach(() => {
      jest.clearAllMocks();
      modelStore.models = [];
      modelStore.context = undefined;
      modelStore.activeModelId = undefined;
      modelStore.benchmarkActive = false;
      modelStore.initContext = originalInitContext;
    });

    it('benchmarkActive defaults to false', () => {
      expect(modelStore.benchmarkActive).toBe(false);
    });

    it('enterBenchmarkMode sets benchmarkActive=true synchronously (before awaiting the mutex)', async () => {
      const promise = modelStore.enterBenchmarkMode();
      // Synchronous side-effect: any auto-load `useEffect` that fires now
      // will see the gate and skip. The promise still represents the
      // release of any in-flight context.
      expect(modelStore.benchmarkActive).toBe(true);
      await promise;
      expect(modelStore.benchmarkActive).toBe(true);
    });

    it('enterBenchmarkMode releases any existing context (cold-launch auto-load gets unwound)', async () => {
      const release = jest.fn().mockResolvedValue(undefined);
      modelStore.context = {release} as any;
      modelStore.activeModelId = 'auto-loaded-model';
      await modelStore.enterBenchmarkMode();
      expect(release).toHaveBeenCalledTimes(1);
      expect(modelStore.context).toBeUndefined();
      expect(modelStore.activeModelId).toBeUndefined();
    });

    it('exitBenchmarkMode flips benchmarkActive back to false', () => {
      modelStore.benchmarkActive = true;
      modelStore.exitBenchmarkMode();
      expect(modelStore.benchmarkActive).toBe(false);
    });

    it('initContext throws when benchmark mode is active', async () => {
      modelStore.benchmarkActive = true;
      const model = {...presetModelFixture, isDownloaded: true};
      await expect(modelStore.initContext(model)).rejects.toThrow(
        /benchmark mode is active/i,
      );
    });

    it('initContext succeeds again after exitBenchmarkMode', async () => {
      modelStore.benchmarkActive = true;
      const model = {...presetModelFixture, isDownloaded: true};
      modelStore.exitBenchmarkMode();
      // After exit, the synchronous gate is gone — initContext proceeds
      // to its normal pre-flight (memory check, etc.). The model isn't
      // downloaded in this test fixture so the call may resolve to null
      // or throw a non-benchmark error; we only care that the
      // benchmark-mode rejection is gone.
      const result = await modelStore.initContext(model).catch((e: Error) => e);
      if (result instanceof Error) {
        expect(result.message).not.toMatch(/benchmark mode is active/i);
      }
    });
  });

  describe('settings management', () => {
    it('should update stop words', () => {
      const model = {...presetModelFixture};
      modelStore.models = [model];

      const newStopWords = ['stop1', 'stop2'];

      modelStore.updateModelStopWords(model.id, newStopWords);

      expect(modelStore.models[0].stopWords).toEqual(newStopWords);
    });

    it('should reset model stop words to defaults', () => {
      const model = {...presetModelFixture};
      const originalStopWords = [...(model.defaultStopWords || [])];
      model.stopWords = ['custom1', 'custom2'];
      modelStore.models = [model];

      modelStore.resetModelStopWords(model.id);

      expect(modelStore.models[0].stopWords).toEqual(originalStopWords);
    });
  });

  describe('download management', () => {
    it('should handle download cancellation', async () => {
      const model = presetModelFixture;
      modelStore.models = [model];

      // Mock isDownloading to return true initially
      (downloadManager.isDownloading as jest.Mock).mockReturnValue(true);

      await modelStore.cancelDownload(model.id);

      expect(downloadManager.cancelDownload).toHaveBeenCalledWith(model.id);
      expect(model.isDownloaded).toBeFalsy();
      expect(model.progress).toBe(0);
    });

    it('should update model state on download error', () => {
      const model = presetModelFixture;
      modelStore.models = [model];

      // Set up callbacks directly
      const callbacks = {
        onError: (modelId: string) => {
          const _model = modelStore.models.find(m => m.id === modelId);
          if (_model) {
            runInAction(() => {
              _model.progress = 0;
              model.isDownloaded = false;
            });
          }
        },
      };

      // Trigger error callback
      callbacks.onError(model.id);

      expect(model.progress).toBe(0);
      expect(model.isDownloaded).toBe(false);
    });

    it('should not set downloadError when a download is cancelled', async () => {
      const model = {
        ...basicModel,
        downloadUrl: 'https://example.com/model.gguf',
        isDownloaded: false,
        isLocal: false,
        origin: ModelOrigin.PRESET,
      };
      modelStore.models = [model];
      runInAction(() => {
        modelStore.downloadError = null;
      });

      // A user-initiated cancel rejects startDownload with a DownloadCancelledError;
      // checkSpaceAndDownload must recognise it, keep the error surface clean,
      // and not re-throw.
      (downloadManager.startDownload as jest.Mock).mockRejectedValue(
        new DownloadCancelledError(model.id),
      );

      await expect(
        modelStore.checkSpaceAndDownload(model.id),
      ).resolves.toBeUndefined();

      expect(downloadManager.startDownload).toHaveBeenCalled();
      expect(modelStore.downloadError).toBeNull();
    });

    it('does not auto-download the projection model when a vision model download is cancelled', async () => {
      const projModel = {
        ...basicModel,
        id: 'proj-model',
        modelType: ModelType.PROJECTION,
        isDownloaded: false,
        isLocal: false,
        origin: ModelOrigin.PRESET,
        downloadUrl: 'https://example.com/proj.gguf',
      };
      const visionModel = {
        ...basicModel,
        id: 'vision-model',
        downloadUrl: 'https://example.com/vision.gguf',
        isDownloaded: false,
        isLocal: false,
        origin: ModelOrigin.PRESET,
        supportsMultimodal: true,
        defaultProjectionModel: 'proj-model',
      };
      modelStore.models = [visionModel, projModel];
      (downloadManager.isDownloading as jest.Mock).mockReturnValue(false);

      // The main model download is cancelled by the user.
      (downloadManager.startDownload as jest.Mock).mockRejectedValue(
        new DownloadCancelledError(visionModel.id),
      );

      await modelStore.checkSpaceAndDownload(visionModel.id);

      // Only the (cancelled) main model download was attempted — the projection
      // model must NOT be chained off a user cancel.
      expect(downloadManager.startDownload).toHaveBeenCalledTimes(1);
      expect(downloadManager.startDownload).toHaveBeenCalledWith(
        expect.objectContaining({id: 'vision-model'}),
        expect.anything(),
        expect.anything(),
      );
      expect(modelStore.downloadError).toBeNull();
    });

    it('should handle download failure due to insufficient space', async () => {
      const model = {
        ...presetModelFixture,
        downloadUrl: 'https://example.com/model.gguf', // Ensure model has download URL
        isLocal: false,
        origin: ModelOrigin.PRESET,
      };
      modelStore.models = [model];

      // Mock startDownload to reject with insufficient space error
      (downloadManager.startDownload as jest.Mock).mockRejectedValue(
        new Error('Not enough storage space to download the model'),
      );

      // Expect the error to be thrown
      await expect(modelStore.checkSpaceAndDownload(model.id)).rejects.toThrow(
        'Not enough storage space to download the model',
      );

      expect(downloadManager.startDownload).toHaveBeenCalled();
      // Contrast with the cancel case: a genuine failure DOES surface an error.
      expect(modelStore.downloadError).not.toBeNull();
    });
  });

  describe('computed properties', () => {
    it('should return correct active model', () => {
      const model = presetModelFixture;
      modelStore.models = [model];
      modelStore.activeModelId = model.id;

      expect(modelStore.activeModel).toEqual(model);
    });

    it('should return correct last used model', () => {
      const model = {...presetModelFixture, isDownloaded: true};
      modelStore.models = [model];
      modelStore.lastUsedModelId = model.id;

      expect(modelStore.lastUsedModel).toEqual(model);
    });
  });

  // Add tests for inferencing and streaming flags
  describe('inferencing and streaming flags', () => {
    it('should set and get inferencing flag', () => {
      modelStore.inferencing = false;
      expect(modelStore.inferencing).toBe(false);

      modelStore.setInferencing(true);
      expect(modelStore.inferencing).toBe(true);
    });

    it('should set and get isStreaming flag', () => {
      modelStore.isStreaming = false;
      expect(modelStore.isStreaming).toBe(false);

      modelStore.setIsStreaming(true);
      expect(modelStore.isStreaming).toBe(true);
    });
  });

  // Add tests for manual context release
  describe('manual context release', () => {
    it('should release context manually', async () => {
      // Set up mock context
      const mockRelease = jest.fn();
      modelStore.context = {
        release: mockRelease,
      } as any;
      modelStore.activeModelId = 'test-id';

      await modelStore.manualReleaseContext();

      expect(mockRelease).toHaveBeenCalled();
      expect(modelStore.context).toBeUndefined();
      expect(modelStore.activeModelId).toBeUndefined();
    });
  });

  // Add tests for HF model handling
  describe('HF model handling', () => {
    it('should download HF model', async () => {
      const hfModel = {
        ...mockHFModel1,
        _id: 'hf-1',
        author: 'test',
        id: 'test/hf-model',
        model_id: 'test/hf-model',
        siblings: [
          {
            rfilename: 'model-01.gguf',
            size: 1000,
            url: 'test-url',
            oid: 'test-oid',
          },
        ],
      };

      const modelFile = hfModel.siblings[0];
      (RNFS.exists as jest.Mock).mockResolvedValue(false);

      await modelStore.downloadHFModel(hfModel as any, modelFile as any, {
        enableVision: true,
      });
      // Wait for checkSpaceAndDownload to complete (it's not awaited in downloadHFModel)
      await new Promise(resolve => setTimeout(resolve, 300));
      expect(downloadManager.startDownload).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test/hf-model/model-01.gguf',
          type: 'hf',
          author: 'test',
          repo: 'hf-model',
        }),
        expect.stringContaining(
          '/path/to/documents/models/hf/test/hf-model/model-01.gguf',
        ),
        'mockPass', // authToken from keychain mock
      );
    });

    it('should handle errors when downloading HF model fails', async () => {
      const hfModel = {
        id: 'test/hf-model',
        siblings: [{rfilename: 'model.gguf'}],
      };

      const modelFile = hfModel.siblings[0];

      // Mock addHFModel to throw an error
      const mockAddHFModel = jest.fn();
      const originalAddHFModel = modelStore.addHFModel;
      modelStore.addHFModel = mockAddHFModel.mockRejectedValue(
        new Error('Mock error'),
      );

      // Mock console.error and Alert.alert
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation();

      await modelStore.downloadHFModel(hfModel as any, modelFile as any, {
        enableVision: true,
      });

      // Check that error is logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to set up HF model download:',
        expect.any(Error),
      );

      // Check that Alert.alert is called with the error message
      expect(alertSpy).toHaveBeenCalledWith(
        uiStore.l10n.errors.downloadSetupFailedTitle,
        t(uiStore.l10n.errors.downloadSetupFailedMessage, {
          message: 'Mock error',
        }),
      );

      // Clean up mocks
      consoleErrorSpy.mockRestore();
      alertSpy.mockRestore();
      modelStore.addHFModel = originalAddHFModel;
    });
  });

  // Add tests for model chat template handling
  describe('model chat template handling', () => {
    it('should update model chat template', () => {
      const model = {
        ...basicModel,
        chatTemplate: {
          ...basicModel.chatTemplate,
          chatTemplate: 'original',
        },
      };

      modelStore.models = [model];

      const newConfig = {chatTemplate: 'updated'};
      modelStore.updateModelChatTemplate(model.id, newConfig as any);

      expect(modelStore.models[0].chatTemplate).toEqual(newConfig);
    });

    it('should reset model chat template to defaults', () => {
      const model = {
        ...basicModel,
        defaultChatTemplate: {
          ...basicModel.defaultChatTemplate,
          chatTemplate: 'default',
        },
        chatTemplate: {
          ...basicModel.chatTemplate,
          chatTemplate: 'custom',
        },
      };

      modelStore.models = [model];

      modelStore.resetModelChatTemplate(model.id);

      expect(modelStore.models[0].chatTemplate).toEqual(
        model.defaultChatTemplate,
      );
    });
  });

  // Add tests for resetting models
  describe('resetting models', () => {
    beforeEach(() => {
      // Set up some models of different origins
      const localModel = {
        id: 'local-model',
        isLocal: true,
        origin: ModelOrigin.LOCAL,
      };

      const hfModel = {
        id: 'hf-model',
        origin: ModelOrigin.HF,
        hfModel: {id: 'test/hf-model'},
      };

      modelStore.models = [localModel, hfModel] as any;
    });

    it('should reset models while preserving local and HF models', async () => {
      // Spy on mergeModelLists
      const mockMergeModelLists = jest.fn();
      const originalMergeModelLists = modelStore.mergeModelLists;
      modelStore.mergeModelLists = mockMergeModelLists;

      await modelStore.resetModels();

      // Check that models were cleared and restored
      expect(mockMergeModelLists).toHaveBeenCalled();

      // Should still have the local and HF models
      expect(modelStore.models.some(m => m.id === 'local-model')).toBe(true);
      expect(modelStore.models.some(m => m.id === 'hf-model')).toBe(true);
      modelStore.mergeModelLists = originalMergeModelLists;
    });
  });

  // Add tests for use metal and auto release settings
  describe('settings', () => {
    it('should update GPU acceleration setting', () => {
      modelStore.contextInitParams = {
        ...modelStore.contextInitParams,
        no_gpu_devices: true,
      };

      modelStore.setNoGpuDevices(false);

      expect(modelStore.contextInitParams.no_gpu_devices).toBe(false);
    });

    it('should update GPU acceleration setting via setNoGpuDevices', () => {
      modelStore.contextInitParams = {
        ...modelStore.contextInitParams,
        no_gpu_devices: false,
      };

      modelStore.setNoGpuDevices(true);

      expect(modelStore.contextInitParams.no_gpu_devices).toBe(true);
    });

    it('should update useAutoRelease setting', () => {
      modelStore.useAutoRelease = true;

      modelStore.updateUseAutoRelease(false);

      expect(modelStore.useAutoRelease).toBe(false);
    });
  });

  // Add tests for isModelAvailable
  describe('isModelAvailable', () => {
    beforeEach(() => {
      // Set up some available models
      modelStore.models = [
        {id: 'model1', isDownloaded: true},
        {id: 'model2', isDownloaded: true},
      ] as any;
    });

    it('should return false if modelId is undefined', () => {
      expect(modelStore.isModelAvailable(undefined)).toBe(false);
    });

    it('should return true if model exists in available models', () => {
      // Available models are those that are downloaded
      expect(modelStore.isModelAvailable('model1')).toBe(true);
    });

    it('should return false if model does not exist in available models', () => {
      expect(modelStore.isModelAvailable('non-existent-model')).toBe(false);
    });
  });

  // Add tests for configuration setters
  describe('configuration setters', () => {
    it('should set n_threads', () => {
      modelStore.setNThreads(8);
      expect(modelStore.contextInitParams.n_threads).toBe(8);
    });

    it('should set flash attention and reset cache types when disabled', () => {
      // Enable flash attention first, and change cache types
      modelStore.setFlashAttnType('on' as any);
      expect(modelStore.contextInitParams.flash_attn_type).toBe('on');
      modelStore.setCacheTypeK('q8_0' as any);
      modelStore.setCacheTypeV('q8_0' as any);
      expect(modelStore.contextInitParams.cache_type_k).toBe('q8_0');
      expect(modelStore.contextInitParams.cache_type_v).toBe('q8_0');

      // Disable flash attention - should reset cache types
      modelStore.setFlashAttnType('off' as any);
      expect(modelStore.contextInitParams.flash_attn_type).toBe('off');
      expect(modelStore.contextInitParams.cache_type_k).toBe('f16');
      expect(modelStore.contextInitParams.cache_type_v).toBe('f16');
    });

    it('should set cache type K only when flash attention is enabled', () => {
      // Disable flash attention
      modelStore.setFlashAttnType('off' as any);
      modelStore.setCacheTypeK('q8_0' as any);
      expect(modelStore.contextInitParams.cache_type_k).toBe('f16'); // Should not change

      // Enable flash attention
      modelStore.setFlashAttnType('on' as any);
      modelStore.setCacheTypeK('q8_0' as any);
      expect(modelStore.contextInitParams.cache_type_k).toBe('q8_0'); // Should change
    });

    it('should set cache type V only when flash attention is enabled', () => {
      // Disable flash attention
      modelStore.setFlashAttnType('off' as any);
      modelStore.setCacheTypeV('q8_0' as any);
      expect(modelStore.contextInitParams.cache_type_v).toBe('f16'); // Should not change

      // Enable flash attention
      modelStore.setFlashAttnType('on' as any);
      modelStore.setCacheTypeV('q8_0' as any);
      expect(modelStore.contextInitParams.cache_type_v).toBe('q8_0'); // Should change
    });

    it('should set n_batch', () => {
      modelStore.setNBatch(256);
      expect(modelStore.contextInitParams.n_batch).toBe(256);
    });

    it('should set n_ubatch', () => {
      modelStore.setNUBatch(128);
      expect(modelStore.contextInitParams.n_ubatch).toBe(128);
    });

    it('should set n_ctx', () => {
      modelStore.setNContext(2048);
      expect(modelStore.contextInitParams.n_ctx).toBe(2048);
    });

    it('should get effective batch values respecting constraints', () => {
      modelStore.setNContext(1024);
      modelStore.setNBatch(2048); // Larger than context
      modelStore.setNUBatch(1024); // Larger than effective batch

      const effective = modelStore.getEffectiveBatchValues();
      expect(effective.n_ctx).toBe(1024);
      expect(effective.n_batch).toBe(1024); // Clamped to context
      expect(effective.n_ubatch).toBe(1024); // Clamped to effective batch
    });

    it('should maintain backward compatibility with getEffectiveValues', () => {
      modelStore.setNContext(1024);
      modelStore.setNBatch(2048);
      modelStore.setNUBatch(1024);

      // Legacy method should still work
      const effective = modelStore.getEffectiveValues();
      expect(effective.n_ctx).toBe(1024);
      expect(effective.n_batch).toBe(1024);
      expect(effective.n_ubatch).toBe(1024);
    });

    it('should get comprehensive effective context init params', async () => {
      modelStore.setNContext(2048);
      modelStore.setNBatch(1024);
      modelStore.setNUBatch(512);
      modelStore.setNThreads(8);
      modelStore.setFlashAttnType('on' as any);
      modelStore.contextInitParams = {
        ...modelStore.contextInitParams,
        no_gpu_devices: false,
      };
      modelStore.setNGPULayers(32);

      const effective = await modelStore.getEffectiveContextInitParams();

      expect(effective.n_ctx).toBe(2048);
      expect(effective.n_batch).toBe(1024);
      expect(effective.n_ubatch).toBe(512);
      expect(effective.n_threads).toBe(8);
      expect(effective.flash_attn_type).toBe('on');
      expect(effective.n_gpu_layers).toBe(32);
      expect(effective.use_mlock).toBe(false);
      expect(effective.use_mmap).toBe(true); // Should be boolean for llama.rn compatibility
    });

    it('should maintain backward compatibility with getEffectiveInitSettings', async () => {
      modelStore.setNContext(2048);
      modelStore.setNBatch(1024);
      modelStore.setNUBatch(512);

      const effective = await modelStore.getEffectiveInitSettings();

      expect(effective.n_ctx).toBe(2048);
      expect(effective.n_batch).toBe(1024);
      expect(effective.n_ubatch).toBe(512);
    });

    it('should set n_gpu_layers', () => {
      modelStore.setNGPULayers(25);
      expect(modelStore.contextInitParams.n_gpu_layers).toBe(25);
    });

    it('should set image_max_tokens', () => {
      modelStore.setImageMaxTokens(768);
      expect(modelStore.contextInitParams.image_max_tokens).toBe(768);
    });
  });

  describe('image_max_tokens clamping', () => {
    it('should clamp image_max_tokens to n_ctx when computing effective value', () => {
      // Set image_max_tokens higher than n_ctx
      runInAction(() => {
        modelStore.contextInitParams.n_ctx = 2048;
        modelStore.contextInitParams.image_max_tokens = 3000;
      });

      // The clamping logic is: Math.min(image_max_tokens, n_ctx)
      // We test this by checking what would be passed to initMultimodal
      const effectiveValue = Math.min(
        modelStore.contextInitParams.image_max_tokens ?? 512,
        modelStore.contextInitParams.n_ctx,
      );

      expect(effectiveValue).toBe(2048); // Clamped to n_ctx
      expect(modelStore.contextInitParams.image_max_tokens).toBe(3000); // User value unchanged
    });

    it('should not clamp image_max_tokens when within n_ctx', () => {
      // Set image_max_tokens lower than n_ctx
      runInAction(() => {
        modelStore.contextInitParams.n_ctx = 2048;
        modelStore.contextInitParams.image_max_tokens = 512;
      });

      // The clamping logic is: Math.min(image_max_tokens, n_ctx)
      const effectiveValue = Math.min(
        modelStore.contextInitParams.image_max_tokens ?? 512,
        modelStore.contextInitParams.n_ctx,
      );

      expect(effectiveValue).toBe(512); // Unclamped - within n_ctx
      expect(modelStore.contextInitParams.image_max_tokens).toBe(512); // User value unchanged
    });
  });

  // Add tests for auto-release functionality
  describe('auto-release functionality', () => {
    beforeEach(() => {
      modelStore.useAutoRelease = true;
      // Reset auto-release state by enabling/disabling known reasons
      modelStore.enableAutoRelease('test-cleanup');
    });

    it('should disable auto-release with reason', () => {
      modelStore.disableAutoRelease('test-reason');
      expect(modelStore.isAutoReleaseEnabled).toBe(false);
    });

    it('should enable auto-release by removing reason', () => {
      modelStore.disableAutoRelease('test-reason');
      expect(modelStore.isAutoReleaseEnabled).toBe(false);

      modelStore.enableAutoRelease('test-reason');
      expect(modelStore.isAutoReleaseEnabled).toBe(true);
    });

    it('should handle multiple disable reasons', () => {
      modelStore.disableAutoRelease('reason1');
      modelStore.disableAutoRelease('reason2');
      expect(modelStore.isAutoReleaseEnabled).toBe(false);

      modelStore.enableAutoRelease('reason1');
      expect(modelStore.isAutoReleaseEnabled).toBe(false); // Still disabled by reason2

      modelStore.enableAutoRelease('reason2');
      expect(modelStore.isAutoReleaseEnabled).toBe(true); // Now enabled
    });

    it('should be disabled when useAutoRelease is false', () => {
      modelStore.useAutoRelease = false;
      expect(modelStore.isAutoReleaseEnabled).toBe(false);
    });
  });

  // Add tests for multimodal functionality
  describe('multimodal functionality', () => {
    beforeEach(() => {
      modelStore.models = [];
      modelStore.context = undefined;
      modelStore.activeModelId = undefined;
      modelStore.isMultimodalActive = false;
    });

    it('should return true for isMultimodalEnabled when cached flag is true', async () => {
      modelStore.isMultimodalActive = true;
      const result = await modelStore.isMultimodalEnabled();
      expect(result).toBe(true);
    });

    it('should return false for isMultimodalEnabled when no context', async () => {
      modelStore.context = undefined;
      const result = await modelStore.isMultimodalEnabled();
      expect(result).toBe(false);
    });

    it('should check context and update cached flag for isMultimodalEnabled', async () => {
      const mockContext = {
        isMultimodalEnabled: jest.fn().mockResolvedValue(true),
      };
      modelStore.context = mockContext as any;

      const result = await modelStore.isMultimodalEnabled();
      expect(result).toBe(true);
      expect(mockContext.isMultimodalEnabled).toHaveBeenCalled();
      expect(modelStore.isMultimodalActive).toBe(true);
    });

    it('should handle error in isMultimodalEnabled', async () => {
      const mockContext = {
        isMultimodalEnabled: jest
          .fn()
          .mockRejectedValue(new Error('Test error')),
      };
      modelStore.context = mockContext as any;

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await modelStore.isMultimodalEnabled();
      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error checking multimodal capability:',
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });

    it('should get compatible projection models from explicit list', () => {
      const llmModel = {
        id: 'test-llm',
        supportsMultimodal: true,
        compatibleProjectionModels: ['proj1', 'proj2'],
      };
      const projModel1 = {
        id: 'proj1',
        modelType: ModelType.PROJECTION,
      };
      const projModel2 = {
        id: 'proj2',
        modelType: ModelType.PROJECTION,
      };

      modelStore.models = [llmModel, projModel1, projModel2] as any;

      const compatible = modelStore.getCompatibleProjectionModels('test-llm');
      expect(compatible).toHaveLength(2);
      expect(compatible.map(m => m.id)).toEqual(['proj1', 'proj2']);
    });

    it('should get compatible projection models from same repository', () => {
      const llmModel = {
        id: 'author/repo/model',
        supportsMultimodal: true,
      };
      const projModel1 = {
        id: 'author/repo/proj1',
        modelType: ModelType.PROJECTION,
      };
      const projModel2 = {
        id: 'other/repo/proj2',
        modelType: ModelType.PROJECTION,
      };

      modelStore.models = [llmModel, projModel1, projModel2] as any;

      const compatible =
        modelStore.getCompatibleProjectionModels('author/repo/model');
      expect(compatible).toHaveLength(1);
      expect(compatible[0].id).toBe('author/repo/proj1');
    });

    it('should return empty array for non-multimodal model', () => {
      const llmModel = {
        id: 'test-llm',
        supportsMultimodal: false,
      };

      modelStore.models = [llmModel] as any;

      const compatible = modelStore.getCompatibleProjectionModels('test-llm');
      expect(compatible).toHaveLength(0);
    });

    it('should set default projection model', () => {
      const llmModel = {
        id: 'test-llm',
        supportsMultimodal: true,
        defaultProjectionModel: undefined,
      };

      modelStore.models = [llmModel] as any;

      modelStore.setDefaultProjectionModel('test-llm', 'proj1');

      // Check that the model in the store was updated
      const updatedModel = modelStore.models.find(m => m.id === 'test-llm');
      expect(updatedModel?.defaultProjectionModel).toBe('proj1');
    });

    it('should get default projection model', () => {
      const llmModel = {
        id: 'test-llm',
        supportsMultimodal: true,
        defaultProjectionModel: 'proj1',
      };
      const projModel = {
        id: 'proj1',
        modelType: ModelType.PROJECTION,
      };

      modelStore.models = [llmModel, projModel] as any;

      const defaultProj = modelStore.getDefaultProjectionModel('test-llm');
      expect(defaultProj?.id).toBe('proj1');
    });

    it('should return undefined for default projection model when not set', () => {
      const llmModel = {
        id: 'test-llm',
        supportsMultimodal: true,
      };

      modelStore.models = [llmModel] as any;

      const defaultProj = modelStore.getDefaultProjectionModel('test-llm');
      expect(defaultProj).toBeUndefined();
    });
  });

  // Add tests for model path handling
  describe('model path handling', () => {
    beforeEach(() => {
      // Reset RNFS mock state
      (RNFS as any).__resetMockState?.();
    });

    it('should get full path for local model', async () => {
      const localModel = {
        isLocal: true,
        origin: ModelOrigin.LOCAL,
        fullPath: '/path/to/local/model.gguf',
      };

      const path = await modelStore.getModelFullPath(localModel as any);
      expect(path).toBe('/path/to/local/model.gguf');
    });

    it('should throw error for local model without fullPath', async () => {
      const localModel = {
        isLocal: true,
        origin: ModelOrigin.LOCAL,
        fullPath: undefined,
      };

      await expect(
        modelStore.getModelFullPath(localModel as any),
      ).rejects.toThrow('Full path is undefined for local model');
    });

    it('should throw error for model without filename', async () => {
      const model = {
        origin: ModelOrigin.PRESET,
        filename: undefined,
      };

      await expect(modelStore.getModelFullPath(model as any)).rejects.toThrow(
        'Model filename is undefined',
      );
    });

    it('should get new path for preset model', async () => {
      const presetModel = {
        origin: ModelOrigin.PRESET,
        filename: 'model.gguf',
        author: 'test-author',
      };

      // Mock RNFS.exists to return false for both old paths
      (RNFS.exists as jest.Mock).mockResolvedValue(false);

      const path = await modelStore.getModelFullPath(presetModel as any);
      // Without repo field, should use 'unknown' as fallback
      expect(path).toContain('/models/preset/test-author/unknown/model.gguf');
    });

    it('should get old path for preset model if it exists', async () => {
      const presetModel = {
        origin: ModelOrigin.PRESET,
        filename: 'model.gguf',
        author: 'test-author',
      };

      // Mock RNFS.exists to return true for old path
      (RNFS.exists as jest.Mock).mockResolvedValue(true);

      const path = await modelStore.getModelFullPath(presetModel as any);
      expect(path).toContain('/model.gguf');
      expect(path).not.toContain('/models/preset/');
    });

    it('should get path for HF model', async () => {
      const hfModel = {
        origin: ModelOrigin.HF,
        filename: 'model.gguf',
        author: 'test-author',
      };

      const path = await modelStore.getModelFullPath(hfModel as any);
      expect(path).toContain('/models/hf/test-author/model.gguf');
    });

    it('should construct new path with repo for HF model', async () => {
      const hfModel = {
        origin: ModelOrigin.HF,
        filename: 'model.gguf',
        author: 'test-author',
        repo: 'test-repo',
      };

      // Mock old path doesn't exist
      (RNFS.exists as jest.Mock).mockResolvedValue(false);

      const path = await modelStore.getModelFullPath(hfModel as any);
      expect(path).toContain('/models/hf/test-author/test-repo/model.gguf');
    });

    it('should use old path if file exists there for HF model (backwards compatibility)', async () => {
      const hfModel = {
        origin: ModelOrigin.HF,
        filename: 'model.gguf',
        author: 'test-author',
        repo: 'test-repo',
      };

      // Mock old path exists
      (RNFS.exists as jest.Mock).mockResolvedValue(true);

      const path = await modelStore.getModelFullPath(hfModel as any);
      expect(path).toContain('/models/hf/test-author/model.gguf');
      expect(path).not.toContain('/test-repo/');
    });

    it('should fallback to unknown if repo field missing for HF model', async () => {
      const hfModel = {
        origin: ModelOrigin.HF,
        filename: 'model.gguf',
        author: 'test-author',
        // repo field intentionally missing
      };

      // Mock old path doesn't exist
      (RNFS.exists as jest.Mock).mockResolvedValue(false);

      const path = await modelStore.getModelFullPath(hfModel as any);
      expect(path).toContain('/models/hf/test-author/unknown/model.gguf');
    });

    it('should handle error when checking old path for HF model', async () => {
      const hfModel = {
        origin: ModelOrigin.HF,
        filename: 'model.gguf',
        author: 'test-author',
        repo: 'test-repo',
      };

      // Mock RNFS.exists to throw error
      (RNFS.exists as jest.Mock).mockRejectedValue(
        new Error('File system error'),
      );

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      const path = await modelStore.getModelFullPath(hfModel as any);
      // Should still return new path despite error
      expect(path).toContain('/models/hf/test-author/test-repo/model.gguf');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Error checking old HF model path:',
        expect.any(Error),
      );

      consoleLogSpy.mockRestore();
    });

    it('should handle error when checking old path for preset model', async () => {
      const presetModel = {
        origin: ModelOrigin.PRESET,
        filename: 'model.gguf',
        author: 'test-author',
      };

      // Mock RNFS.exists to throw error for very old path, then throw for old path
      (RNFS.exists as jest.Mock)
        .mockRejectedValueOnce(new Error('File system error')) // very old path
        .mockRejectedValueOnce(new Error('File system error')); // old path

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      const path = await modelStore.getModelFullPath(presetModel as any);
      // Without repo field, should use 'unknown' as fallback
      expect(path).toContain('/models/preset/test-author/unknown/model.gguf');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Error checking very old preset path:',
        expect.any(Error),
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Error checking old preset path:',
        expect.any(Error),
      );

      consoleLogSpy.mockRestore();
    });
  });

  describe('getModelFullPath - PRESET models with repo field', () => {
    it('should construct new path with repo for PRESET model', async () => {
      const presetModel = {
        origin: ModelOrigin.PRESET,
        filename: 'model.gguf',
        author: 'test-author',
        repo: 'test-repo',
      };

      // Mock both old paths don't exist
      (RNFS.exists as jest.Mock).mockResolvedValue(false);

      const path = await modelStore.getModelFullPath(presetModel as any);
      expect(path).toContain('/models/preset/test-author/test-repo/model.gguf');
    });

    it('should use very old path if file exists there for PRESET model (backwards compatibility)', async () => {
      const presetModel = {
        origin: ModelOrigin.PRESET,
        filename: 'model.gguf',
        author: 'test-author',
        repo: 'test-repo',
      };

      // Mock very old path exists (first call returns true)
      (RNFS.exists as jest.Mock).mockResolvedValue(true);

      const path = await modelStore.getModelFullPath(presetModel as any);
      expect(path).toContain('/model.gguf');
      expect(path).not.toContain('/models/preset/');
      expect(path).not.toContain('/test-repo/');
    });

    it('should use old path if very old path does not exist but old path exists for PRESET model', async () => {
      const presetModel = {
        origin: ModelOrigin.PRESET,
        filename: 'model.gguf',
        author: 'test-author',
        repo: 'test-repo',
      };

      // Mock very old path doesn't exist (first call), but old path exists (second call)
      (RNFS.exists as jest.Mock)
        .mockResolvedValueOnce(false) // very old path
        .mockResolvedValueOnce(true); // old path

      const path = await modelStore.getModelFullPath(presetModel as any);
      expect(path).toContain('/models/preset/test-author/model.gguf');
      expect(path).not.toContain('/test-repo/');
    });

    it('should fallback to unknown if repo field missing for PRESET model', async () => {
      const presetModel = {
        origin: ModelOrigin.PRESET,
        filename: 'model.gguf',
        author: 'test-author',
        // repo field intentionally missing
      };

      // Mock both old paths don't exist
      (RNFS.exists as jest.Mock).mockResolvedValue(false);

      const path = await modelStore.getModelFullPath(presetModel as any);
      expect(path).toContain('/models/preset/test-author/unknown/model.gguf');
    });

    it('should handle error when checking very old path for PRESET model', async () => {
      const presetModel = {
        origin: ModelOrigin.PRESET,
        filename: 'model.gguf',
        author: 'test-author',
        repo: 'test-repo',
      };

      // Mock RNFS.exists to throw error for very old path, then return false for old path
      (RNFS.exists as jest.Mock)
        .mockRejectedValueOnce(new Error('File system error')) // very old path
        .mockResolvedValueOnce(false); // old path

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      const path = await modelStore.getModelFullPath(presetModel as any);
      // Should still check old path and eventually return new path
      expect(path).toContain('/models/preset/test-author/test-repo/model.gguf');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Error checking very old preset path:',
        expect.any(Error),
      );

      consoleLogSpy.mockRestore();
    });

    it('should handle error when checking old path for PRESET model', async () => {
      const presetModel = {
        origin: ModelOrigin.PRESET,
        filename: 'model.gguf',
        author: 'test-author',
        repo: 'test-repo',
      };

      // Mock very old path doesn't exist, old path throws error
      (RNFS.exists as jest.Mock)
        .mockResolvedValueOnce(false) // very old path
        .mockRejectedValueOnce(new Error('File system error')); // old path

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      const path = await modelStore.getModelFullPath(presetModel as any);
      // Should still return new path despite error
      expect(path).toContain('/models/preset/test-author/test-repo/model.gguf');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Error checking old preset path:',
        expect.any(Error),
      );

      consoleLogSpy.mockRestore();
    });
  });

  describe('getModelFullPath - HF models with repo inference', () => {
    it('should infer repo from model.id when repo field is missing', async () => {
      const hfModel = {
        origin: ModelOrigin.HF,
        id: 'bartowski/gemma-2-2b-it-GGUF/model.gguf',
        filename: 'model.gguf',
        author: 'bartowski',
        // repo field intentionally missing (simulates existing model before update)
      };

      // Mock both old paths don't exist
      (RNFS.exists as jest.Mock).mockResolvedValue(false);

      const path = await modelStore.getModelFullPath(hfModel as any);
      // Should infer repo from model.id
      expect(path).toContain(
        '/models/hf/bartowski/gemma-2-2b-it-GGUF/model.gguf',
      );
    });

    it('should use explicit repo field over inferred value', async () => {
      const hfModel = {
        origin: ModelOrigin.HF,
        id: 'bartowski/gemma-2-2b-it-GGUF/model.gguf',
        filename: 'model.gguf',
        author: 'bartowski',
        repo: 'explicit-repo-name',
      };

      // Mock both old paths don't exist
      (RNFS.exists as jest.Mock).mockResolvedValue(false);

      const path = await modelStore.getModelFullPath(hfModel as any);
      // Should use explicit repo field
      expect(path).toContain(
        '/models/hf/bartowski/explicit-repo-name/model.gguf',
      );
    });

    it('should fallback to unknown if repo missing and cannot infer', async () => {
      const hfModel = {
        origin: ModelOrigin.HF,
        id: 'invalid-id', // Malformed ID - cannot infer repo
        filename: 'model.gguf',
        author: 'bartowski',
        // repo field intentionally missing
      };

      // Mock both old paths don't exist
      (RNFS.exists as jest.Mock).mockResolvedValue(false);

      const path = await modelStore.getModelFullPath(hfModel as any);
      // Should fallback to 'unknown'
      expect(path).toContain('/models/hf/bartowski/unknown/model.gguf');
    });
  });

  describe('mergeModelLists - repo inference for HF models', () => {
    it('should infer and set repo field for existing HF models', async () => {
      // Set up store with existing HF model (no repo field)
      modelStore.models = [
        {
          id: 'test-author/test-repo/model.gguf',
          origin: ModelOrigin.HF,
          author: 'test-author',
          filename: 'model.gguf',
          // repo field missing (simulates existing model before update)
          isDownloaded: true,
          hfModel: {id: 'test-author/test-repo'} as any,
          chatTemplate: {},
          stopWords: [],
          defaultChatTemplate: {},
          defaultStopWords: [],
        } as any,
      ];

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      // Run mergeModelLists
      modelStore.mergeModelLists();

      // Wait for async initializeDownloadStatus to complete
      await new Promise(resolve => setTimeout(resolve, 0));

      // Check repo was inferred and set
      expect(modelStore.models[0].repo).toBe('test-repo');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ModelStore] Inferred repo "test-repo"'),
      );

      consoleLogSpy.mockRestore();
    });

    it('should not override existing repo field', async () => {
      // Set up store with HF model that already has repo field
      modelStore.models = [
        {
          id: 'test-author/inferred-repo/model.gguf',
          origin: ModelOrigin.HF,
          author: 'test-author',
          filename: 'model.gguf',
          repo: 'existing-repo', // Already has repo field
          isDownloaded: true,
          hfModel: {id: 'test-author/inferred-repo'} as any,
          chatTemplate: {},
          stopWords: [],
          defaultChatTemplate: {},
          defaultStopWords: [],
        } as any,
      ];

      modelStore.mergeModelLists();

      // Wait for async initializeDownloadStatus to complete
      await new Promise(resolve => setTimeout(resolve, 0));

      // Should keep existing repo field
      expect(modelStore.models[0].repo).toBe('existing-repo');
    });

    it('should handle HF models with malformed IDs gracefully', async () => {
      modelStore.models = [
        {
          id: 'malformed-id',
          origin: ModelOrigin.HF,
          author: 'test-author',
          filename: 'model.gguf',
          // repo field missing, ID is malformed
          isDownloaded: true,
          hfModel: {id: 'malformed'} as any,
          chatTemplate: {},
          stopWords: [],
          defaultChatTemplate: {},
          defaultStopWords: [],
        } as any,
      ];

      // Should not throw error
      expect(() => modelStore.mergeModelLists()).not.toThrow();

      // Wait for async initializeDownloadStatus to complete
      await new Promise(resolve => setTimeout(resolve, 0));

      // Repo should remain undefined
      expect(modelStore.models[0].repo).toBeUndefined();
    });

    it('should not affect PRESET models', async () => {
      modelStore.models = [
        {
          id: 'preset-model',
          origin: ModelOrigin.PRESET,
          author: 'preset-author',
          filename: 'model.gguf',
          // repo field missing
          isDownloaded: true,
          chatTemplate: {},
          stopWords: [],
          defaultChatTemplate: {},
          defaultStopWords: [],
        } as any,
      ];

      modelStore.mergeModelLists();

      // Wait for async initializeDownloadStatus to complete
      await new Promise(resolve => setTimeout(resolve, 0));

      // Preset models should not be affected by HF repo inference
      expect(modelStore.models[0].repo).toBeUndefined();
    });
  });

  // Add tests for download error handling
  describe('download error handling', () => {
    beforeEach(() => {
      modelStore.downloadError = null;
      (downloadManager.startDownload as jest.Mock).mockResolvedValue(undefined);
    });

    it('should clear download error', () => {
      modelStore.downloadError = {
        message: 'Test error',
        type: 'download',
        source: 'huggingface',
        metadata: {modelId: 'test-model'},
      } as any;

      modelStore.clearDownloadError();
      expect(modelStore.downloadError).toBeNull();
    });

    it('should retry download when error has modelId', () => {
      const testModel = {
        ...presetModelFixture,
        id: 'test-model-0-1-0',
        isDownloaded: false,
      };
      modelStore.models = [testModel] as any;
      modelStore.downloadError = {
        message: 'Test error',
        type: 'download',
        source: 'huggingface',
        metadata: {modelId: 'test-model-0-1-0'},
      } as any;

      (RNFS.exists as jest.Mock).mockResolvedValue(false);
      const mockCheckSpaceAndDownload = jest.fn();
      const originalCheckSpaceAndDownload = modelStore.checkSpaceAndDownload;
      modelStore.checkSpaceAndDownload = mockCheckSpaceAndDownload;

      modelStore.retryDownload();

      expect(modelStore.downloadError).toBeNull();
      expect(mockCheckSpaceAndDownload).toHaveBeenCalledWith(
        'test-model-0-1-0',
      );
      modelStore.checkSpaceAndDownload = originalCheckSpaceAndDownload;
    });

    it('should not retry download when error has no modelId', () => {
      modelStore.downloadError = {
        message: 'Test error',
        type: 'download',
        source: 'huggingface',
        metadata: {},
      } as any;

      const mockCheckSpaceAndDownload = jest.fn();
      const originalCheckSpaceAndDownload = modelStore.checkSpaceAndDownload;
      modelStore.checkSpaceAndDownload = mockCheckSpaceAndDownload;

      modelStore.retryDownload();

      expect(modelStore.downloadError).toBeNull();
      expect(mockCheckSpaceAndDownload).not.toHaveBeenCalled();
      modelStore.checkSpaceAndDownload = originalCheckSpaceAndDownload;
    });

    it('should not retry download when model not found', () => {
      modelStore.models = [];
      modelStore.downloadError = {
        message: 'Test error',
        type: 'download',
        source: 'huggingface',
        metadata: {modelId: 'non-existent-model'},
      } as any;

      const mockCheckSpaceAndDownload = jest.fn();
      const originalCheckSpaceAndDownload = modelStore.checkSpaceAndDownload;
      modelStore.checkSpaceAndDownload = mockCheckSpaceAndDownload;

      modelStore.retryDownload();

      expect(modelStore.downloadError).toBeNull();
      expect(mockCheckSpaceAndDownload).not.toHaveBeenCalled();
      modelStore.checkSpaceAndDownload = originalCheckSpaceAndDownload;
    });
  });

  // Add tests for startImageCompletion
  describe('startImageCompletion', () => {
    beforeEach(() => {
      modelStore.context = undefined;
      modelStore.inferencing = false;
      modelStore.isStreaming = false;
    });

    it('should throw error when no context available', async () => {
      modelStore.context = undefined;

      await expect(
        modelStore.startImageCompletion({
          prompt: 'Test prompt',
          image_path: '/path/to/image.jpg',
        }),
      ).rejects.toThrow('No model context available');
    });

    it('should throw error when multimodal is not enabled', async () => {
      const mockContext = {
        isMultimodalEnabled: jest.fn().mockResolvedValue(false),
      };
      modelStore.context = mockContext as any;

      await expect(
        modelStore.startImageCompletion({
          prompt: 'Test prompt',
          image_path: '/path/to/image.jpg',
        }),
      ).rejects.toThrow('Multimodal is not enabled for this model');
    });

    it('should call onError when no images provided', async () => {
      const mockContext = {
        isMultimodalEnabled: jest.fn().mockResolvedValue(true),
      };
      modelStore.context = mockContext as any;

      // Mock the isMultimodalEnabled method on the store to return true
      const originalIsMultimodalEnabled = modelStore.isMultimodalEnabled;
      modelStore.isMultimodalEnabled = jest.fn().mockResolvedValue(true);

      const onError = jest.fn();

      try {
        await modelStore.startImageCompletion({
          prompt: 'Test prompt',
          onError,
        });

        expect(onError).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'No images provided for multimodal completion',
          }),
        );
      } finally {
        // Restore original method
        modelStore.isMultimodalEnabled = originalIsMultimodalEnabled;
      }
    });

    it('should handle single image completion successfully', async () => {
      const mockContext = {
        isMultimodalEnabled: jest.fn().mockResolvedValue(true),
        completion: jest.fn().mockResolvedValue({text: 'Response text'}),
      };
      modelStore.context = mockContext as any;

      const onToken = jest.fn();
      const onComplete = jest.fn();

      await modelStore.startImageCompletion({
        prompt: 'Test prompt',
        image_path: '/path/to/image.jpg',
        onToken,
        onComplete,
      });

      expect(mockContext.completion).toHaveBeenCalled();
      expect(onComplete).toHaveBeenCalledWith('Response text');
      expect(modelStore.inferencing).toBe(false);
      expect(modelStore.isStreaming).toBe(false);
    });

    it('should handle multiple images completion successfully', async () => {
      const mockContext = {
        isMultimodalEnabled: jest.fn().mockResolvedValue(true),
        completion: jest.fn().mockResolvedValue({text: 'Response text'}),
      };
      modelStore.context = mockContext as any;

      const onToken = jest.fn();
      const onComplete = jest.fn();

      await modelStore.startImageCompletion({
        prompt: 'Test prompt',
        image_paths: ['/path/to/image1.jpg', '/path/to/image2.jpg'],
        onToken,
        onComplete,
      });

      expect(mockContext.completion).toHaveBeenCalled();
      expect(onComplete).toHaveBeenCalledWith('Response text');
    });

    it('should handle completion error', async () => {
      const mockContext = {
        isMultimodalEnabled: jest.fn().mockResolvedValue(true),
        completion: jest.fn().mockRejectedValue(new Error('Completion error')),
      };
      modelStore.context = mockContext as any;

      const onError = jest.fn();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await modelStore.startImageCompletion({
        prompt: 'Test prompt',
        image_path: '/path/to/image.jpg',
        onError,
      });

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error in multi-image completion:',
        expect.any(Error),
      );
      expect(modelStore.inferencing).toBe(false);
      expect(modelStore.isStreaming).toBe(false);

      consoleErrorSpy.mockRestore();
    });

    it('should process file:// paths correctly for iOS', async () => {
      // Mock Platform.OS to be 'ios'
      const originalPlatform = require('react-native').Platform.OS;
      require('react-native').Platform.OS = 'ios';

      const mockContext = {
        isMultimodalEnabled: jest.fn().mockResolvedValue(true),
        completion: jest.fn().mockResolvedValue({text: 'Response text'}),
      };
      modelStore.context = mockContext as any;

      await modelStore.startImageCompletion({
        prompt: 'Test prompt',
        image_path: 'file:///path/to/image.jpg',
      });

      const completionCall = mockContext.completion.mock.calls[0];
      const params = completionCall[0];
      const userMessage = params.messages[0];
      const imageContent = userMessage.content[1];

      expect(imageContent.image_url.url).toBe('/path/to/image.jpg'); // file:// removed

      // Restore original platform
      require('react-native').Platform.OS = originalPlatform;
    });

    it('should include system message when provided', async () => {
      const mockContext = {
        isMultimodalEnabled: jest.fn().mockResolvedValue(true),
        completion: jest.fn().mockResolvedValue({text: 'Response text'}),
      };
      modelStore.context = mockContext as any;

      await modelStore.startImageCompletion({
        prompt: 'Test prompt',
        image_path: '/path/to/image.jpg',
        systemMessage: 'You are a helpful assistant.',
      });

      const completionCall = mockContext.completion.mock.calls[0];
      const params = completionCall[0];

      expect(params.messages).toHaveLength(2);
      expect(params.messages[0].role).toBe('system');
      expect(params.messages[0].content).toBe('You are a helpful assistant.');
    });
  });

  // Add tests for updateModelHash
  describe('updateModelHash', () => {
    beforeEach(() => {
      // Mock RNFS.hash function
      (RNFS as any).hash = jest.fn().mockResolvedValue('mock-hash-value');
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should not update hash for non-downloaded model', async () => {
      const model = {
        id: 'test-model',
        isDownloaded: false,
        hash: undefined,
      };
      modelStore.models = [model] as any;

      await modelStore.updateModelHash('test-model');

      expect(model.hash).toBeUndefined();
    });

    it('should not update hash for model being downloaded', async () => {
      const model = {
        id: 'test-model',
        isDownloaded: true,
        hash: undefined,
      };
      modelStore.models = [model] as any;

      // Mock downloadManager.isDownloading to return true
      (downloadManager.isDownloading as jest.Mock).mockReturnValue(true);

      await modelStore.updateModelHash('test-model');

      expect(model.hash).toBeUndefined();
    });

    it('should not update hash if already set and not forced', async () => {
      const model = {
        id: 'test-model',
        isDownloaded: true,
        hash: 'existing-hash',
      };
      modelStore.models = [model] as any;

      // Mock downloadManager.isDownloading to return false
      (downloadManager.isDownloading as jest.Mock).mockReturnValue(false);

      await modelStore.updateModelHash('test-model', false);

      expect(model.hash).toBe('existing-hash');
    });

    it('should update hash when forced', async () => {
      const model = {
        id: 'test-model',
        isDownloaded: true,
        hash: 'existing-hash',
        filename: 'model.gguf',
      };
      modelStore.models = [model] as any;

      // Mock downloadManager.isDownloading to return false
      (downloadManager.isDownloading as jest.Mock).mockReturnValue(false);

      await modelStore.updateModelHash('test-model', true);

      expect(RNFS.hash).toHaveBeenCalledWith(
        '/path/to/documents/model.gguf',
        'sha256',
      );

      // Check that the model in the store was updated
      const updatedModel = modelStore.models.find(m => m.id === 'test-model');
      expect(updatedModel?.hash).toBe('mock-hash-value');
    });
  });

  // Add tests for fetchAndUpdateModelFileDetails
  describe('fetchAndUpdateModelFileDetails', () => {
    const {fetchModelFilesDetails} = require('../../api/hf');

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should return early if model has no hfModel.id', async () => {
      const model = {
        id: 'test-model',
        hfModel: undefined,
      };

      await modelStore.fetchAndUpdateModelFileDetails(model as any);

      // Should not throw or call any APIs
      expect(fetchModelFilesDetails).not.toHaveBeenCalled();
    });

    it('should update model file details when matching file found', async () => {
      const model = {
        id: 'test-model',
        hfModel: {id: 'test/model'},
        hfModelFile: {rfilename: 'model.gguf', lfs: undefined},
      };

      const mockFileDetails = [
        {
          path: 'model.gguf',
          lfs: {oid: 'test-oid', size: 1000},
        },
        {
          path: 'other-file.txt',
          lfs: {oid: 'other-oid', size: 500},
        },
      ];

      fetchModelFilesDetails.mockResolvedValue(mockFileDetails);

      await modelStore.fetchAndUpdateModelFileDetails(model as any);

      expect(fetchModelFilesDetails).toHaveBeenCalledWith('test/model');
      expect(model.hfModelFile.lfs).toEqual({oid: 'test-oid', size: 1000});
    });

    it('should handle error when fetching file details', async () => {
      const model = {
        id: 'test-model',
        hfModel: {id: 'test/model'},
        hfModelFile: {rfilename: 'model.gguf', lfs: undefined},
      };

      fetchModelFilesDetails.mockRejectedValue(new Error('API error'));

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await modelStore.fetchAndUpdateModelFileDetails(model as any);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to fetch model file details:',
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });

    it('should not update if no matching file found', async () => {
      const model = {
        id: 'test-model',
        hfModel: {id: 'test/model'},
        hfModelFile: {rfilename: 'model.gguf', lfs: undefined},
      };

      const mockFileDetails = [
        {
          path: 'other-file.txt',
          lfs: {oid: 'other-oid', size: 500},
        },
      ];

      fetchModelFilesDetails.mockResolvedValue(mockFileDetails);

      await modelStore.fetchAndUpdateModelFileDetails(model as any);

      expect(fetchModelFilesDetails).toHaveBeenCalledWith('test/model');
      expect(model.hfModelFile.lfs).toBeUndefined();
    });

    it('should not update if matching file has no lfs data', async () => {
      const model = {
        id: 'test-model',
        hfModel: {id: 'test/model'},
        hfModelFile: {rfilename: 'model.gguf', lfs: undefined},
      };

      const mockFileDetails = [
        {
          path: 'model.gguf',
          // No lfs property
        },
      ];

      fetchModelFilesDetails.mockResolvedValue(mockFileDetails);

      await modelStore.fetchAndUpdateModelFileDetails(model as any);

      expect(fetchModelFilesDetails).toHaveBeenCalledWith('test/model');
      expect(model.hfModelFile.lfs).toBeUndefined();
    });
  });

  describe('initContext race condition prevention', () => {
    let initLlamaMock: jest.Mock;
    // Store original initContext to restore after tests that replace it with mocks
    const originalInitContext = modelStore.initContext;

    beforeEach(() => {
      jest.clearAllMocks();

      // Restore the original initContext method (may have been replaced by earlier tests)
      modelStore.initContext = originalInitContext;

      // Reset store state using runInAction for MobX observables
      runInAction(() => {
        modelStore.models = [];
        modelStore.context = undefined;
        modelStore.activeModelId = undefined;
        modelStore.isContextLoading = false;
      });

      // Get the mock function - use named export
      const {initLlama} = require('llama.rn');
      initLlamaMock = initLlama;
    });

    afterEach(() => {
      // Ensure flag is always cleared after each test
      runInAction(() => {
        modelStore.isContextLoading = false;
      });
    });

    it('should prevent concurrent initContext calls', async () => {
      const model = basicModel;

      // Mock initLlama with a long delay to ensure overlap
      const mockContext = {release: jest.fn()} as unknown as LlamaContext;
      initLlamaMock.mockReset(); // Ensure clean slate
      initLlamaMock.mockImplementation(
        () =>
          new Promise(resolve => setTimeout(() => resolve(mockContext), 200)),
      );

      // Start first init (don't await)
      const firstCall = modelStore.initContext(model);

      // Start second init immediately (should be guarded)
      const secondCall = modelStore.initContext(model);

      // The second call should resolve to null quickly (guarded)
      const secondResult = await secondCall;
      expect(secondResult).toBeNull();

      // Wait for first to complete
      const firstResult = await firstCall;
      expect(firstResult).toBeTruthy(); // First call should succeed

      // initLlama should only be called once (first call only)
      expect(initLlamaMock).toHaveBeenCalledTimes(1);
    });

    it('should clear isContextLoading after successful init', async () => {
      const model = basicModel;
      const mockContext = {release: jest.fn()} as unknown as LlamaContext;
      initLlamaMock.mockReset();
      initLlamaMock.mockResolvedValue(mockContext);

      await modelStore.initContext(model);

      expect(modelStore.isContextLoading).toBe(false);
    });

    it('should clear isContextLoading even when init fails', async () => {
      const model = basicModel;
      initLlamaMock.mockReset();
      initLlamaMock.mockRejectedValue(new Error('Init failed'));

      try {
        await modelStore.initContext(model);
      } catch {
        // Expected to throw
      }

      // Flag should still be cleared
      expect(modelStore.isContextLoading).toBe(false);
    });

    it('should return existing context when same model is already loaded', async () => {
      const model = basicModel;
      const mockContext = {
        release: jest.fn(),
        isMultimodalEnabled: jest.fn().mockResolvedValue(false),
      } as unknown as LlamaContext;

      // Set up as if model is already loaded
      runInAction(() => {
        modelStore.context = mockContext;
        modelStore.activeModelId = model.id;
      });

      initLlamaMock.mockReset();

      const result = await modelStore.initContext(model);

      // Should return existing context without calling initLlama
      expect(result).toBeTruthy();
      expect(initLlamaMock).not.toHaveBeenCalled();
    });

    it('should skip outdated load requests during rapid switching', async () => {
      const modelA = {...basicModel, id: 'model-a', name: 'Model A'};
      const modelB = {...basicModel, id: 'model-b', name: 'Model B'};
      const mockContextB = {release: jest.fn()} as unknown as LlamaContext;

      runInAction(() => {
        modelStore.models = [modelA, modelB];
      });

      // Mock initLlama with a delay to simulate slow loading
      initLlamaMock.mockReset();
      initLlamaMock.mockImplementation(
        () =>
          new Promise(resolve => setTimeout(() => resolve(mockContextB), 100)),
      );

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      // Start loading A, then immediately request B
      const loadA = modelStore.initContext(modelA);
      const loadB = modelStore.initContext(modelB);

      // Wait for both to complete
      const [resultA, resultB] = await Promise.all([loadA, loadB]);

      // A should be skipped (null), B should succeed
      expect(resultA).toBeNull();
      expect(resultB).toBeTruthy();

      // Should log that A was skipped (either during confirmation or in mutex)
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Skipping'),
      );

      consoleLogSpy.mockRestore();
    });
  });

  describe('checkSpaceAndDownload vision model auto-download', () => {
    beforeEach(() => {
      jest.clearAllMocks();

      // Reset RNFS mock state
      (RNFS as any).__resetMockState?.();

      // Reset store state
      modelStore.models = [];
      modelStore.context = undefined;
      modelStore.activeModelId = undefined;
      modelStore.activeProjectionModelId = undefined;

      // Re-setup download manager mocks after clearAllMocks
      (downloadManager.syncWithActiveDownloads as jest.Mock).mockResolvedValue(
        undefined,
      );
      (downloadManager.startDownload as jest.Mock).mockResolvedValue(undefined);
    });

    it('should auto-download projection model for vision models', async () => {
      const visionModel = {
        ...presetModelFixture,
        id: 'vision-model-0',
        filename: 'vision.gguf',
        supportsMultimodal: true,
        defaultProjectionModel: 'projection-model-0',
        modelType: ModelType.VISION,
        downloadUrl: 'https://example.com/vision.gguf',
        isLocal: false,
        isDownloaded: false,
        origin: ModelOrigin.PRESET,
        visionEnabled: true,
      };

      const projectionModel = {
        ...presetModelFixture,
        id: 'projection-model-0',
        filename: 'projection.gguf',
        modelType: ModelType.PROJECTION,
        downloadUrl: 'https://example.com/projection.gguf',
        isDownloaded: false,
        isLocal: false,
        origin: ModelOrigin.PRESET,
      };

      modelStore.models = [visionModel, projectionModel];

      await modelStore.checkSpaceAndDownload('vision-model-0');

      // Should call startDownload twice: once for vision model, once for projection
      expect(downloadManager.startDownload).toHaveBeenCalledTimes(2);
    });

    it('should not auto-download projection model for vision models that are not enabled for vision', async () => {
      const visionModel = {
        ...presetModelFixture,
        id: 'vision-model-0',
        filename: 'vision.gguf',
        supportsMultimodal: true,
        defaultProjectionModel: 'projection-model-0',
        modelType: ModelType.VISION,
        downloadUrl: 'https://example.com/vision.gguf',
        isLocal: false,
        isDownloaded: false,
        origin: ModelOrigin.PRESET,
        visionEnabled: false,
      };

      const projectionModel = {
        ...presetModelFixture,
        id: 'projection-model-0',
        filename: 'projection.gguf',
        modelType: ModelType.PROJECTION,
        downloadUrl: 'https://example.com/projection.gguf',
        isDownloaded: false,
        isLocal: false,
        origin: ModelOrigin.PRESET,
      };

      modelStore.models = [visionModel, projectionModel];

      await modelStore.checkSpaceAndDownload('vision-model-0');

      // Should call startDownload twice: once for vision model, once for projection
      expect(downloadManager.startDownload).toHaveBeenCalledTimes(1);
    });

    it('should not auto-download projection model if already downloaded', async () => {
      // Mock RNFS.exists to return false for vision model but true for projection (already downloaded)
      (RNFS.exists as jest.Mock).mockImplementation((path: string) => {
        const filename = path.split('/').pop()?.replace('.gguf', '');
        if (filename === 'vision') {
          return Promise.resolve(false); // Not downloaded
        }
        if (filename === 'projection') {
          return Promise.resolve(true); // Already downloaded
        }
        return Promise.resolve(true); // Default behavior for other files
      });

      const visionModel = {
        ...presetModelFixture,
        id: 'vision-model',
        filename: 'vision.gguf',
        supportsMultimodal: true,
        defaultProjectionModel: 'projection-model',
        modelType: ModelType.VISION,
        downloadUrl: 'https://example.com/vision.gguf',
        isLocal: false,
        isDownloaded: false,
        origin: ModelOrigin.PRESET,
      };

      const projectionModel = {
        ...presetModelFixture,
        id: 'projection-model',
        filename: 'projection.gguf',
        modelType: ModelType.PROJECTION,
        downloadUrl: 'https://example.com/projection.gguf',
        isDownloaded: true, // Already downloaded
        isLocal: false,
        origin: ModelOrigin.PRESET,
      };

      modelStore.models = [visionModel, projectionModel];

      // Ensure vision model is marked as not downloaded after setting up the mock
      visionModel.isDownloaded = false;

      await modelStore.checkSpaceAndDownload('vision-model');

      expect(downloadManager.startDownload).toHaveBeenCalledTimes(1);
      expect(downloadManager.startDownload).toHaveBeenCalledWith(
        visionModel,
        expect.any(String),
        expect.any(String),
      );
    });

    it('should not auto-download for projection models themselves', async () => {
      // Mock RNFS.exists to return false for projection model (not downloaded)
      (RNFS.exists as jest.Mock).mockImplementation((path: string) => {
        const filename = path.split('/').pop()?.replace('.gguf', '');
        if (filename === 'projection') {
          return Promise.resolve(false); // Not downloaded
        }
        return Promise.resolve(true); // Default behavior for other files
      });

      const projectionModel = {
        ...presetModelFixture,
        id: 'projection-model',
        filename: 'projection.gguf',
        supportsMultimodal: true,
        defaultProjectionModel: 'some-other-projection',
        modelType: ModelType.PROJECTION,
        downloadUrl: 'https://example.com/projection.gguf',
        isLocal: false,
        isDownloaded: false,
        origin: ModelOrigin.PRESET,
      };

      modelStore.models = [projectionModel];

      // Ensure model is marked as not downloaded after setting up the mock
      projectionModel.isDownloaded = false;

      await modelStore.checkSpaceAndDownload('projection-model');

      // Should only call startDownload once for the projection model itself
      expect(downloadManager.startDownload).toHaveBeenCalledTimes(1);
      expect(downloadManager.startDownload).toHaveBeenCalledWith(
        projectionModel,
        expect.any(String),
        expect.any(String),
      );
    });

    it('should not auto-download for non-multimodal models', async () => {
      // Mock RNFS.exists to return false for regular model (not downloaded)
      (RNFS.exists as jest.Mock).mockImplementation((path: string) => {
        const filename = path.split('/').pop()?.replace('.gguf', '');
        if (filename === 'regular') {
          return Promise.resolve(false); // Not downloaded
        }
        return Promise.resolve(true); // Default behavior for other files
      });

      const regularModel = {
        ...presetModelFixture,
        id: 'regular-model',
        filename: 'regular.gguf',
        supportsMultimodal: false,
        defaultProjectionModel: undefined,
        downloadUrl: 'https://example.com/regular.gguf',
        isLocal: false,
        isDownloaded: false,
        origin: ModelOrigin.PRESET,
      };

      modelStore.models = [regularModel];

      // Ensure model is marked as not downloaded after setting up the mock
      regularModel.isDownloaded = false;

      await modelStore.checkSpaceAndDownload('regular-model');

      // Should only call startDownload once for the regular model
      expect(downloadManager.startDownload).toHaveBeenCalledTimes(1);
      expect(downloadManager.startDownload).toHaveBeenCalledWith(
        regularModel,
        expect.any(String),
        expect.any(String),
      );
    });

    it('should auto-download projection model for HF vision models', async () => {
      // Mock RNFS.exists to return false for our test models (they're not downloaded)
      (RNFS.exists as jest.Mock).mockImplementation((path: string) => {
        const filename = path.split('/').pop()?.replace('.gguf', '');
        if (filename === 'hf-vision' || filename === 'hf-projection') {
          return Promise.resolve(false); // Not downloaded
        }
        return Promise.resolve(true); // Default behavior for other files
      });

      const hfVisionModel = {
        ...presetModelFixture,
        id: 'hf-vision-model',
        filename: 'hf-vision.gguf',
        supportsMultimodal: true,
        defaultProjectionModel: 'hf-projection-model',
        modelType: ModelType.VISION,
        downloadUrl: 'https://example.com/hf-vision.gguf',
        isLocal: false,
        isDownloaded: false,
        origin: ModelOrigin.HF,
        visionEnabled: true,
      };

      const hfProjectionModel = {
        ...presetModelFixture,
        id: 'hf-projection-model',
        filename: 'hf-projection.gguf',
        modelType: ModelType.PROJECTION,
        downloadUrl: 'https://example.com/hf-projection.gguf',
        isDownloaded: false,
        isLocal: false,
        origin: ModelOrigin.HF,
      };

      modelStore.models = [hfVisionModel, hfProjectionModel];

      // Ensure models are marked as not downloaded after setting up the mock
      hfVisionModel.isDownloaded = false;
      hfProjectionModel.isDownloaded = false;

      // Track calls to downloadManager.startDownload and isDownloading
      const startDownloadSpy = downloadManager.startDownload as jest.Mock;
      const isDownloadingSpy = downloadManager.isDownloading as jest.Mock;
      startDownloadSpy.mockClear();
      isDownloadingSpy.mockReturnValue(false); // Not currently downloading

      await modelStore.checkSpaceAndDownload('hf-vision-model');

      // Should call startDownload twice: once for HF vision model, once for projection
      expect(startDownloadSpy).toHaveBeenCalledTimes(2);

      // Check that both models were passed to startDownload
      const calls = startDownloadSpy.mock.calls;
      const modelIds = calls.map(call => call[0].id);
      expect(modelIds).toContain('hf-vision-model');
      expect(modelIds).toContain('hf-projection-model');
    });

    it('should handle projection model download errors gracefully', async () => {
      // Mock RNFS.exists to return false for our test models (they're not downloaded)
      (RNFS.exists as jest.Mock).mockImplementation((path: string) => {
        const filename = path.split('/').pop()?.replace('.gguf', '');
        if (filename === 'vision' || filename === 'projection') {
          return Promise.resolve(false); // Not downloaded
        }
        return Promise.resolve(true); // Default behavior for other files
      });

      const visionModel = {
        ...presetModelFixture,
        id: 'vision-model',
        filename: 'vision.gguf',
        supportsMultimodal: true,
        defaultProjectionModel: 'projection-model',
        modelType: ModelType.VISION,
        downloadUrl: 'https://example.com/vision.gguf',
        isLocal: false,
        isDownloaded: false,
        origin: ModelOrigin.PRESET,
        visionEnabled: true,
      };

      const projectionModel = {
        ...presetModelFixture,
        id: 'projection-model',
        filename: 'projection.gguf',
        modelType: ModelType.PROJECTION,
        downloadUrl: 'https://example.com/projection.gguf',
        isDownloaded: false,
        isLocal: false,
        origin: ModelOrigin.PRESET,
      };

      modelStore.models = [visionModel, projectionModel];

      // Mock console.error to track error logging
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Track calls to downloadManager.startDownload and isDownloading
      const startDownloadSpy = downloadManager.startDownload as jest.Mock;
      const isDownloadingSpy = downloadManager.isDownloading as jest.Mock;
      startDownloadSpy.mockClear();
      isDownloadingSpy.mockReturnValue(false); // Not currently downloading

      // Make the projection model download fail
      startDownloadSpy.mockImplementation((model: any) => {
        if (model.id === 'projection-model') {
          throw new Error('Projection download failed');
        }
        return Promise.resolve();
      });

      // Ensure models are marked as not downloaded after setting up the mock
      visionModel.isDownloaded = false;
      projectionModel.isDownloaded = false;

      // This should not throw even though projection model download fails
      await modelStore.checkSpaceAndDownload('vision-model');

      // Should call startDownload twice: once for vision model, once for projection
      expect(startDownloadSpy).toHaveBeenCalledTimes(2);

      // Should log the projection model error
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to auto-download projection model:',
        expect.any(Error),
      );

      // Clean up
      consoleErrorSpy.mockRestore();
    });

    it('should not auto-download projection model if already downloading', async () => {
      // Mock RNFS.exists to return false for our test models (they're not downloaded)
      (RNFS.exists as jest.Mock).mockImplementation((path: string) => {
        const filename = path.split('/').pop()?.replace('.gguf', '');
        if (filename === 'vision' || filename === 'projection') {
          return Promise.resolve(false); // Not downloaded
        }
        return Promise.resolve(true); // Default behavior for other files
      });

      const visionModel = {
        ...presetModelFixture,
        id: 'vision-model',
        filename: 'vision.gguf',
        supportsMultimodal: true,
        defaultProjectionModel: 'projection-model',
        modelType: ModelType.VISION,
        downloadUrl: 'https://example.com/vision.gguf',
        isLocal: false,
        isDownloaded: false,
        origin: ModelOrigin.PRESET,
      };

      const projectionModel = {
        ...presetModelFixture,
        id: 'projection-model',
        filename: 'projection.gguf',
        modelType: ModelType.PROJECTION,
        downloadUrl: 'https://example.com/projection.gguf',
        isDownloaded: false,
        isLocal: false,
        origin: ModelOrigin.PRESET,
      };

      modelStore.models = [visionModel, projectionModel];

      // Ensure models are marked as not downloaded after setting up the mock
      visionModel.isDownloaded = false;
      projectionModel.isDownloaded = false;

      // Track calls to downloadManager.startDownload and isDownloading
      const startDownloadSpy = downloadManager.startDownload as jest.Mock;
      const isDownloadingSpy = downloadManager.isDownloading as jest.Mock;
      startDownloadSpy.mockClear();

      // Mock that projection model is already downloading
      isDownloadingSpy.mockImplementation((modelId: string) => {
        return modelId === 'projection-model'; // Projection model is downloading
      });

      await modelStore.checkSpaceAndDownload('vision-model');

      // Should only call startDownload once for the vision model, not for projection
      expect(startDownloadSpy).toHaveBeenCalledTimes(1);
      expect(startDownloadSpy).toHaveBeenCalledWith(
        visionModel,
        expect.any(String),
        expect.any(String),
      );
    });
  });

  describe('initializeThreadCount', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should always update max_threads from hardware', async () => {
      (getCpuCoreCount as jest.Mock).mockResolvedValue(10);
      (getRecommendedThreadCount as jest.Mock).mockResolvedValue(8);

      await (modelStore as any).initializeThreadCount();

      expect(modelStore.max_threads).toBe(10);
    });

    it('should set recommended n_threads on first launch (version === undefined)', async () => {
      runInAction(() => {
        modelStore.version = undefined;
      });
      (getCpuCoreCount as jest.Mock).mockResolvedValue(8);
      (getRecommendedThreadCount as jest.Mock).mockResolvedValue(6);

      await (modelStore as any).initializeThreadCount();

      expect(modelStore.contextInitParams.n_threads).toBe(6);
    });

    it('should preserve user-set n_threads on subsequent launches (version !== undefined)', async () => {
      runInAction(() => {
        modelStore.version = 1;
        modelStore.contextInitParams = {
          ...modelStore.contextInitParams,
          n_threads: 4,
        };
      });
      (getCpuCoreCount as jest.Mock).mockResolvedValue(8);
      (getRecommendedThreadCount as jest.Mock).mockResolvedValue(6);

      await (modelStore as any).initializeThreadCount();

      expect(modelStore.contextInitParams.n_threads).toBe(4);
      expect(modelStore.max_threads).toBe(8);
    });

    it('should fallback max_threads to 4 on error without touching n_threads', async () => {
      runInAction(() => {
        modelStore.version = 1;
        modelStore.contextInitParams = {
          ...modelStore.contextInitParams,
          n_threads: 3,
        };
      });
      (getCpuCoreCount as jest.Mock).mockRejectedValue(new Error('fail'));

      await (modelStore as any).initializeThreadCount();

      expect(modelStore.max_threads).toBe(4);
      expect(modelStore.contextInitParams.n_threads).toBe(3);
    });
  });

  describe('remoteModels computed', () => {
    beforeEach(() => {
      // Reset serverStore state for remote model tests
      runInAction(() => {
        serverStore.servers = [];
        serverStore.serverModels.clear();
        serverStore.userSelectedModels = [];
      });
    });

    it('returns only user-selected models', () => {
      runInAction(() => {
        serverStore.servers = [
          {id: 'srv-1', name: 'LM Studio', url: 'http://localhost:1234'},
        ];
        serverStore.serverModels.set('srv-1', [
          {id: 'llama-7b', object: 'model', owned_by: 'system'},
          {id: 'codellama', object: 'model', owned_by: 'system'},
        ]);
        serverStore.userSelectedModels = [
          {serverId: 'srv-1', remoteModelId: 'llama-7b'},
        ];
      });

      const remoteModels = modelStore.remoteModels;

      expect(remoteModels).toHaveLength(1);
      expect(remoteModels[0].name).toBe('llama-7b');
      expect(remoteModels[0].origin).toBe(ModelOrigin.REMOTE);
      expect(remoteModels[0].serverId).toBe('srv-1');
      expect(remoteModels[0].serverName).toBe('LM Studio');
    });

    it('returns empty array when no models are user-selected', () => {
      runInAction(() => {
        serverStore.servers = [
          {id: 'srv-1', name: 'LM Studio', url: 'http://localhost:1234'},
        ];
        serverStore.serverModels.set('srv-1', [
          {id: 'llama-7b', object: 'model', owned_by: 'system'},
        ]);
        // No userSelectedModels
      });

      expect(modelStore.remoteModels).toHaveLength(0);
    });

    it('skips models for non-existent servers', () => {
      runInAction(() => {
        // Server does not exist in servers array
        serverStore.userSelectedModels = [
          {serverId: 'non-existent', remoteModelId: 'model-a'},
        ];
      });

      expect(modelStore.remoteModels).toHaveLength(0);
    });

    it('returns models from multiple servers', () => {
      runInAction(() => {
        serverStore.servers = [
          {id: 'srv-1', name: 'LM Studio', url: 'http://localhost:1234'},
          {id: 'srv-2', name: 'Ollama', url: 'http://localhost:11434'},
        ];
        serverStore.userSelectedModels = [
          {serverId: 'srv-1', remoteModelId: 'llama-7b'},
          {serverId: 'srv-2', remoteModelId: 'mistral'},
        ];
      });

      const remoteModels = modelStore.remoteModels;

      expect(remoteModels).toHaveLength(2);
      expect(remoteModels[0].serverName).toBe('LM Studio');
      expect(remoteModels[1].serverName).toBe('Ollama');
    });

    it('generates correct model id from serverId and remoteModelId', () => {
      runInAction(() => {
        serverStore.servers = [
          {id: 'srv-1', name: 'LM Studio', url: 'http://localhost:1234'},
        ];
        serverStore.userSelectedModels = [
          {serverId: 'srv-1', remoteModelId: 'llama-7b'},
        ];
      });

      const remoteModels = modelStore.remoteModels;

      expect(remoteModels[0].id).toBe('srv-1/llama-7b');
    });
  });

  // setRemoteModel builds the OpenAI engine carrying the server's
  // requestTimeoutMs. The engine is rebuilt on each call, so an edited value
  // takes effect on the next (re)selection.
  describe('setRemoteModel timeout wiring', () => {
    beforeEach(() => {
      runInAction(() => {
        serverStore.servers = [];
        modelStore.context = undefined;
      });
    });

    const remoteModel = {
      id: 'srv-1/llama-7b',
      name: 'llama-7b',
      origin: ModelOrigin.REMOTE,
      serverId: 'srv-1',
      remoteModelId: 'llama-7b',
    } as any;

    it('builds the engine carrying the saved requestTimeoutMs', async () => {
      runInAction(() => {
        serverStore.servers = [
          {
            id: 'srv-1',
            name: 'Slow Server',
            url: 'http://localhost:1234',
            requestTimeoutMs: 600000,
          },
        ];
      });

      await modelStore.setRemoteModel(remoteModel);

      expect((modelStore.engine as any).timeoutMs).toBe(600000);
    });

    it('builds the engine with undefined timeout for a server without the field', async () => {
      runInAction(() => {
        serverStore.servers = [
          {id: 'srv-1', name: 'Default Server', url: 'http://localhost:1234'},
        ];
      });

      await modelStore.setRemoteModel(remoteModel);

      expect((modelStore.engine as any).timeoutMs).toBeUndefined();
    });

    it('rebuilds the engine with an updated timeout on re-selection', async () => {
      runInAction(() => {
        serverStore.servers = [
          {
            id: 'srv-1',
            name: 'Server',
            url: 'http://localhost:1234',
            requestTimeoutMs: 30000,
          },
        ];
      });
      await modelStore.setRemoteModel(remoteModel);
      expect((modelStore.engine as any).timeoutMs).toBe(30000);

      // User edits the timeout, then re-selects the model.
      runInAction(() => {
        serverStore.servers[0].requestTimeoutMs = 600000;
      });
      await modelStore.setRemoteModel(remoteModel);

      expect((modelStore.engine as any).timeoutMs).toBe(600000);
    });

    it('builds the engine carrying the saved serverType', async () => {
      runInAction(() => {
        serverStore.servers = [
          {
            id: 'srv-1',
            name: 'Ollama Server',
            url: 'http://localhost:11434',
            serverType: 'Ollama',
          },
        ];
      });

      await modelStore.setRemoteModel(remoteModel);

      expect((modelStore.engine as any).serverType).toBe('Ollama');
    });
  });

  describe('fetchAndPersistGGUFMetadata error handling', () => {
    const {loadLlamaModelInfo} = require('llama.rn');

    beforeEach(() => {
      (loadLlamaModelInfo as jest.Mock).mockReset();
    });

    it('should not crash when loadLlamaModelInfo rejects', async () => {
      const model = {
        ...presetModelFixture,
        isDownloaded: true,
        ggufMetadata: undefined,
      };
      modelStore.models = [model];

      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      (loadLlamaModelInfo as jest.Mock).mockRejectedValue(
        new Error('std::runtime_error'),
      );

      // Should not throw — error is caught internally
      await modelStore.fetchAndPersistGGUFMetadata(model);

      expect(model.ggufMetadata).toBeUndefined();
    });

    it('should handle null response gracefully', async () => {
      const model = {
        ...presetModelFixture,
        isDownloaded: true,
        ggufMetadata: undefined,
      };
      modelStore.models = [model];

      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      (loadLlamaModelInfo as jest.Mock).mockResolvedValue(null);

      await modelStore.fetchAndPersistGGUFMetadata(model);

      expect(model.ggufMetadata).toBeUndefined();
    });

    it('should populate ggufMetadata on success', async () => {
      const model = {
        ...presetModelFixture,
        isDownloaded: true,
        ggufMetadata: undefined,
      };
      modelStore.models = [model];

      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      (loadLlamaModelInfo as jest.Mock).mockResolvedValue({
        'general.architecture': 'llama',
        'llama.block_count': 32,
        'llama.embedding_length': 4096,
        'llama.attention.head_count': 32,
        'llama.attention.head_count_kv': 8,
        'llama.vocab_size': 32000,
      });

      await modelStore.fetchAndPersistGGUFMetadata(model);

      expect(model.ggufMetadata).toBeDefined();
      const metadata = model.ggufMetadata as unknown as GGUFMetadata;
      expect(metadata.architecture).toBe('llama');
      expect(metadata.n_layers).toBe(32);
    });
  });

  describe('reasoning capability writers', () => {
    it('hydrating a model without reasoning does not crash and stays undefined', () => {
      const m = createModel({id: 'local-1', origin: ModelOrigin.PRESET});
      modelStore.models = [m];
      expect(modelStore.models[0].reasoning).toBeUndefined();
    });

    it('recordReasoningObserved flips a local model to learned yes', () => {
      const m = createModel({id: 'local-1', origin: ModelOrigin.PRESET});
      modelStore.models = [m];
      modelStore.recordReasoningObserved('local-1');
      expect(modelStore.models[0].reasoning).toMatchObject({
        isReasoning: 'yes',
        source: 'learned',
      });
    });

    it('recordReasoningObserved never downgrades a user declaration', () => {
      const m = createModel({id: 'local-1', origin: ModelOrigin.PRESET});
      m.reasoning = {
        isReasoning: 'no',
        source: 'user',
        supportsEffort: false,
        effortValues: [],
        effortSource: 'none',
      };
      modelStore.models = [m];
      modelStore.recordReasoningObserved('local-1');
      expect(modelStore.models[0].reasoning?.source).toBe('user');
      expect(modelStore.models[0].reasoning?.isReasoning).toBe('no');
    });

    it('recordReasoningObserved is a monotonic no-op once axis-1 is already yes', () => {
      const m = createModel({id: 'local-1', origin: ModelOrigin.PRESET});
      const detectedYes = {
        isReasoning: 'yes' as const,
        source: 'detected' as const,
        supportsEffort: true,
        effortValues: ['low', 'high'],
        effortSource: 'detected' as const,
      };
      m.reasoning = detectedYes;
      modelStore.models = [m];
      modelStore.recordReasoningObserved('local-1');
      // Already 'yes' → not re-flipped to 'learned' and axis-2 preserved.
      expect(modelStore.models[0].reasoning?.source).toBe('detected');
      expect(modelStore.models[0].reasoning?.isReasoning).toBe('yes');
      expect(modelStore.models[0].reasoning?.supportsEffort).toBe(true);
      expect(modelStore.models[0].reasoning?.effortValues).toEqual([
        'low',
        'high',
      ]);
    });

    it('recordReasoningObserved routes an unknown id to ServerStore', () => {
      const spy = jest.spyOn(serverStore, 'recordRemoteReasoningObserved');
      modelStore.models = [];
      modelStore.recordReasoningObserved('server-1/remote-m');
      expect(spy).toHaveBeenCalledWith('server-1/remote-m');
      spy.mockRestore();
    });

    it('setReasoningOverride writes a user capability on a local model', () => {
      const m = createModel({id: 'local-1', origin: ModelOrigin.PRESET});
      modelStore.models = [m];
      modelStore.setReasoningOverride('local-1', {
        isReasoning: 'yes',
        source: 'user',
        supportsEffort: true,
        effortValues: ['low', 'medium', 'high'],
        effortSource: 'user',
      });
      expect(modelStore.models[0].reasoning).toMatchObject({
        source: 'user',
        supportsEffort: true,
      });
      expect(modelStore.models[0].supportsThinking).toBe(true);
    });

    it('setReasoningOverride routes an unknown id to ServerStore', () => {
      const spy = jest.spyOn(serverStore, 'setRemoteReasoningOverride');
      modelStore.models = [];
      const cap = {
        isReasoning: 'yes' as const,
        source: 'user' as const,
        supportsEffort: false,
        effortValues: [],
        effortSource: 'none' as const,
      };
      modelStore.setReasoningOverride('server-1/remote-m', cap);
      expect(spy).toHaveBeenCalledWith('server-1/remote-m', cap);
      spy.mockRestore();
    });
  });

  describe('speculative decoding', () => {
    beforeEach(() => {
      runInAction(() => {
        modelStore.contextInitParams = {
          ...modelStore.contextInitParams,
          speculativeEnabled: false,
          flash_attn_type: undefined,
          spec_draft_n_max: undefined,
          spec_draft_n_min: undefined,
          spec_draft_p_min: undefined,
          spec_draft_p_split: undefined,
          spec_draft_n_gpu_layers: undefined,
          spec_draft_cache_type_k: undefined,
          spec_draft_cache_type_v: undefined,
        };
        modelStore.activeDraftModelId = undefined;
      });
    });

    describe('getEffectiveContextInitParams speculative mode', () => {
      it('embedded mode: speculative on, no draft → MTP defaults, no model_draft', async () => {
        modelStore.setSpeculativeEnabled(true);
        const params: any = await modelStore.getEffectiveContextInitParams(
          undefined,
          {mode: 'embedded'},
        );

        expect(params.model_draft).toBeUndefined();
        expect(params.spec_draft_cache_type_k).toBe('q8_0');
        expect(params.spec_draft_cache_type_v).toBe('q8_0');
        expect(params.flash_attn_type).toBe('auto');
      });

      it('paired mode: downloaded draft → model_draft set, paired defaults', async () => {
        modelStore.setSpeculativeEnabled(true);
        const params: any = await modelStore.getEffectiveContextInitParams(
          undefined,
          {mode: 'paired', resolvedDraftPath: '/path/to/draft.gguf'},
        );

        expect(params.model_draft).toBe('/path/to/draft.gguf');
        expect(params.is_model_draft_asset).toBe(false);
        expect(params.spec_draft_cache_type_k).toBe('f16');
        expect(params.spec_draft_cache_type_v).toBe('f16');
        expect(params.spec_draft_n_gpu_layers).toBe(99);
        expect(params.flash_attn_type).toBe('off');
      });

      it('off mode: no draftConfig → zero spec_draft_*, no model_draft', async () => {
        const params: any =
          await modelStore.getEffectiveContextInitParams(undefined);

        expect(params.model_draft).toBeUndefined();
        expect(params.spec_draft_cache_type_k).toBeUndefined();
        expect(params.spec_draft_n_gpu_layers).toBeUndefined();
      });

      it('does not overwrite an explicit user-set spec_draft value with a mode default', async () => {
        modelStore.setSpeculativeEnabled(true);
        modelStore.setSpecDraftCacheTypeK('q4_0' as any);

        const params: any = await modelStore.getEffectiveContextInitParams(
          undefined,
          {mode: 'paired', resolvedDraftPath: '/path/to/draft.gguf'},
        );

        // Paired mode default is f16, but the user explicitly chose q4_0.
        expect(params.spec_draft_cache_type_k).toBe('q4_0');
      });
    });

    describe('resolveDraftConfig', () => {
      it('returns off when speculative is disabled', async () => {
        modelStore.setSpeculativeEnabled(false);
        const target = {id: 'a/b/t.gguf', defaultDraftModel: 'c/d/dr.gguf'};
        const cfg = await (modelStore as any).resolveDraftConfig(target);
        expect(cfg.mode).toBe('off');
      });

      it('paired draft not downloaded → embedded mode, no error', async () => {
        modelStore.setSpeculativeEnabled(true);
        runInAction(() => {
          modelStore.models = [
            {
              id: 'c/d/dr.gguf',
              isDownloaded: false,
              modelType: ModelType.DRAFT,
            } as any,
          ];
          modelStore.modelLoadError = null;
        });
        const target = {id: 'a/b/t.gguf', defaultDraftModel: 'c/d/dr.gguf'};
        const cfg = await (modelStore as any).resolveDraftConfig(target);

        expect(cfg.mode).toBe('embedded');
        expect(cfg.resolvedDraftPath).toBeUndefined();
        expect(modelStore.modelLoadError).toBeNull();
      });

      it('paired when the draft is downloaded with a resolvable path', async () => {
        modelStore.setSpeculativeEnabled(true);
        runInAction(() => {
          modelStore.models = [
            {
              id: 'c/d/dr.gguf',
              isDownloaded: true,
              origin: ModelOrigin.LOCAL,
              fullPath: '/path/to/dr.gguf',
              modelType: ModelType.DRAFT,
            } as any,
          ];
        });
        const target = {id: 'a/b/t.gguf', defaultDraftModel: 'c/d/dr.gguf'};
        const cfg = await (modelStore as any).resolveDraftConfig(target);

        expect(cfg.mode).toBe('paired');
        expect(cfg.resolvedDraftPath).toBe('/path/to/dr.gguf');
        expect(cfg.draftModel?.id).toBe('c/d/dr.gguf');
      });
    });

    describe('single-writer setters', () => {
      it('setSpeculativeEnabled is the sole writer of the master switch', () => {
        modelStore.setSpeculativeEnabled(true);
        expect(modelStore.contextInitParams.speculativeEnabled).toBe(true);
        modelStore.setSpeculativeEnabled(false);
        expect(modelStore.contextInitParams.speculativeEnabled).toBe(false);
      });

      it('spec_draft_* setters update only their own field', () => {
        modelStore.setSpecDraftNMax(5);
        modelStore.setSpecDraftNGpuLayers(10);
        expect(modelStore.contextInitParams.spec_draft_n_max).toBe(5);
        expect(modelStore.contextInitParams.spec_draft_n_gpu_layers).toBe(10);
      });

      it('setSelectedDraftModel is the sole writer of the global pick', () => {
        modelStore.setSelectedDraftModel('c/d/dr.gguf');
        expect(modelStore.contextInitParams.selectedDraftModelId).toBe(
          'c/d/dr.gguf',
        );
        modelStore.setSelectedDraftModel(undefined);
        expect(
          modelStore.contextInitParams.selectedDraftModelId,
        ).toBeUndefined();
      });
    });

    describe('global draft pick precedence (resolveDraftConfig)', () => {
      const downloadedDraft = (id: string, fullPath: string) =>
        ({
          id,
          isDownloaded: true,
          origin: ModelOrigin.LOCAL,
          fullPath,
          modelType: ModelType.DRAFT,
        } as any);

      it('global pick, no per-target draft → paired with the global draft', async () => {
        modelStore.setSpeculativeEnabled(true);
        runInAction(() => {
          modelStore.models = [
            downloadedDraft('user/global/dr.gguf', '/path/global.gguf'),
          ];
        });
        modelStore.setSelectedDraftModel('user/global/dr.gguf');

        const target = {id: 'a/b/t.gguf'};
        const cfg = await (modelStore as any).resolveDraftConfig(target);

        expect(cfg.mode).toBe('paired');
        expect(cfg.resolvedDraftPath).toBe('/path/global.gguf');
        expect(cfg.draftModel?.id).toBe('user/global/dr.gguf');
      });

      it('per-target draft overrides the global pick', async () => {
        modelStore.setSpeculativeEnabled(true);
        runInAction(() => {
          modelStore.models = [
            downloadedDraft('rules/draft.gguf', '/path/rules.gguf'),
            downloadedDraft('user/other.gguf', '/path/other.gguf'),
          ];
        });
        modelStore.setSelectedDraftModel('user/other.gguf');

        const target = {id: 'a/b/t.gguf', defaultDraftModel: 'rules/draft.gguf'};
        const cfg = await (modelStore as any).resolveDraftConfig(target);

        expect(cfg.mode).toBe('paired');
        expect(cfg.resolvedDraftPath).toBe('/path/rules.gguf');
        expect(cfg.draftModel?.id).toBe('rules/draft.gguf');
      });

      it('global pick not downloaded → embedded, no error', async () => {
        modelStore.setSpeculativeEnabled(true);
        runInAction(() => {
          modelStore.models = [
            {
              id: 'user/global/dr.gguf',
              isDownloaded: false,
              modelType: ModelType.DRAFT,
            } as any,
          ];
          modelStore.modelLoadError = null;
        });
        modelStore.setSelectedDraftModel('user/global/dr.gguf');

        const target = {id: 'a/b/t.gguf'};
        const cfg = await (modelStore as any).resolveDraftConfig(target);

        expect(cfg.mode).toBe('embedded');
        expect(cfg.resolvedDraftPath).toBeUndefined();
        expect(modelStore.modelLoadError).toBeNull();
      });

      it('load-time no-op: nothing picked, no per-target draft → embedded (migrated record loads identically to pre-feature)', async () => {
        modelStore.setSpeculativeEnabled(true);
        modelStore.setSelectedDraftModel(undefined);
        runInAction(() => {
          modelStore.models = [];
        });

        const target = {id: 'a/b/t.gguf'};
        const cfg = await (modelStore as any).resolveDraftConfig(target);

        expect(cfg.mode).toBe('embedded');
        expect(cfg.resolvedDraftPath).toBeUndefined();
      });

      it('speculative off → off before reading the global pick', async () => {
        modelStore.setSpeculativeEnabled(false);
        modelStore.setSelectedDraftModel('user/global/dr.gguf');
        runInAction(() => {
          modelStore.models = [
            downloadedDraft('user/global/dr.gguf', '/path/global.gguf'),
          ];
        });

        const target = {id: 'a/b/t.gguf'};
        const cfg = await (modelStore as any).resolveDraftConfig(target);

        expect(cfg.mode).toBe('off');
      });
    });

    describe('activeDraftModelId reset on release', () => {
      it('clears activeDraftModelId on context release', async () => {
        runInAction(() => {
          modelStore.activeDraftModelId = 'c/d/dr.gguf';
          modelStore.context = undefined;
          modelStore.engine = {stopCompletion: jest.fn()} as any;
        });

        await (modelStore as any)._releaseContextInternal(true);

        expect(modelStore.activeDraftModelId).toBeUndefined();
      });
    });

    describe('draft auto-download', () => {
      const makeDownloadPair = () => {
        runInAction(() => {
          modelStore.models = [
            {
              id: 'a/b/t.gguf',
              filename: 't.gguf',
              isDownloaded: false,
              isLocal: false,
              origin: ModelOrigin.HF,
              author: 'a',
              repo: 'b',
              downloadUrl: 'https://huggingface.co/a/b/resolve/main/t.gguf',
              defaultDraftModel: 'c/d/dr.gguf',
            } as any,
            {
              id: 'c/d/dr.gguf',
              filename: 'dr.gguf',
              isDownloaded: false,
              isLocal: false,
              origin: ModelOrigin.HF,
              author: 'c',
              repo: 'd',
              downloadUrl: 'https://huggingface.co/c/d/resolve/main/dr.gguf',
              modelType: ModelType.DRAFT,
            } as any,
          ];
        });
      };

      it('auto-downloads the paired draft when speculative is on', async () => {
        modelStore.setSpeculativeEnabled(true);
        makeDownloadPair();

        await modelStore.checkSpaceAndDownload('a/b/t.gguf');

        const downloaded = (
          downloadManager.startDownload as jest.Mock
        ).mock.calls.map((c: any[]) => c[0].id);
        expect(downloaded).toContain('c/d/dr.gguf');
      });

      it('does not auto-download the draft when speculative is off', async () => {
        modelStore.setSpeculativeEnabled(false);
        makeDownloadPair();

        await modelStore.checkSpaceAndDownload('a/b/t.gguf');

        const downloaded = (
          downloadManager.startDownload as jest.Mock
        ).mock.calls.map((c: any[]) => c[0].id);
        expect(downloaded).not.toContain('c/d/dr.gguf');
      });

      it('a draft download failure does not reject the target download', async () => {
        modelStore.setSpeculativeEnabled(true);
        makeDownloadPair();

        (downloadManager.startDownload as jest.Mock).mockImplementation(
          async (m: any) => {
            if (m.id === 'c/d/dr.gguf') {
              throw new Error('draft download failed');
            }
          },
        );

        await expect(
          modelStore.checkSpaceAndDownload('a/b/t.gguf'),
        ).resolves.not.toThrow();
      });

      it('auto-downloads a globally-picked draft when the target has no per-target draft', async () => {
        modelStore.setSpeculativeEnabled(true);
        runInAction(() => {
          modelStore.models = [
            {
              id: 'a/b/t.gguf',
              filename: 't.gguf',
              isDownloaded: false,
              isLocal: false,
              origin: ModelOrigin.HF,
              author: 'a',
              repo: 'b',
              downloadUrl: 'https://huggingface.co/a/b/resolve/main/t.gguf',
            } as any,
            {
              id: 'user/global/dr.gguf',
              filename: 'dr.gguf',
              isDownloaded: false,
              isLocal: false,
              origin: ModelOrigin.HF,
              author: 'user',
              repo: 'global',
              downloadUrl:
                'https://huggingface.co/user/global/resolve/main/dr.gguf',
              modelType: ModelType.DRAFT,
            } as any,
          ];
        });
        modelStore.setSelectedDraftModel('user/global/dr.gguf');

        await modelStore.checkSpaceAndDownload('a/b/t.gguf');

        const downloaded = (
          downloadManager.startDownload as jest.Mock
        ).mock.calls.map((c: any[]) => c[0].id);
        expect(downloaded).toContain('user/global/dr.gguf');
      });

      it('no draft id (no per-target, no global pick) → no draft download attempt', async () => {
        modelStore.setSpeculativeEnabled(true);
        modelStore.setSelectedDraftModel(undefined);
        runInAction(() => {
          modelStore.models = [
            {
              id: 'a/b/t.gguf',
              filename: 't.gguf',
              isDownloaded: false,
              isLocal: false,
              origin: ModelOrigin.HF,
              author: 'a',
              repo: 'b',
              downloadUrl: 'https://huggingface.co/a/b/resolve/main/t.gguf',
            } as any,
          ];
        });

        await (modelStore as any)._downloadDraftModelIfNeeded(
          modelStore.models[0],
        );

        expect(downloadManager.startDownload as jest.Mock).not.toHaveBeenCalled();
      });

      it('a DRAFT model does not recurse into its own draft download', async () => {
        modelStore.setSpeculativeEnabled(true);
        modelStore.setSelectedDraftModel('user/global/dr.gguf');
        const draft = {
          id: 'user/global/dr.gguf',
          filename: 'dr.gguf',
          isDownloaded: false,
          isLocal: false,
          origin: ModelOrigin.HF,
          modelType: ModelType.DRAFT,
        } as any;
        runInAction(() => {
          modelStore.models = [draft];
        });

        await (modelStore as any)._downloadDraftModelIfNeeded(draft);

        expect(downloadManager.startDownload as jest.Mock).not.toHaveBeenCalled();
      });
    });

    describe('paired load through initContext (writer + crash guard)', () => {
      // A downloaded target paired with a downloaded draft drives the real
      // initContext → proceedWithInitialization path, the only writer of
      // activeDraftModelId and the only native-load entry point.
      const setupPairedDownloadedModels = () => {
        runInAction(() => {
          modelStore.models = [
            {
              ...basicModel,
              id: 'a/b/t.gguf',
              name: 'target',
              isDownloaded: true,
              isLocal: true,
              origin: ModelOrigin.LOCAL,
              fullPath: '/path/to/t.gguf',
              defaultDraftModel: 'c/d/dr.gguf',
            } as any,
            {
              ...basicModel,
              id: 'c/d/dr.gguf',
              name: 'draft',
              isDownloaded: true,
              isLocal: true,
              origin: ModelOrigin.LOCAL,
              fullPath: '/path/to/dr.gguf',
              modelType: ModelType.DRAFT,
            } as any,
          ];
          modelStore.context = undefined;
          modelStore.activeModelId = undefined;
          modelStore.isContextLoading = false;
          modelStore.modelLoadError = null;
        });
      };

      it('proceedWithInitialization writes activeDraftModelId when a paired draft loads', async () => {
        modelStore.setSpeculativeEnabled(true);
        setupPairedDownloadedModels();

        const {initLlama} = require('llama.rn');
        (initLlama as jest.Mock).mockReset();
        (initLlama as jest.Mock).mockResolvedValue({
          release: jest.fn(),
          isMultimodalEnabled: jest.fn().mockResolvedValue(false),
        });

        const target = modelStore.models.find(m => m.id === 'a/b/t.gguf')!;
        await modelStore.initContext(target);

        // Sole writer set the paired draft id alongside the active context.
        expect(modelStore.activeDraftModelId).toBe('c/d/dr.gguf');
        // And the draft path was forwarded to the single native-load entry.
        const params = (initLlama as jest.Mock).mock.calls[0][0];
        expect(params.model_draft).toBe('/path/to/dr.gguf');
        expect(params.is_model_draft_asset).toBe(false);
      });

      it('a draft-related init failure sets modelLoadError once and calls initLlama once — no auto-retry', async () => {
        modelStore.setSpeculativeEnabled(true);
        setupPairedDownloadedModels();

        const {initLlama} = require('llama.rn');
        (initLlama as jest.Mock).mockReset();
        (initLlama as jest.Mock).mockRejectedValue(
          new Error('draft init failed'),
        );

        const target = modelStore.models.find(m => m.id === 'a/b/t.gguf')!;
        await expect(modelStore.initContext(target)).rejects.toThrow();

        // Crash-loop guard: error surfaced exactly once, no auto-fallback
        // re-init, no auto-retry → initLlama invoked exactly once.
        expect(initLlama as jest.Mock).toHaveBeenCalledTimes(1);
        expect(modelStore.modelLoadError).not.toBeNull();
        // Failed load leaves no stale active draft.
        expect(modelStore.context).toBeUndefined();
      });
    });

    describe('activeDraftModelId reset at the main-context release path', () => {
      it('clears activeDraftModelId in the finally branch when a real context is released', async () => {
        const releasedCtx = {
          release: jest.fn().mockResolvedValue(undefined),
          stopCompletion: jest.fn().mockResolvedValue(undefined),
          isMultimodalEnabled: jest.fn().mockResolvedValue(false),
        };
        runInAction(() => {
          modelStore.activeDraftModelId = 'c/d/dr.gguf';
          modelStore.activeProjectionModelId = 'proj';
          modelStore.context = releasedCtx as any;
          modelStore.engine = {stopCompletion: jest.fn()} as any;
          modelStore.inferencing = false;
          modelStore.isStreaming = false;
        });

        await (modelStore as any)._releaseContextInternal(false);

        // The main-context release path (finally block) must clear the draft id
        // alongside the projection id, guarding against a stale-state reset
        // omission on switch/release.
        expect(releasedCtx.release).toHaveBeenCalled();
        expect(modelStore.activeDraftModelId).toBeUndefined();
        expect(modelStore.activeProjectionModelId).toBeUndefined();
      });
    });
  });
});
