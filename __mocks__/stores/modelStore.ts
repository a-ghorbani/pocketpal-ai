import {computed, makeAutoObservable, observable} from 'mobx';

import {modelsList} from '../../jest/fixtures/models';

import {downloadManager} from '../services/downloads';
import {mockServerStore} from './serverStore';

import {
  Model,
  ContextInitParams,
  RemoteSessionBinding,
} from '../../src/utils/types';
import {LlamaContext} from 'llama.rn';
import {CompletionEngine} from '../../src/utils/completionTypes';
import {createDefaultContextInitParams} from '../../src/utils/contextInitParamsVersions';
import {
  draftCacheDefaults,
  effectiveDraftModeOf,
} from '../../src/store/draftResolution';
import {resolveModelCaps} from '../../src/utils/modelCaps';
import type {
  CapabilityEnv,
  ModelCapabilityView,
} from '../../src/utils/modelCaps';

class MockModelStore {
  models = modelsList;
  contextInitParams: ContextInitParams = createDefaultContextInitParams();
  max_threads = 4;
  MIN_CONTEXT_SIZE = 200;
  useAutoRelease = true;
  activeModelId: string | undefined;
  inferencing = false;
  isStreaming = false;
  context: LlamaContext | undefined = undefined;
  engine: CompletionEngine | undefined = undefined;
  isMultimodalActive: boolean = false;
  activeContextSettings: ContextInitParams | undefined = undefined;
  activeRemoteBinding: RemoteSessionBinding | undefined = undefined;

  // Memory calibration variables
  availableMemoryCeiling: number | undefined = 5 * 1e9; // 5GB ceiling
  largestSuccessfulLoad: number | undefined = 4 * 1e9; // 4GB largest successful load

  refreshDownloadStatuses: jest.Mock;
  addLocalModel: jest.Mock;
  removeModelByFullPath: jest.Mock;
  setNContext: jest.Mock;
  updateUseAutoRelease: jest.Mock;
  setNoGpuDevices: jest.Mock;
  setDevices: jest.Mock;
  setFlashAttnType: jest.Mock;
  setNGPULayers: jest.Mock;
  resetModels: jest.Mock;
  initContext: jest.Mock;
  selectModel: jest.Mock;
  setRemoteModel: jest.Mock;
  lastUsedModelId: any;
  checkSpaceAndDownload: jest.Mock;
  getDownloadProgress: jest.Mock;
  manualReleaseContext: jest.Mock;
  addHFModel: jest.Mock;
  registerOnboardingPalModel: jest.Mock;
  downloadHFModel: jest.Mock;
  cancelDownload: jest.Mock;
  disableAutoRelease: jest.Mock;
  enableAutoRelease: jest.Mock;
  deleteModel: jest.Mock;
  removeModelFromList: jest.Mock;
  canDeleteProjectionModel: jest.Mock;
  setDefaultProjectionModel: jest.Mock;
  updateModelChatTemplate: jest.Mock;
  resetModelChatTemplate: jest.Mock;
  updateModelStopWords: jest.Mock;
  resetModelStopWords: jest.Mock;
  updateModelName: jest.Mock;
  resetModelName: jest.Mock;
  setImageMaxTokens: jest.Mock;
  setNThreads: jest.Mock;
  setNBatch: jest.Mock;
  setNUBatch: jest.Mock;
  setCacheTypeK: jest.Mock;
  setCacheTypeV: jest.Mock;
  setUseMlock: jest.Mock;
  setUseMmap: jest.Mock;
  setNoExtraBufts: jest.Mock;
  setSpeculativeEnabled: jest.Mock;
  setSelectedDraftModel: jest.Mock;
  setSpecDraftNGpuLayers: jest.Mock;
  setSpecDraftCacheTypeK: jest.Mock;
  setSpecDraftCacheTypeV: jest.Mock;
  enterBenchmarkMode: jest.Mock;
  exitBenchmarkMode: jest.Mock;
  recordReasoningObserved: jest.Mock;
  setReasoningOverride: jest.Mock;
  benchmarkActive: boolean = false;
  isContextLoading: boolean = false;
  loadingModel: Model | undefined;

