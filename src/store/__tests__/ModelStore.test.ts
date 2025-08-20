jest.unmock('../../store');
import {runInAction} from 'mobx';
import {LlamaContext} from '@pocketpalai/llama.rn';
import {Alert} from 'react-native';

import {defaultModels} from '../defaultModels';

import {downloadManager} from '../../services/downloads';

import {ModelOrigin, ModelType} from '../../utils/types';
import {
  basicModel,
  mockContextModel,
  mockHFModel1,
} from '../../../jest/fixtures/models';
import * as RNFS from '@dr.pogodin/react-native-fs';

import {modelStore, uiStore} from '..';

// Mock the HF API
jest.mock('../../api/hf', () => ({
  fetchModelFilesDetails: jest.fn(),
}));

// Mock the download manager
jest.mock('../../services/downloads', () => ({
  downloadManager: {
    isDownloading: jest.fn(),
    startDownload: jest.fn(),
    cancelDownload: jest.fn(),
    setCallbacks: jest.fn(),
    syncWithActiveDownloads: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock the HF store
// jest.mock('../HFStore', () => ({
//   hfStore: {
//     shouldUseToken: true,
//     hfToken: 'test-token',
//   },
// }));

// RNFS is mocked globally in jest/setup.ts

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
    it('should add missing default models to the existing model list', () => {
      modelStore.models = []; // Start with no existing models

      runInAction(() => {
        modelStore.mergeModelLists();
      });

      expect(modelStore.models.length).toBeGreaterThan(0);
      expect(modelStore.models).toEqual(expect.arrayContaining(defaultModels));
    });

    it('should merge existing models with default models, adding any that are missing', () => {
      const notExistedModel = defaultModels[0];
      modelStore.models = defaultModels.slice(1); // Start with all but the first model, so we can test if it's added back
      expect(modelStore.models.length).toBe(defaultModels.length - 1);
      expect(modelStore.models).not.toContainEqual(notExistedModel);

      runInAction(() => {
        modelStore.mergeModelLists();
      });

      expect(modelStore.models.length).toBeGreaterThan(0);
      expect(modelStore.models).toContainEqual(notExistedModel);
    });

    it('should retain value of existing variables while merging new variables', () => {
      const newDefaultModel = defaultModels[0];

      // Apply changes to the existing model:
      //  - chatTemplate.template: existing variable with a value different from the default
      //  - stopWords: existing array with custom values
      const existingModel = {
        ...newDefaultModel,
        chatTemplate: {
          ...newDefaultModel.chatTemplate,
          template: 'existing',
        },
        stopWords: ['custom_stop_1', 'custom_stop_2'],
        isDownloaded: true, // if not downloaded, it will be removed
      };

      modelStore.models[0] = existingModel;

      runInAction(() => {
        modelStore.mergeModelLists();
      });

      expect(modelStore.models[0].chatTemplate).toEqual(
        expect.objectContaining({
          template: 'existing', // Existing value should remain
        }),
      );

      // Custom stop words should be preserved
      expect(modelStore.models[0].stopWords).toEqual([
        'custom_stop_1',
        'custom_stop_2',
        ...(newDefaultModel.stopWords || []),
      ]);
    });

    it('should merge value of default to exisiting for top level variables', () => {
      const newDefaultModel = defaultModels[0];

      const existingModel = {
        ...newDefaultModel,
        params: 101010,
      };

      modelStore.models[0] = existingModel;

      runInAction(() => {
        modelStore.mergeModelLists();
      });

      expect(modelStore.models[0].params).toEqual(newDefaultModel.params);
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
      const model = defaultModels[0];
      modelStore.models = [model];
      modelStore.activeModelId = model.id;

      await modelStore.deleteModel(model);
      // await when(() => modelStore.activeModelId === undefined); // wait for mobx to propagate changes

      expect(modelStore.activeModelId).toBeUndefined();
      expect(modelStore.context).toBeUndefined();
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
        ...defaultModels[0],
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
        ...defaultModels[0],
        id: 'test-proj-model',
        modelType: ModelType.PROJECTION,
        isDownloaded: true,
      };

      modelStore.context = new LlamaContext({
        contextId: 1,
        gpu: false,
        reasonNoGPU: '',
        model: mockContextModel,
      });
      modelStore.models = [projModel];
      modelStore.activeProjectionModelId = projModel.id;

      const result = modelStore.canDeleteProjectionModel(projModel.id);
      expect(result.canDelete).toBe(false);
      expect(result.reason).toBe('Projection model is currently active');
    });

    it('should allow deletion of projection model used by downloaded LLM with warning', () => {
      const projModel = {
        ...defaultModels[0],
        id: 'test-proj-model',
        modelType: ModelType.PROJECTION,
        isDownloaded: true,
      };

      const llmModel = {
        ...defaultModels[0],
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
        ...defaultModels[0],
        id: 'test-proj-model',
        modelType: ModelType.PROJECTION,
        isDownloaded: true,
      };

      const llmModel = {
        ...defaultModels[0],
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
        ...defaultModels[0],
        id: 'test-proj-model',
        modelType: ModelType.PROJECTION,
        isDownloaded: true,
      };

      const llmModel1 = {
        ...defaultModels[0],
        id: 'test-llm-model-1',
        supportsMultimodal: true,
        defaultProjectionModel: projModel.id,
        isDownloaded: true,
      };

      const llmModel2 = {
        ...defaultModels[0],
        id: 'test-llm-model-2',
        supportsMultimodal: true,
        defaultProjectionModel: projModel.id,
        isDownloaded: false,
      };

      const unrelatedModel = {
        ...defaultModels[0],
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
      const projModel = {
        ...defaultModels[0],
        id: 'test-proj-model',
        modelType: ModelType.PROJECTION,
        isDownloaded: true,
      };

      const llmModel = {
        ...defaultModels[0],
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
        ...defaultModels[0],
        id: 'test-proj-model',
        modelType: ModelType.PROJECTION,
        isDownloaded: true,
      };

      const llmModel1 = {
        ...defaultModels[0],
        id: 'test-llm-model-1',
        supportsMultimodal: true,
        defaultProjectionModel: projModel.id,
        isDownloaded: true,
      };

      const llmModel2 = {
        ...defaultModels[0],
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
        ...defaultModels[0],
        id: 'test-proj-model-1',
        modelType: ModelType.PROJECTION,
        isDownloaded: true,
      };

      const projModel2 = {
        ...defaultModels[0],
        id: 'test-proj-model-2',
        modelType: ModelType.PROJECTION,
        isDownloaded: true,
      };

      const llmModel = {
        ...defaultModels[0],
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
        ...defaultModels[0],
        id: 'test-proj-model-1',
        modelType: ModelType.PROJECTION,
        isDownloaded: true,
        fullPath: '/path/to/proj-model-1.gguf', // Unique path
        isLocal: true,
        origin: ModelOrigin.LOCAL,
      };

      const projModel2 = {
        ...defaultModels[0],
        id: 'test-proj-model-2',
        modelType: ModelType.PROJECTION,
        isDownloaded: true,
        fullPath: '/path/to/proj-model-2.gguf', // Unique path
        isLocal: true,
        origin: ModelOrigin.LOCAL,
      };

      const llmModel1 = {
        ...defaultModels[0],
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
        ...defaultModels[0],
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
        ...defaultModels[0],
        id: 'test-proj-model',
        modelType: ModelType.PROJECTION,
        isDownloaded: true,
        fullPath: '/path/to/test-proj-model.gguf', // Unique path
        isLocal: true,
        origin: ModelOrigin.LOCAL,
      };

      const llmModel = {
        ...defaultModels[0],
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
      const model = {...defaultModels[0], isDownloaded: true}; // Ensure model is downloaded
      modelStore.models = [model];
      modelStore.activeModelId = model.id;

      // Set up the auto-release state to simulate that the model was auto-released
      modelStore.wasAutoReleased = true;
      modelStore.lastAutoReleasedModelId = model.id;

      const mockInitContext = jest.fn().mockResolvedValue(
        new LlamaContext({
          contextId: 1,
          gpu: false,
          reasonNoGPU: '',
          model: mockContextModel,
        }),
      );
      modelStore.initContext = mockInitContext;

      // Simulate coming to foreground
      modelStore.appState = 'background';
      await modelStore.handleAppStateChange('active');

      expect(mockInitContext).toHaveBeenCalledWith(model);
    });
  });

  describe('settings management', () => {
    it('should update stop words', () => {
      const model = {...defaultModels[0]};
      modelStore.models = [model];

      const newStopWords = ['stop1', 'stop2'];

      modelStore.updateModelStopWords(model.id, newStopWords);

      expect(modelStore.models[0].stopWords).toEqual(newStopWords);
    });

    it('should reset model stop words to defaults', () => {
      const model = {...defaultModels[0]};
      const originalStopWords = [...(model.defaultStopWords || [])];
      model.stopWords = ['custom1', 'custom2'];
      modelStore.models = [model];

      modelStore.resetModelStopWords(model.id);

      expect(modelStore.models[0].stopWords).toEqual(originalStopWords);
    });
  });

  describe('download management', () => {
    it('should handle download cancellation', async () => {
      const model = defaultModels[0];
      modelStore.models = [model];

      // Mock isDownloading to return true initially
      (downloadManager.isDownloading as jest.Mock).mockReturnValue(true);

      await modelStore.cancelDownload(model.id);

      expect(downloadManager.cancelDownload).toHaveBeenCalledWith(model.id);
      expect(model.isDownloaded).toBeFalsy();
      expect(model.progress).toBe(0);
    });

    it('should update model state on download error', () => {
      const model = defaultModels[0];
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

    it('should handle download failure due to insufficient space', async () => {
      const model = {
        ...defaultModels[0],
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
    });
  });

  describe('computed properties', () => {
    it('should return correct active model', () => {
      const model = defaultModels[0];
      modelStore.models = [model];
      modelStore.activeModelId = model.id;

      expect(modelStore.activeModel).toEqual(model);
    });

    it('should return correct last used model', () => {
      const model = {...defaultModels[0], isDownloaded: true};
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
      expect(downloadManager.startDownload).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test/hf-model/model-01.gguf',
          type: 'hf',
          author: 'test',
        }),
        expect.stringContaining(
          '/path/to/documents/models/hf/test/model-01.gguf',
        ),
        'mockPass',
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
        uiStore.l10n.errors.downloadSetupFailedMessage.replace(
          '{message}',
          'Mock error',
        ),
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

    it('should reset models while preserving local and HF models', () => {
      // Spy on mergeModelLists
      const mockMergeModelLists = jest.fn();
      const originalMergeModelLists = modelStore.mergeModelLists;
      modelStore.mergeModelLists = mockMergeModelLists;

      modelStore.resetModels();

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
    it('should update useMetal setting', () => {
      modelStore.useMetal = false;

      modelStore.updateUseMetal(true);

      expect(modelStore.useMetal).toBe(true);
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
      expect(modelStore.n_threads).toBe(8);
    });

    it('should set flash attention and reset cache types when disabled', () => {
      // Enable flash attention first
      modelStore.setFlashAttn(true);
      expect(modelStore.flash_attn).toBe(true);

      // Disable flash attention - should reset cache types
      modelStore.setFlashAttn(false);
      expect(modelStore.flash_attn).toBe(false);
      expect(modelStore.cache_type_k).toBe('f16');
      expect(modelStore.cache_type_v).toBe('f16');
    });

    it('should set cache type K only when flash attention is enabled', () => {
      // Disable flash attention
      modelStore.setFlashAttn(false);
      modelStore.setCacheTypeK('q8_0' as any);
      expect(modelStore.cache_type_k).toBe('f16'); // Should not change

      // Enable flash attention
      modelStore.setFlashAttn(true);
      modelStore.setCacheTypeK('q8_0' as any);
      expect(modelStore.cache_type_k).toBe('q8_0'); // Should change
    });

    it('should set cache type V only when flash attention is enabled', () => {
      // Disable flash attention
      modelStore.setFlashAttn(false);
      modelStore.setCacheTypeV('q8_0' as any);
      expect(modelStore.cache_type_v).toBe('f16'); // Should not change

      // Enable flash attention
      modelStore.setFlashAttn(true);
      modelStore.setCacheTypeV('q8_0' as any);
      expect(modelStore.cache_type_v).toBe('q8_0'); // Should change
    });

    it('should set n_batch', () => {
      modelStore.setNBatch(256);
      expect(modelStore.n_batch).toBe(256);
    });

    it('should set n_ubatch', () => {
      modelStore.setNUBatch(128);
      expect(modelStore.n_ubatch).toBe(128);
    });

    it('should set n_ctx', () => {
      modelStore.setNContext(2048);
      expect(modelStore.n_ctx).toBe(2048);
    });

    it('should get effective values respecting constraints', () => {
      modelStore.setNContext(1024);
      modelStore.setNBatch(2048); // Larger than context
      modelStore.setNUBatch(1024); // Larger than effective batch

      const effective = modelStore.getEffectiveValues();
      expect(effective.n_ctx).toBe(1024);
      expect(effective.n_batch).toBe(1024); // Clamped to context
      expect(effective.n_ubatch).toBe(1024); // Clamped to effective batch
    });

    it('should set n_gpu_layers', () => {
      modelStore.setNGPULayers(25);
      expect(modelStore.n_gpu_layers).toBe(25);
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

      // Mock RNFS.exists to return false for old path
      (RNFS.exists as jest.Mock).mockResolvedValue(false);

      const path = await modelStore.getModelFullPath(presetModel as any);
      expect(path).toContain('/models/preset/test-author/model.gguf');
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

    it('should handle error when checking old path for preset model', async () => {
      const presetModel = {
        origin: ModelOrigin.PRESET,
        filename: 'model.gguf',
        author: 'test-author',
      };

      // Mock RNFS.exists to throw error for old path
      (RNFS.exists as jest.Mock).mockRejectedValue(
        new Error('File system error'),
      );

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      const path = await modelStore.getModelFullPath(presetModel as any);
      expect(path).toContain('/models/preset/test-author/model.gguf');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Error checking old path:',
        expect.any(Error),
      );

      consoleLogSpy.mockRestore();
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
        ...defaultModels[0],
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
        ...defaultModels[0],
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
        ...defaultModels[0],
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
        ...defaultModels[0],
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
        ...defaultModels[0],
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
        ...defaultModels[0],
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
        ...defaultModels[0],
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
        ...defaultModels[0],
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
        ...defaultModels[0],
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
        ...defaultModels[0],
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
        ...defaultModels[0],
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
        ...defaultModels[0],
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
        ...defaultModels[0],
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
        ...defaultModels[0],
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
        ...defaultModels[0],
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
});
