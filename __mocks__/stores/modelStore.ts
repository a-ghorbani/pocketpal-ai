import {computed, makeAutoObservable} from 'mobx';

import {modelsList} from '../../jest/fixtures/models';

import {downloadManager} from '../services/downloads';

import {Model} from '../../src/utils/types';
import {LlamaContext} from '@pocketpalai/llama.rn';

class MockModelStore {
  models = modelsList;
  n_ctx = 1024;
  n_batch = 512;
  n_ubatch = 512;
  n_threads = 4;
  max_threads = 4;
  MIN_CONTEXT_SIZE = 200;
  useAutoRelease = true;
  useMetal = false;
  n_gpu_layers = 50;
  activeModelId: string | undefined;
  inferencing = false;
  isStreaming = false;
  context: LlamaContext | undefined = undefined;

  refreshDownloadStatuses: jest.Mock;
  addLocalModel: jest.Mock;
  setNContext: jest.Mock;
  updateUseAutoRelease: jest.Mock;
  updateUseMetal: jest.Mock;
  setNGPULayers: jest.Mock;
  resetModels: jest.Mock;
  initContext: jest.Mock;
  lastUsedModelId: any;
  checkSpaceAndDownload: jest.Mock;
  getDownloadProgress: jest.Mock;
  manualReleaseContext: jest.Mock;
  addHFModel: jest.Mock;
  downloadHFModel: jest.Mock;
  cancelDownload: jest.Mock;
  disableAutoRelease: jest.Mock;
  enableAutoRelease: jest.Mock;
  deleteModel: jest.Mock;
  removeModelFromList: jest.Mock;
  canDeleteProjectionModel: jest.Mock;
  setDefaultProjectionModel: jest.Mock;
  isContextLoading: boolean = false;
  loadingModel: Model | undefined;

  constructor() {
    makeAutoObservable(this, {
      refreshDownloadStatuses: false,
      addLocalModel: false,
      setNContext: false,
      updateUseAutoRelease: false,
      updateUseMetal: false,
      setNGPULayers: false,
      resetModels: false,
      initContext: false,
      checkSpaceAndDownload: false,
      getDownloadProgress: false,
      manualReleaseContext: false,
      addHFModel: false,
      downloadHFModel: false,
      cancelDownload: false,
      disableAutoRelease: false,
      enableAutoRelease: false,
      deleteModel: false,
      removeModelFromList: false,
      canDeleteProjectionModel: false,
      setDefaultProjectionModel: false,
      lastUsedModel: computed,
      activeModel: computed,
      displayModels: computed,
      availableModels: computed,
      isDownloading: computed,
    });
    this.refreshDownloadStatuses = jest.fn();
    this.addLocalModel = jest.fn();
    this.setNContext = jest.fn();
    this.updateUseAutoRelease = jest.fn();
    this.updateUseMetal = jest.fn();
    this.setNGPULayers = jest.fn();
    this.resetModels = jest.fn();
    this.initContext = jest.fn().mockResolvedValue(Promise.resolve());
    this.checkSpaceAndDownload = jest.fn();
    this.getDownloadProgress = jest.fn();
    this.manualReleaseContext = jest.fn();
    this.addHFModel = jest.fn();
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

  get displayModels(): Model[] {
    // Filter out projection models for display purposes
    return this.models.filter(model => model.modelType !== 'projection');
  }

  get availableModels() {
    return this.models.filter(model => model.isDownloaded);
  }

  isModelAvailable(modelId: string) {
    return this.availableModels.some(model => model.id === modelId);
  }

  async isMultimodalEnabled(): Promise<boolean> {
    // Mock implementation - return false by default for tests
    return false;
  }

  async getModelFullPath(model: Model): Promise<string> {
    // Mock implementation - return a simple path for tests
    return `/mock/path/${model.filename || model.name}`;
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