  constructor() {
    makeAutoObservable(this, {
      engine: observable.ref,
      refreshDownloadStatuses: false,
      addLocalModel: false,
      removeModelByFullPath: false,
      setNContext: false,
      updateUseAutoRelease: false,

      setNGPULayers: false,
      resetModels: false,
      initContext: false,
      selectModel: false,
      setRemoteModel: false,
      checkSpaceAndDownload: false,
      getDownloadProgress: false,
      manualReleaseContext: false,
      addHFModel: false,
      registerOnboardingPalModel: false,
      downloadHFModel: false,
      cancelDownload: false,
      disableAutoRelease: false,
      enableAutoRelease: false,
      deleteModel: false,
      removeModelFromList: false,
      canDeleteProjectionModel: false,
      setDefaultProjectionModel: false,
      updateModelChatTemplate: false,
      resetModelChatTemplate: false,
      updateModelStopWords: false,
      resetModelStopWords: false,
      updateModelName: false,
      resetModelName: false,
      setImageMaxTokens: false,
      setNThreads: false,
      setNBatch: false,
      setNUBatch: false,
      setCacheTypeK: false,
      setCacheTypeV: false,
      setUseMlock: false,
      setUseMmap: false,
      setNoExtraBufts: false,
      setSpeculativeEnabled: false,
      setSelectedDraftModel: false,
      setSpecDraftNGpuLayers: false,
      setSpecDraftCacheTypeK: false,
      setSpecDraftCacheTypeV: false,
      enterBenchmarkMode: false,
      exitBenchmarkMode: false,
      recordReasoningObserved: false,
      setReasoningOverride: false,
      contextId: computed,
      lastUsedModel: computed,
      activeModel: computed,
      activeModelCaps: computed,
      displayModels: computed,
      availableModels: computed,
      effectiveDraftMode: computed,
      effectiveDraftCacheDefaults: computed,
      isDownloading: computed,
      activeDownloads: computed,
    });
    this.refreshDownloadStatuses = jest.fn();
    this.addLocalModel = jest.fn();
    this.removeModelByFullPath = jest.fn();
    this.setNContext = jest.fn();
    this.updateUseAutoRelease = jest.fn();
    this.setNoGpuDevices = jest.fn();
    this.setDevices = jest.fn();
    this.setFlashAttnType = jest.fn();
    this.setNGPULayers = jest.fn();
    this.resetModels = jest.fn();
    this.initContext = jest.fn().mockResolvedValue(Promise.resolve());
    this.selectModel = jest.fn().mockResolvedValue(Promise.resolve());
    this.setRemoteModel = jest.fn().mockResolvedValue(Promise.resolve());
    this.checkSpaceAndDownload = jest.fn().mockResolvedValue(undefined);
    this.getDownloadProgress = jest.fn();
    this.manualReleaseContext = jest.fn();
    this.addHFModel = jest.fn();
    this.registerOnboardingPalModel = jest.fn().mockImplementation(
      async (entry: {
        repo: string;
        filename: string;
        displayName: string;
        sizeBytes: number;
        params: number;
      }) =>
        ({
          id: `${entry.repo}/${entry.filename}`,
          name: entry.displayName,
          size: entry.sizeBytes,
          params: entry.params,
          origin: 'HF',
          isDownloaded: false,
        }) as any,
    );
    this.downloadHFModel = jest.fn();
    this.cancelDownload = jest.fn();
    this.disableAutoRelease = jest.fn();
    this.enableAutoRelease = jest.fn();
    this.deleteModel = jest.fn().mockResolvedValue(Promise.resolve());
    this.removeModelFromList = jest.fn();
    this.canDeleteProjectionModel = jest.fn().mockReturnValue({
      canDelete: true,
      reason: null,
      dependentModels: [],
    });
    this.setDefaultProjectionModel = jest.fn();
    this.updateModelChatTemplate = jest.fn();
    this.resetModelChatTemplate = jest.fn();
    this.updateModelStopWords = jest.fn();
    this.resetModelStopWords = jest.fn();
    this.updateModelName = jest.fn();
    this.resetModelName = jest.fn();
    this.setImageMaxTokens = jest.fn();
    this.setNThreads = jest.fn();
    this.setNBatch = jest.fn();
    this.setNUBatch = jest.fn();
    this.setCacheTypeK = jest.fn();
    this.setCacheTypeV = jest.fn();
    this.setUseMlock = jest.fn();
    this.setUseMmap = jest.fn();
    this.setNoExtraBufts = jest.fn();
    this.setSpeculativeEnabled = jest.fn();
    this.setSelectedDraftModel = jest.fn();
    this.setSpecDraftNGpuLayers = jest.fn();
    this.setSpecDraftCacheTypeK = jest.fn();
    this.setSpecDraftCacheTypeV = jest.fn();
    this.enterBenchmarkMode = jest.fn().mockResolvedValue(undefined);
    this.exitBenchmarkMode = jest.fn();
    this.recordReasoningObserved = jest.fn();
    // Mirror the real writer so tests exercise the live override → resolver →
    // pill reactive chain. Local ids mutate Model.reasoning on the observable
    // model; remote ids route to ServerStore (kept as a spy fallback here).
    this.setReasoningOverride = jest.fn((modelId: string, cap: any) => {
      const localModel = this.models.find(m => m.id === modelId);
      if (!localModel) {
        return;
      }
      localModel.reasoning = cap;
      localModel.supportsThinking = cap.isReasoning === 'yes';
    });
  }

  setActiveModel = (modelId: string) => {
    this.activeModelId = modelId;
  };

  setInferencing = (value: boolean) => {
    this.inferencing = value;
  };

  setIsStreaming = (value: boolean) => {
    this.isStreaming = value;
  };

  // Safe context release methods
  registerCompletionPromise = jest.fn();
  clearCompletionPromise = jest.fn();

  get contextId(): string | undefined {
    if (this.context) {
      return String(this.context.id);
    }
    return undefined;
  }

  get lastUsedModel(): Model | undefined {
    return this.lastUsedModelId
      ? this.models.find(m => m.id === this.lastUsedModelId)
      : undefined;
  }

  get isDownloading() {
    return (modelId: string) => {
      return downloadManager.isDownloading(modelId);
    };
  }

  get activeModel() {
    return this.models.find(model => model.id === this.activeModelId);
  }

  // Delegates to the real resolver over the live mock stores rather than
  // returning a fixed answer, so consumer suites exercise the actual
  // capability chain and stay reactive to store mutations.
  private get capabilityEnv(): CapabilityEnv {
    return {
      remoteCaps: mockServerStore.remoteCaps,
      listCaps: mockServerStore.listCaps,
      binding: this.activeRemoteBinding,
      isMultimodalActive: this.isMultimodalActive,
      activeContextSettings: this.activeContextSettings,
      activeModelId: this.activeModelId,
    };
  }

  capsFor = (model: Model | undefined): ModelCapabilityView =>
    resolveModelCaps(model, this.capabilityEnv);

  get activeModelCaps(): ModelCapabilityView {
    return this.capsFor(this.activeModel);
  }

  get displayModels(): Model[] {
    // Filter out projection models for display purposes
    return this.models.filter(model => model.modelType !== 'projection');
  }

  get activeDownloads() {
    return [];
  }

  get availableModels() {
    return this.models.filter(model => model.isDownloaded);
  }

  get effectiveDraftMode() {
    return effectiveDraftModeOf(this);
  }

  get effectiveDraftCacheDefaults() {
    return draftCacheDefaults(
      this.effectiveDraftMode,
      this.contextInitParams.flash_attn_type === 'on',
    );
  }

  isModelAvailable(modelId: string) {
    return this.availableModels.some(model => model.id === modelId);
  }

  async getModelFullPath(model: Model): Promise<string> {
    // Mock implementation - return a simple path for tests
    return `/mock/path/${model.filename || model.name}`;
  }

  async getEffectiveContextInitParams(
    _filePath: string,
  ): Promise<Record<string, unknown>> {
    // Mock returns the current contextInitParams as the resolved view.
    // Tests can spy on this if they need to assert what got passed to
    // initLlama.
    return JSON.parse(JSON.stringify(this.contextInitParams));
  }

  getCompatibleProjectionModels = jest.fn().mockReturnValue([]);
  hasRequiredProjectionModel = jest.fn().mockReturnValue(true);
  getProjectionModelStatus = jest.fn().mockReturnValue({
    isAvailable: true,
    state: 'not_needed',
  });
  getModelVisionPreference = jest.fn().mockReturnValue(true);
  setModelVisionEnabled = jest.fn().mockResolvedValue(undefined);
  getDownloadedLLMsUsingProjectionModel = jest.fn().mockReturnValue([]);
}

export const mockModelStore = new MockModelStore();
