import {
  AppState,
  AppStateStatus,
  Platform,
  NativeModules,
  Alert,
} from 'react-native';

import {v4 as uuidv4} from 'uuid';
import 'react-native-get-random-values';
import {makePersistable} from 'mobx-persist-store';
import * as RNFS from '@dr.pogodin/react-native-fs';
import {computed, makeAutoObservable, runInAction, toJS} from 'mobx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {LlamaContext, initLlama} from '@pocketpalai/llama.rn';
import {
  CompletionParams,
  toApiCompletionParams,
} from '../utils/completionTypes';

import {fetchModelFilesDetails} from '../api/hf';

import {uiStore, hfStore} from '.';
import {chatSessionStore} from './ChatSessionStore';
import {
  deepMerge,
  getSHA256Hash,
  hfAsModel,
  getMmprojFiles,
  filterProjectionModels,
} from '../utils';
import {getRecommendedProjectionModel} from '../utils/multimodalHelpers';
import {defaultModels, MODEL_LIST_VERSION} from './defaultModels';

import {downloadManager} from '../services/downloads';

import {
  getHFDefaultSettings,
  getLocalModelDefaultSettings,
  stops,
} from '../utils/chat';
import {
  CacheType,
  ChatTemplateConfig,
  HuggingFaceModel,
  Model,
  ModelFile,
  ModelOrigin,
  ModelType,
} from '../utils/types';

import {ErrorState, createErrorState} from '../utils/errors';
import {chatSessionRepository} from '../repositories/ChatSessionRepository';
import {hasEnoughMemory, isHighEndDevice} from '../hooks/useMemoryCheck';
import {supportsThinking} from '../utils/thinkingCapabilityDetection';
import {resolveUseMmap} from '../utils/memorySettings';

class ModelStore {
  models: Model[] = [];
  version: number | undefined = undefined; // Persisted version

  /**
   * Returns models with projection models filtered out for display purposes
   */
  get displayModels(): Model[] {
    return filterProjectionModels(this.models);
  }

  appState: AppStateStatus = AppState.currentState;
  useAutoRelease: boolean = true;
  isContextLoading: boolean = false;
  loadingModel: Model | undefined = undefined;
  n_ctx: number = 1024;
  n_gpu_layers: number = 50;
  n_threads: number = 4;
  max_threads: number = 4; // Will be set in constructor
  flash_attn: boolean = false;
  cache_type_k: CacheType = CacheType.F16;
  cache_type_v: CacheType = CacheType.F16;
  n_batch: number = 512;
  n_ubatch: number = 512;

  // Memory settings
  use_mlock: boolean = false;
  use_mmap: 'true' | 'false' | 'smart' =
    Platform.OS === 'android' ? 'smart' : 'true';

  activeModelId: string | undefined = undefined;

  // Flag to track if multimodal is currently active
  isMultimodalActive: boolean = false;
  activeProjectionModelId: string | undefined = undefined;

  // Track initialization settings for the active context
  activeContextSettings:
    | {
        n_ctx: number;
        n_batch: number;
        n_ubatch: number;
        n_threads: number;
        flash_attn: boolean;
        cache_type_k: CacheType;
        cache_type_v: CacheType;
        n_gpu_layers: number;
        use_mlock: boolean;
        use_mmap: boolean;
      }
    | undefined = undefined;

  context: LlamaContext | undefined = undefined;
  useMetal = false; //Platform.OS === 'ios';

  lastUsedModelId: string | undefined = undefined;

  // Auto-release tracking (persistent)
  wasAutoReleased: boolean = false;
  lastAutoReleasedModelId: string | undefined = undefined;

  // System UI protection (runtime)
  private autoReleaseDisabledReasons = new Set<string>();

  MIN_CONTEXT_SIZE = 200;

  inferencing: boolean = false;
  isStreaming: boolean = false;

  downloadError: ErrorState | null = null;

  constructor() {
    makeAutoObservable(this, {activeModel: computed});
    this.initializeThreadCount();
    makePersistable(this, {
      name: 'ModelStore',
      properties: [
        'models',
        'version',
        'useAutoRelease',
        'n_gpu_layers',
        'useMetal',
        'n_ctx',
        'n_threads',
        'flash_attn',
        'cache_type_k',
        'cache_type_v',
        'n_batch',
        'n_ubatch',
        'use_mlock',
        'use_mmap',
        'lastUsedModelId',
        'wasAutoReleased',
        'lastAutoReleasedModelId',
      ],
      storage: AsyncStorage,
    }).then(() => {
      this.initializeStore();
    });

    this.setupAppStateListener();

    // Set up download manager callbacks
    downloadManager.setCallbacks({
      onProgress: (modelId, progress) => {
        const model = this.models.find(m => m.id === modelId);
        if (model) {
          runInAction(() => {
            model.progress = progress.progress;
            model.downloadSpeed = `${progress.speed} ${uiStore.l10n.common.downloadETA}: ${progress.eta}`;
          });
        }
      },
      onComplete: modelId => {
        const model = this.models.find(m => m.id === modelId);
        if (model) {
          runInAction(() => {
            model.progress = 100;
            model.isDownloaded = true;
          });
        }
      },
      onError: (modelId, error) => {
        console.error('Download error for model', modelId, error);
        const model = this.models.find(m => m.id === modelId);
        if (model) {
          runInAction(() => {
            model.progress = 0;
            model.isDownloaded = false;
          });
        }

        const errorState = createErrorState(error, 'download', 'huggingface', {
          modelId,
        });

        runInAction(() => {
          this.downloadError = errorState;
        });
      },
    });
  }

  private async initializeThreadCount() {
    try {
      const {DeviceInfoModule} = NativeModules;
      const info = await DeviceInfoModule.getCPUInfo();
      const cores = info.cores;
      this.max_threads = cores;

      // Set n_threads to 80% of cores or number of cores if 4 or less
      if (cores <= 4) {
        runInAction(() => {
          this.n_threads = cores;
        });
      } else {
        runInAction(() => {
          this.n_threads = Math.floor(cores * 0.8);
        });
      }
    } catch (error) {
      console.error('Failed to get CPU info:', error);
      // Fallback to 4 threads if we can't get the CPU info
      runInAction(() => {
        this.max_threads = 4;
        this.n_threads = 4;
      });
    }
  }

  setNThreads = (n_threads: number) => {
    runInAction(() => {
      this.n_threads = n_threads;
    });
  };

  setFlashAttn = (flash_attn: boolean) => {
    runInAction(() => {
      this.flash_attn = flash_attn;
      // Reset cache types to F16 if flash attention is disabled
      if (!flash_attn) {
        this.cache_type_k = CacheType.F16;
        this.cache_type_v = CacheType.F16;
      }
    });
  };

  setCacheTypeK = (cache_type: CacheType) => {
    runInAction(() => {
      // Only allow changing cache type if flash attention is enabled
      if (this.flash_attn) {
        this.cache_type_k = cache_type;
      }
    });
  };

  setCacheTypeV = (cache_type: CacheType) => {
    runInAction(() => {
      // Only allow changing cache type if flash attention is enabled
      if (this.flash_attn) {
        this.cache_type_v = cache_type;
      }
    });
  };

  setNBatch = (n_batch: number) => {
    runInAction(() => {
      this.n_batch = n_batch;
    });
  };

  setNUBatch = (n_ubatch: number) => {
    runInAction(() => {
      this.n_ubatch = n_ubatch;
    });
  };

  setNContext = (n_ctx: number) => {
    runInAction(() => {
      this.n_ctx = n_ctx;
    });
  };

  setUseMlock = (use_mlock: boolean) => {
    runInAction(() => {
      this.use_mlock = use_mlock;
    });
  };

  setUseMmap = (use_mmap: 'true' | 'false' | 'smart') => {
    runInAction(() => {
      this.use_mmap = use_mmap;
    });
  };

  // Helper method to get effective values respecting constraints
  getEffectiveValues = () => {
    const effectiveContext = this.n_ctx;
    const effectiveBatch = Math.min(this.n_batch, effectiveContext);
    const effectiveUBatch = Math.min(this.n_ubatch, effectiveBatch);

    return {
      n_ctx: effectiveContext,
      n_batch: effectiveBatch,
      n_ubatch: effectiveUBatch,
    };
  };

  initializeStore = async () => {
    const storedVersion = this.version || 0;

    // Sync download manager with active downloads
    await downloadManager.syncWithActiveDownloads(this.models);

    if (storedVersion < MODEL_LIST_VERSION) {
      this.mergeModelLists();
      runInAction(() => {
        this.version = MODEL_LIST_VERSION;
      });
    } else {
      await this.initializeDownloadStatus();
      this.removeInvalidLocalModels();
    }

    this.initializeUseMetal();

    // Check if we need to reload an auto-released model (for app restarts)
    this.checkAndReloadAutoReleasedModel();
  };

  mergeModelLists = () => {
    // Start with persisted models, but filter out non-downloaded preset models
    const mergedModels = [...this.models].filter(
      model => model.origin !== ModelOrigin.PRESET || model.isDownloaded,
    );

    // Handle PRESET models using defaultModels as reference
    defaultModels.forEach(defaultModel => {
      const existingModelIndex = mergedModels.findIndex(
        m => m.id === defaultModel.id,
      );

      if (existingModelIndex !== -1) {
        // Merge existing model with new defaults
        const existingModel = mergedModels[existingModelIndex];

        // For PRESET models, directly use defaultModel's default settings
        existingModel.defaultChatTemplate = defaultModel.defaultChatTemplate;
        existingModel.defaultStopWords = defaultModel.defaultStopWords;
        // Deep merge chatTemplate and stopWords
        existingModel.chatTemplate = deepMerge(
          existingModel.chatTemplate || {},
          defaultModel.chatTemplate || {},
        );

        existingModel.stopWords = [
          ...(existingModel.stopWords || []),
          ...(defaultModel.stopWords || []),
        ];

        // **Merge other attributes from defaultModel**

        const {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          id,
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          defaultChatTemplate,
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          defaultStopWords,
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          chatTemplate,
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          stopWords,
          ...attributesToMerge
        } = defaultModel;

        // Merge remaining attributes
        Object.assign(existingModel, attributesToMerge);

        // Merge other properties
        mergedModels[existingModelIndex] = existingModel;
      } else {
        // Add new model if it doesn't exist
        mergedModels.push(defaultModel);
      }
    });

    // Handle HF and LOCAL models
    mergedModels.forEach(model => {
      if (
        model.origin === ModelOrigin.HF ||
        model.origin === ModelOrigin.LOCAL ||
        model.isLocal
      ) {
        // Reset default settings
        if (model.origin === ModelOrigin.LOCAL || model.isLocal) {
          const defaultSettings = getLocalModelDefaultSettings();
          model.defaultChatTemplate = {...defaultSettings.chatTemplate};
          model.defaultStopWords = defaultSettings.completionParams.stop;
        } else if (model.origin === ModelOrigin.HF) {
          const defaultSettings = getHFDefaultSettings(
            model.hfModel as HuggingFaceModel,
          );
          model.defaultChatTemplate = {...defaultSettings.chatTemplate};
          model.defaultStopWords = defaultSettings.completionParams.stop;
        }

        // Update current settings while preserving any customizations
        model.chatTemplate = deepMerge(
          model.chatTemplate || {},
          model.defaultChatTemplate,
        );
        model.stopWords = [
          ...(model.stopWords || []),
          ...(model.defaultStopWords || []),
        ];
      }
    });

    runInAction(() => {
      this.models = mergedModels;
    });

    this.initializeDownloadStatus();
  };

  setupAppStateListener = () => {
    AppState.addEventListener('change', this.handleAppStateChange);
  };

  // Auto-release management methods
  disableAutoRelease = (reason: string) => {
    this.autoReleaseDisabledReasons.add(reason);
    console.log(
      `Auto-release disabled: ${reason}`,
      Array.from(this.autoReleaseDisabledReasons),
    );
  };

  enableAutoRelease = (reason: string) => {
    this.autoReleaseDisabledReasons.delete(reason);
    console.log(
      `Auto-release enabled: ${reason}`,
      Array.from(this.autoReleaseDisabledReasons),
    );
  };

  get isAutoReleaseEnabled() {
    return this.useAutoRelease && this.autoReleaseDisabledReasons.size === 0;
  }

  private markAutoReleased = (modelId: string) => {
    console.log('Marking auto-released: ', modelId);
    runInAction(() => {
      this.wasAutoReleased = true;
      this.lastAutoReleasedModelId = modelId;
    });
  };

  private clearAutoReleaseFlags = () => {
    console.log('Clearing auto-release flags');
    runInAction(() => {
      this.wasAutoReleased = false;
      this.lastAutoReleasedModelId = undefined;
    });
  };

  checkAndReloadAutoReleasedModel = async () => {
    if (this.wasAutoReleased && this.lastAutoReleasedModelId) {
      const model = this.models.find(
        m => m.id === this.lastAutoReleasedModelId && m.isDownloaded,
      );
      if (model) {
        console.log('Reloading auto-released model:', model.id);
        await this.initContext(model);
      }
      this.clearAutoReleaseFlags();
    }
  };

  handleAppStateChange = async (nextAppState: AppStateStatus) => {
    console.log(`App state change: ${this.appState} → ${nextAppState}`);

    if (
      this.appState.match(/inactive|background/) &&
      nextAppState === 'active'
    ) {
      // Coming to foreground - check if we need to reload auto-released model
      await this.checkAndReloadAutoReleasedModel();
    } else if (this.appState === 'active' && nextAppState === 'inactive') {
      // active → inactive: NO action (per requirements)
      console.log('Active → Inactive: No auto-release action');
    } else if (this.appState === 'inactive' && nextAppState === 'background') {
      // inactive → background: release if enabled
      if (this.isAutoReleaseEnabled && this.activeModelId) {
        console.log('Inactive → Background: Auto-releasing context');
        this.markAutoReleased(this.activeModelId);
        await this.releaseContext();
      }
    } else if (this.appState === 'active' && nextAppState === 'background') {
      // active → background: release if enabled (direct transition)
      if (this.isAutoReleaseEnabled && this.activeModelId) {
        console.log('Active → Background: Auto-releasing context');
        this.markAutoReleased(this.activeModelId);
        await this.releaseContext();
      }
    }

    runInAction(() => {
      this.appState = nextAppState;
    });
  };

  reinitializeContext = async () => {
    if (this.activeModelId) {
      const model = this.models.find(m => m.id === this.activeModelId);
      if (model) {
        await this.initContext(model);
      }
    }
  };

  setNGPULayers = (n_gpu_layers: number) => {
    runInAction(() => {
      this.n_gpu_layers = n_gpu_layers;
    });
  };

  /**
   * Determines the full path for a model file on the device's storage.
   * This path is used for multiple purposes:
   * - As the destination path when downloading a model
   * - To check if a model is downloaded (by checking file existence at this path)
   * - To access the model file for operations like context initialization or deletion
   *
   * Path structure varies by model origin:
   * - LOCAL: Uses the model's fullPath property
   * - PRESET: Checks both legacy path (DocumentDirectoryPath/filename) and
   *          new path (DocumentDirectoryPath/models/preset/author/filename)
   * - HF: Uses DocumentDirectoryPath/models/hf/author/filename
   *
   * @param model - The model object containing necessary metadata (origin, filename, author, etc.)
   * @returns Promise<string> - The full path where the model file is or should be stored
   * @throws Error if filename is undefined or if fullPath is undefined for local models
   */
  getModelFullPath = async (model: Model): Promise<string> => {
    // For local models, use the fullPath
    if (model.isLocal || model.origin === ModelOrigin.LOCAL) {
      if (!model.fullPath) {
        throw new Error('Full path is undefined for local model');
      }
      return model.fullPath;
    }

    if (!model.filename) {
      throw new Error('Model filename is undefined');
    }

    // For preset models, check both old and new paths
    if (model.origin === ModelOrigin.PRESET) {
      const author = model.author || 'unknown';
      const oldPath = `${RNFS.DocumentDirectoryPath}/${model.filename}`; // old path is deprecated. We keep it for now for backwards compatibility.
      const newPath = `${RNFS.DocumentDirectoryPath}/models/preset/${author}/${model.filename}`;

      // If the file exists in old path, use that (for backwards compatibility)
      try {
        if (await RNFS.exists(oldPath)) {
          return oldPath;
        }
      } catch (err) {
        console.log('Error checking old path:', err);
      }

      // Otherwise use new path
      return newPath;
    }

    // For HF models, use author/model structure
    if (model.origin === ModelOrigin.HF) {
      const author = model.author || 'unknown';
      return `${RNFS.DocumentDirectoryPath}/models/hf/${author}/${model.filename}`;
    }

    // Fallback (shouldn't reach here)
    console.error('should not reach here. model: ', model);
    return `${RNFS.DocumentDirectoryPath}/${model.filename}`;
  };

  async checkFileExists(model: Model) {
    const filePath = await this.getModelFullPath(model);
    const exists = await RNFS.exists(filePath);

    // Don't mark as downloaded if currently downloading
    if (exists && !downloadManager.isDownloading(model.id)) {
      if (!model.isDownloaded) {
        console.log(
          'checkFileExists: marking as downloaded - this should not happen:',
          model.id,
        );
        runInAction(() => {
          model.isDownloaded = true;
        });
      }
    } else {
      runInAction(() => {
        model.isDownloaded = false;
      });
    }
  }

  refreshDownloadStatuses = async () => {
    this.models.forEach(model => {
      this.checkFileExists(model);
    });
  };

  initializeDownloadStatus = async () => {
    await this.refreshDownloadStatuses();
  };

  removeInvalidLocalModels = () => {
    runInAction(() => {
      this.models = this.models.filter(
        model =>
          // Keep all non-local models (preset and HF)
          !(model.isLocal || model.origin === ModelOrigin.LOCAL) ||
          // This condition ensures that we keep models that are downloaded.
          // For local models, isDownloaded==true means the file exists, otherwise it's invalid.
          model.isDownloaded,
      );
    });
  };

  /**
   * Private method to handle projection model download for vision models
   * @param model The vision model that needs its projection model downloaded
   */
  private _downloadProjectionModelIfNeeded = async (model: Model) => {
    // Only auto-download for vision models that aren't projection models themselves
    if (
      !model.supportsMultimodal ||
      !model.defaultProjectionModel ||
      model.modelType === ModelType.PROJECTION ||
      !model.visionEnabled
    ) {
      return;
    }

    // Check if vision is enabled for this model
    if (!this.getModelVisionPreference(model)) {
      console.log(
        'Vision disabled for model, skipping projection model download:',
        model.id,
      );
      return;
    }

    const projModelId = model.defaultProjectionModel;
    const projModel = this.models.find(m => m.id === projModelId);

    if (
      projModel &&
      !projModel.isDownloaded &&
      !downloadManager.isDownloading(projModelId)
    ) {
      console.log('Auto-downloading projection model for vision model:', {
        llm: model.id,
        projection: projModelId,
      });

      try {
        // Download the projection model
        await this.checkSpaceAndDownload(projModelId);
      } catch (error) {
        console.error('Failed to auto-download projection model:', error);
        // Don't re-throw - projection model download failure shouldn't fail the main model download
        // The user can manually download the projection model later if needed
      }
    }
  };

  checkSpaceAndDownload = async (modelId: string) => {
    const model = this.models.find(m => m.id === modelId);
    // Skip if model is undefined, already downloaded, local or doesn't have a download URL
    // TODO: we need a better way to handle this. Why this could ever happen?
    if (
      !model ||
      model.isDownloaded ||
      model.isLocal ||
      model.origin === ModelOrigin.LOCAL ||
      !model.downloadUrl
    ) {
      return;
    }

    try {
      const destinationPath = await this.getModelFullPath(model);
      const authToken = hfStore.shouldUseToken ? hfStore.hfToken : null;
      await downloadManager.startDownload(model, destinationPath, authToken);

      // For vision models, automatically download the projection model
      await this._downloadProjectionModelIfNeeded(model);
    } catch (err) {
      console.error('Failed to start download:', err);

      // Create proper error state for the snackbar system
      const errorState = createErrorState(err, 'download', 'huggingface', {
        modelId,
      });

      runInAction(() => {
        this.downloadError = errorState;
      });

      // Re-throw so the caller knows the download failed
      throw err;
    }
  };

  cancelDownload = async (modelId: string) => {
    await downloadManager.cancelDownload(modelId);
    const model = this.models.find(m => m.id === modelId);
    if (model) {
      runInAction(() => {
        model.isDownloaded = false;
        model.progress = 0;
      });
    }
    this.refreshDownloadStatuses();
  };

  get isDownloading() {
    return (modelId: string) => downloadManager.isDownloading(modelId);
  }

  getDownloadProgress = (modelId: string) => {
    return downloadManager.getDownloadProgress(modelId);
  };

  /**
   * Removes a model from the models list if it is not downloaded.
   * @param modelId - The ID of the model to remove.
   * @returns boolean - Returns true if the model was removed, false otherwise.
   */
  removeModelFromList = (model: Model): boolean => {
    const modelIndex = this.models.findIndex(
      m => m.id === model.id && m.origin === model.origin,
    );
    if (modelIndex !== -1) {
      const _model = this.models[modelIndex];
      if (!_model.isDownloaded) {
        runInAction(() => {
          this.models.splice(modelIndex, 1);
        });
        return true;
      }
    }
    return false;
  };

  deleteModel = async (model: Model) => {
    // id should work as well, as long as we are differentiating between models by origin.
    const modelIndex = this.models.findIndex(
      m => m.id === model.id && m.origin === model.origin,
    );
    if (modelIndex === -1) {
      return;
    }
    const _model = this.models[modelIndex];

    // Special handling for projection models
    if (_model.modelType === ModelType.PROJECTION) {
      const canDeleteResult = this.canDeleteProjectionModel(_model.id);
      if (!canDeleteResult.canDelete) {
        throw new Error(
          canDeleteResult.reason || 'Cannot delete projection model',
        );
      }

      // Disable vision for dependent models when their projection model is deleted
      if (
        canDeleteResult.dependentModels &&
        canDeleteResult.dependentModels.length > 0
      ) {
        // Use Promise.allSettled to handle potential errors gracefully
        await Promise.allSettled(
          canDeleteResult.dependentModels.map(dependentModel =>
            this.setModelVisionEnabled(dependentModel.id, false),
          ),
        );
      }
    }

    // Store all projection model IDs that this LLM could use
    const projectionModelIds: string[] = [];
    if (_model.supportsMultimodal) {
      // Add the default projection model
      if (_model.defaultProjectionModel) {
        projectionModelIds.push(_model.defaultProjectionModel);
      }
      // Add all compatible projection models (in case user downloaded additional ones)
      if (_model.compatibleProjectionModels) {
        _model.compatibleProjectionModels.forEach(id => {
          if (!projectionModelIds.includes(id)) {
            projectionModelIds.push(id);
          }
        });
      }
    }

    const filePath = await this.getModelFullPath(_model);
    if (_model.isLocal || _model.origin === ModelOrigin.LOCAL) {
      // Local models are always removed from the list, when the file is deleted.

      // Check if we need to release context (if this model is currently active)
      const needsContextRelease = this.activeModelId === _model.id;

      // Remove model from list first
      runInAction(() => {
        this.models.splice(modelIndex, 1);
      });

      // Release context if needed - this will handle all state cleanup
      if (needsContextRelease) {
        await this.releaseContext(true); // Clear active model and all related state
      }

      // Delete the file from internal storage
      try {
        await RNFS.unlink(filePath);
      } catch (err) {
        console.error('Failed to delete local model file:', err);
      }
    } else {
      // Non-local models are not removed from the list, when the file is deleted.
      console.log('deleting: ', filePath);

      try {
        if (filePath) {
          await RNFS.unlink(filePath);

          // Check if we need to release context (if this model is currently active)
          const needsContextRelease = this.activeModelId === _model.id;

          // Update model state first
          runInAction(() => {
            _model.progress = 0;
            _model.isDownloaded = false; // Mark as not downloaded after successful deletion
          });

          // Release context if needed - this will handle all state cleanup
          if (needsContextRelease) {
            await this.releaseContext(true); // Clear active model and all related state
          }

          //console.log('models: ', this.models);
        } else {
          console.error("Failed to delete, file doesn't exist: ", filePath);
        }
        this.refreshDownloadStatuses();
      } catch (err) {
        console.error('Failed to delete:', err);
      }
    }

    // After deleting an LLM, check if any of its projection models have become orphaned
    if (
      projectionModelIds.length > 0 &&
      _model.modelType !== ModelType.PROJECTION
    ) {
      await this.cleanupOrphanedProjectionModels(projectionModelIds);
    }
  };

  /**
   * Initialize a model context, optionally with multimodal support
   * @param model The main LLM model to initialize
   * @param mmProjPath Optional path to a projection model for multimodal support
   * @returns The initialized LlamaContext
   */
  initContext = async (model: Model, mmProjPath?: string) => {
    await this.releaseContext();
    const filePath = await this.getModelFullPath(model);
    if (!filePath) {
      throw new Error('Model path is undefined');
    }

    // Determine if this is a multimodal initialization
    let isMultimodalInit = false;
    let projectionModel: Model | undefined;

    // Check if vision is enabled for this model
    const visionEnabled = this.getModelVisionPreference(model);

    // If mmProjPath is provided directly, use it (but only if vision is enabled)
    if (mmProjPath && visionEnabled) {
      isMultimodalInit = true;
    }
    // Otherwise, check if the model has a default projection model and vision is enabled
    else if (
      model.supportsMultimodal &&
      model.defaultProjectionModel &&
      visionEnabled
    ) {
      projectionModel = this.models.find(
        m => m.id === model.defaultProjectionModel,
      );
      if (projectionModel?.isDownloaded) {
        mmProjPath = await this.getModelFullPath(projectionModel);
        isMultimodalInit = true;
      }
    }

    // Check both memory and device capability for models
    let hasMemory = true;
    try {
      hasMemory = await hasEnoughMemory(model.size, isMultimodalInit);
    } catch (error) {
      console.error('Memory check failed:', error);
      return null;
    }
    const isCapable = isMultimodalInit ? await isHighEndDevice() : true;

    // Determine what warnings to show
    const hasMemoryIssue = !hasMemory;
    const hasCapabilityIssue = isMultimodalInit && !isCapable;

    if (hasMemoryIssue || hasCapabilityIssue) {
      console.warn(
        `Device performance warning for model: ${model.name} - Memory: ${hasMemoryIssue}, Capability: ${hasCapabilityIssue}`,
      );

      // Determine appropriate alert message
      let title: string;
      let message: string;

      if (hasMemoryIssue && hasCapabilityIssue) {
        // Both memory and multimodal capability issues
        title = uiStore.l10n.memory.alerts.combinedWarningTitle;
        message = uiStore.l10n.memory.alerts.combinedWarningMessage;
      } else if (hasMemoryIssue) {
        // Only memory issue
        title = uiStore.l10n.memory.alerts.memoryWarningTitle;
        message = uiStore.l10n.memory.alerts.memoryWarningMessage;
      } else {
        // Only multimodal capability issue
        title = uiStore.l10n.memory.alerts.multimodalWarningTitle;
        message = uiStore.l10n.memory.alerts.multimodalWarningMessage;
      }

      // Show alert and let user decide
      return new Promise((resolve, reject) => {
        Alert.alert(title, message, [
          {
            text: uiStore.l10n.memory.alerts.cancel,
            style: 'cancel',
            onPress: () => {
              reject(new Error('Model loading cancelled by user'));
            },
          },
          {
            text: uiStore.l10n.memory.alerts.continue,
            onPress: async () => {
              try {
                const ctx = await this.proceedWithInitialization(
                  model,
                  mmProjPath,
                  isMultimodalInit,
                  projectionModel,
                );
                resolve(ctx);
              } catch (error) {
                reject(error);
              }
            },
          },
        ]);
      });
    }

    // If device is capable or not multimodal, proceed with normal initialization
    return this.proceedWithInitialization(
      model,
      mmProjPath,
      isMultimodalInit,
      projectionModel,
    );
  };

  /**
   * Proceed with the actual model initialization after device capability checks
   */
  private async proceedWithInitialization(
    model: Model,
    mmProjPath?: string,
    isMultimodalInit: boolean = false,
    projectionModel?: Model,
  ): Promise<LlamaContext> {
    const filePath = await this.getModelFullPath(model);
    if (!filePath) {
      throw new Error('Model path is undefined');
    }

    runInAction(() => {
      this.isContextLoading = true;
      this.loadingModel = model;
      this.isMultimodalActive = false; // Reset until we confirm it's enabled
      this.activeProjectionModelId = projectionModel?.id;
    });

    try {
      const effectiveValues = this.getEffectiveValues();

      // Resolve the effective use_mmap value based on the setting
      const effectiveUseMmap = await resolveUseMmap(this.use_mmap, filePath);

      const initSettings = {
        n_ctx: effectiveValues.n_ctx,
        n_batch: effectiveValues.n_batch,
        n_ubatch: effectiveValues.n_ubatch,
        n_threads: this.n_threads,
        flash_attn: this.flash_attn,
        cache_type_k: this.cache_type_k,
        cache_type_v: this.cache_type_v,
        n_gpu_layers: this.useMetal ? this.n_gpu_layers : 0,
        no_gpu_devices: !this.useMetal,
        use_mlock: this.use_mlock,
        use_mmap: effectiveUseMmap,
      };
      console.log('initSettings:', initSettings);

      const t0 = Date.now();
      const ctx = await initLlama(
        {
          model: filePath,
          ...initSettings,
          use_progress_callback: true,
        },
        (_progress: number) => {
          //console.log('progress: ', _progress);
        },
      );
      const t1 = Date.now();
      console.log('init time: ', t1 - t0);

      await this.updateModelStopTokens(ctx, model);

      // Check and update thinking capabilities
      await this.updateModelThinkingCapabilities(ctx, model);

      // Initialize multimodal support if mmproj path was provided
      if (isMultimodalInit && mmProjPath) {
        try {
          console.log('Initializing multimodal support with path:', mmProjPath);

          // Initialize multimodal with the new API format
          const success = await ctx.initMultimodal({
            path: mmProjPath,
            use_gpu: this.useMetal,
          });

          if (!success) {
            console.error('Failed to initialize multimodal support');
          } else {
            console.log('Multimodal support initialized successfully');
            // Verify that multimodal is now enabled
            const isEnabled = await ctx.isMultimodalEnabled();
            console.log('Multimodal enabled status:', isEnabled);

            // Update the multimodal active flag
            runInAction(() => {
              this.isMultimodalActive = isEnabled;
            });
          }
        } catch (error) {
          console.error('Error initializing multimodal support:', error);
          runInAction(() => {
            this.isMultimodalActive = false;
            this.activeProjectionModelId = undefined;
          });
        }
      }

      runInAction(() => {
        this.context = ctx;
        this.activeContextSettings = initSettings;
        this.setActiveModel(model.id);
      });
      return ctx;
    } finally {
      runInAction(() => {
        this.isContextLoading = false;
        this.loadingModel = undefined;
        this.lastUsedModelId = model.id;
      });
    }
  }

  releaseContext = async (clearActiveModel: boolean = false) => {
    console.log('attempt to release');
    chatSessionStore.exitEditMode();
    if (!this.context) {
      // Even if no context exists, clear state if requested (for deletion scenarios)
      if (clearActiveModel) {
        runInAction(() => {
          this.activeModelId = undefined;
          this.isMultimodalActive = false;
          this.activeProjectionModelId = undefined;
        });
      }
      return Promise.resolve('No context to release');
    }

    try {
      // First check if multimodal is enabled and release it if needed
      const isMultimodalEnabled = await this.isMultimodalEnabled();
      if (isMultimodalEnabled) {
        console.log('Releasing multimodal context first');
        try {
          await this.context.releaseMultimodal();
          // Immediately clear multimodal state after successful release
          runInAction(() => {
            this.isMultimodalActive = false;
            this.activeProjectionModelId = undefined;
          });
          console.log('Multimodal context released and state cleared');
        } catch (error) {
          console.error('Error releasing multimodal context:', error);
          // Even if release fails, clear the state to prevent blocking deletion
          runInAction(() => {
            this.isMultimodalActive = false;
            this.activeProjectionModelId = undefined;
          });
        }
      }

      // Then release the main context
      await this.context.release();
      console.log('released');
    } catch (error) {
      console.error('Error during context release:', error);
    } finally {
      runInAction(() => {
        this.context = undefined;
        this.activeContextSettings = undefined;
        // Ensure multimodal state is cleared even if something went wrong above
        this.isMultimodalActive = false;
        this.activeProjectionModelId = undefined;
        // Clear active model if requested (for deletion scenarios)
        if (clearActiveModel) {
          this.activeModelId = undefined;
        }
      });
    }
    return 'Context released successfully';
  };

  manualReleaseContext = async () => {
    await this.releaseContext(true); // Clear active model for manual release
  };

  get activeModel(): Model | undefined {
    return this.models.find(model => model.id === this.activeModelId);
  }

  get lastUsedModel(): Model | undefined {
    return this.lastUsedModelId
      ? this.models.find(m => m.id === this.lastUsedModelId && m.isDownloaded)
      : undefined;
  }

  setActiveModel(modelId: string) {
    this.activeModelId = modelId;
  }

  downloadHFModel = async (
    hfModel: HuggingFaceModel,
    modelFile: ModelFile,
    options?: {
      enableVision?: boolean;
      projectionModelId?: string; // User-selected projection model
    },
  ) => {
    try {
      const newModel = await this.addHFModel(hfModel, modelFile);
      if (!newModel) {
        throw new Error('Failed to add model to store');
      }

      // Set vision preference based on user choice
      if (newModel.supportsMultimodal && options?.enableVision !== undefined) {
        this.setModelVisionEnabled(newModel.id, options.enableVision);
        // runInAction(() => {
        //   newModel.visionEnabled = options.enableVision;
        // });
      }

      // Override default projection model with user selection if provided
      if (newModel.supportsMultimodal && options?.projectionModelId) {
        // Validate that selected projection model exists in repository
        const mmprojFiles = getMmprojFiles(hfModel.siblings || []);
        const selectedExists = mmprojFiles.some(
          file =>
            `${hfModel.id}/${file.rfilename}` === options.projectionModelId,
        );

        if (selectedExists) {
          runInAction(() => {
            newModel.defaultProjectionModel = options.projectionModelId;
          });
        } else {
          console.warn(
            'Selected projection model not found in repository, using auto-determined default',
          );
        }
      }

      // Wait a bit to ensure the projection model is added to the store
      // This is needed because addHFModel adds mmproj models asynchronously
      await new Promise(resolve => setTimeout(resolve, 200));

      // Use the centralized download method which handles mmproj automatically
      this.checkSpaceAndDownload(newModel.id);

      // The error handling is now done in the downloadManager callbacks
    } catch (error) {
      // Only handle errors related to the initial setup before the download starts
      console.error('Failed to set up HF model download:', error);
      Alert.alert(
        uiStore.l10n.errors.downloadSetupFailedTitle,
        uiStore.l10n.errors.downloadSetupFailedMessage.replace(
          '{message}',
          (error as Error).message,
        ),
      );
    }
  };

  /**
   * Adds a new HF model to the models list, only if it doesn't exist yet.
   * For multimodal models, ensures all required projection models are also added.
   * @param hfModel - The Hugging Face model to add.
   * @param modelFile - The model file to add.
   * @returns The new model that was added.
   */
  addHFModel = async (hfModel: HuggingFaceModel, modelFile: ModelFile) => {
    const newModel = hfAsModel(hfModel, modelFile);
    const storeModel = this.models.find(m => m.id === newModel.id);

    // For non-multimodal models, return early if the model already exists
    if (storeModel && !newModel.supportsMultimodal) {
      return storeModel;
    }

    // Add the model to the store if it doesn't exist
    let modelToReturn = storeModel;
    if (!storeModel) {
      runInAction(() => {
        this.models.push(newModel);
      });
      modelToReturn = newModel;
    }

    // For multimodal models, always ensure projection models are in the store
    if (
      newModel.supportsMultimodal &&
      newModel.compatibleProjectionModels?.length
    ) {
      // Get the mmproj files from the repository
      const mmprojFiles = getMmprojFiles(hfModel.siblings || []);

      // Add each projection model to the store if it doesn't exist
      for (const mmprojFile of mmprojFiles) {
        const projModelId = `${hfModel.id}/${mmprojFile.rfilename}`;
        const existingProjModel = this.models.find(m => m.id === projModelId);

        if (!existingProjModel) {
          // Create and add the projection model
          const projModel = hfAsModel(hfModel, mmprojFile);
          runInAction(() => {
            this.models.push(projModel);
          });
        }
      }

      // If we're working with an existing model, update its projection model references
      // to ensure they're current with what's now in the store
      if (storeModel) {
        const updatedCompatibleModels = mmprojFiles.map(
          file => `${hfModel.id}/${file.rfilename}`,
        );

        runInAction(() => {
          // Update compatible projection models list
          storeModel.compatibleProjectionModels = updatedCompatibleModels;

          // Ensure default projection model is set if not already set
          if (
            !storeModel.defaultProjectionModel &&
            updatedCompatibleModels.length > 0
          ) {
            // Use the same logic as hfAsModel to determine the default
            const mmprojFilenames = mmprojFiles.map(file => file.rfilename);
            const recommendedFile = getRecommendedProjectionModel(
              modelFile.rfilename,
              mmprojFilenames,
            );
            if (recommendedFile) {
              storeModel.defaultProjectionModel = `${hfModel.id}/${recommendedFile}`;
            }
          }
        });
      }
    }

    // If this is a projection model, check if we need to update any vision models
    if (newModel.modelType === ModelType.PROJECTION) {
      // Get the repository ID from the model ID
      const repoId = newModel.id.split('/').slice(0, 2).join('/');

      // Find vision models from the same repository
      const visionModels = this.models.filter(
        m =>
          m.supportsMultimodal &&
          m.id.startsWith(repoId) &&
          m.id !== newModel.id,
      );

      // Update the compatible projection models for each vision model
      for (const visionModel of visionModels) {
        if (!visionModel.compatibleProjectionModels?.includes(newModel.id)) {
          runInAction(() => {
            if (!visionModel.compatibleProjectionModels) {
              visionModel.compatibleProjectionModels = [];
            }
            visionModel.compatibleProjectionModels.push(newModel.id);

            // If no default projection model is set, set this one as default
            if (!visionModel.defaultProjectionModel) {
              visionModel.defaultProjectionModel = newModel.id;
            }
          });
        }
      }
    }

    await this.refreshDownloadStatuses();
    return modelToReturn;
  };

  addLocalModel = async (localFilePath: string) => {
    const filename = localFilePath.split('/').pop(); // Extract filename from path
    if (!filename) {
      throw new Error('Invalid local file path');
    }

    const defaultSettings = getLocalModelDefaultSettings();

    const model: Model = {
      id: uuidv4(), // Generate a unique ID
      author: '',
      name: filename,
      size: 0, // Placeholder for UI to ignore
      params: 0, // Placeholder for UI to ignore
      isDownloaded: true,
      downloadUrl: '',
      hfUrl: '',
      progress: 0,
      filename,
      fullPath: localFilePath,
      isLocal: true, // Kept for backward compatibility
      origin: ModelOrigin.LOCAL,
      defaultChatTemplate: {...defaultSettings.chatTemplate},
      chatTemplate: {...defaultSettings.chatTemplate},
      defaultStopWords: [...(defaultSettings?.completionParams?.stop || [])],
      stopWords: [...(defaultSettings?.completionParams?.stop || [])],
      defaultCompletionSettings: defaultSettings.completionParams,
      completionSettings: {...defaultSettings.completionParams},
    };

    runInAction(() => {
      this.models.push(model);
      this.refreshDownloadStatuses();
    });
  };

  updateModelChatTemplate = (
    modelId: string,
    newConfig: ChatTemplateConfig,
  ) => {
    const model = this.models.find(m => m.id === modelId);
    if (model) {
      runInAction(() => {
        model.chatTemplate = newConfig;
      });
    }
  };

  updateModelStopWords = (
    modelId: string,
    newStopWords: CompletionParams['stop'],
  ) => {
    const model = this.models.find(m => m.id === modelId);
    if (model) {
      runInAction(() => {
        model.stopWords = newStopWords;
      });
    }
  };

  resetModels = () => {
    const localModels = this.models.filter(
      model => model.isLocal || model.origin === ModelOrigin.LOCAL,
    );
    localModels.forEach(model => {
      const defaultSettings = getLocalModelDefaultSettings();
      // We change the default settings as well, in case the app introduces new settings.
      model.defaultChatTemplate = {...defaultSettings.chatTemplate};
      model.defaultStopWords = [
        ...(defaultSettings?.completionParams?.stop || []),
      ];
      model.chatTemplate = {...defaultSettings.chatTemplate};
      model.stopWords = [...(defaultSettings?.completionParams?.stop || [])];
    });

    const hfModels = this.models.filter(
      model => model.origin === ModelOrigin.HF,
    );
    hfModels.forEach(model => {
      const defaultSettings = getHFDefaultSettings(
        model.hfModel as HuggingFaceModel,
      );
      // We change the default settings as well, in case the app introduces new settings.
      model.defaultChatTemplate = {...defaultSettings.chatTemplate};
      model.defaultStopWords = [
        ...(defaultSettings?.completionParams?.stop || []),
      ];
      model.chatTemplate = {...defaultSettings.chatTemplate};
      model.stopWords = [...(defaultSettings?.completionParams?.stop || [])];
    });

    runInAction(() => {
      this.models = [];
      this.version = 0;
      this.mergeModelLists();

      this.models = [...this.models, ...localModels, ...hfModels];
    });
  };

  resetModelChatTemplate = (modelId: string) => {
    const model = this.models.find(m => m.id === modelId);
    if (model) {
      runInAction(() => {
        model.chatTemplate = {...model.defaultChatTemplate};
      });
    }
  };

  resetModelStopWords = (modelId: string) => {
    const model = this.models.find(m => m.id === modelId);
    if (model) {
      runInAction(() => {
        model.stopWords = [...(model.defaultStopWords || [])];
      });
    }
  };

  private initializeUseMetal() {
    const isIOS18OrHigher =
      Platform.OS === 'ios' && parseInt(Platform.Version as string, 10) >= 18;
    // If we're not on iOS 18+ or not on iOS at all, force useMetal to false
    if (!isIOS18OrHigher) {
      runInAction(() => {
        this.useMetal = false;
      });
    }
    // If we are on iOS 18+, the persisted value will be used
  }

  updateUseMetal = (useMetal: boolean) => {
    runInAction(() => {
      this.useMetal = useMetal;
    });
  };

  updateUseAutoRelease = (useAutoRelease: boolean) => {
    runInAction(() => {
      this.useAutoRelease = useAutoRelease;
    });
  };

  /**
   * Updates stop tokens for a model based on its context and chat template
   * @param ctx - The LlamaContext instance
   * @param model - App model to update stop tokens for
   */
  private async updateModelStopTokens(ctx: LlamaContext, model: Model) {
    const storeModel = this.models.find(m => m.id === model.id);
    if (!storeModel) {
      return;
    }

    const stopTokens: string[] = [];

    try {
      // Get EOS token from model metadata
      const eos_token_id = Number(
        (ctx.model as any)?.metadata?.['tokenizer.ggml.eos_token_id'],
      );

      if (!isNaN(eos_token_id)) {
        const detokenized = await ctx.detokenize([eos_token_id]);
        if (detokenized) {
          stopTokens.push(detokenized);
        }
      }

      // Add relevant stop tokens from chat templates
      // First check model's custom chat template.
      const template = storeModel.chatTemplate?.chatTemplate;
      console.log('template: ', template);
      if (template) {
        const templateStops = stops.filter(stop => template.includes(stop));
        stopTokens.push(...templateStops);
      }

      // Then check context's chat template
      const ctxtTemplate = (ctx.model as any)?.metadata?.[
        'tokenizer.chat_template'
      ];
      if (ctxtTemplate) {
        const contextStops = stops.filter(stop => ctxtTemplate.includes(stop));
        stopTokens.push(...contextStops);
      }

      console.log('stopTokens: ', stopTokens);
      // Only update if we found stop tokens
      if (stopTokens.length > 0) {
        runInAction(() => {
          // Helper function to check and update stop tokens
          const updateStopTokens = (words: CompletionParams['stop']) => {
            const uniqueStops = Array.from(
              new Set([...(words || []), ...stopTokens]),
            ).filter(Boolean); // Remove any null/undefined/empty values
            return uniqueStops;
          };

          // Update both default and current completion settings
          storeModel.defaultStopWords = updateStopTokens(
            storeModel.defaultStopWords,
          );
          storeModel.stopWords = updateStopTokens(storeModel.stopWords);
        });
      }
    } catch (error) {
      console.error('Error updating model stop tokens:', error);
      // Continue execution - stop token update is not critical
    }
  }

  /**
   * Update model thinking capabilities based on the loaded context
   */
  private async updateModelThinkingCapabilities(
    ctx: LlamaContext,
    model: Model,
  ) {
    try {
      const storeModel = this.models.find(m => m.id === model.id);
      if (!storeModel) {
        return;
      }

      // Only check if supportsThinking is not already explicitly set
      if (storeModel.supportsThinking === undefined) {
        const thinkingSupported = await supportsThinking(storeModel, ctx);

        runInAction(() => {
          storeModel.supportsThinking = thinkingSupported;
        });
      }
    } catch (error) {
      console.error('Error updating model thinking capabilities:', error);
      // Continue execution - thinking capability detection is not critical
    }
  }

  /**
   * Returns available (i.e. downloaded models) models with projection models filtered out
   */
  get availableModels(): Model[] {
    return filterProjectionModels(
      this.models.filter(
        model =>
          // Include models that are either local or downloaded
          model.isLocal ||
          model.origin === ModelOrigin.LOCAL ||
          model.isDownloaded,
      ),
    );
  }

  setInferencing(value: boolean) {
    this.inferencing = value;
  }

  setIsStreaming(value: boolean) {
    this.isStreaming = value;
  }

  /**
   * Checks if the current context supports multimodal input
   * @returns Promise<boolean> - True if multimodal is enabled, false otherwise
   */
  isMultimodalEnabled = async (): Promise<boolean> => {
    // First check our cached flag for quick responses
    if (this.isMultimodalActive) {
      return true;
    }

    // If not active, check with the context
    if (!this.context) {
      console.log('isMultimodalEnabled: No context available');
      return false;
    }

    try {
      const isEnabled = await this.context.isMultimodalEnabled();

      // Update our cached flag
      if (isEnabled !== this.isMultimodalActive) {
        runInAction(() => {
          this.isMultimodalActive = isEnabled;
        });
      }

      return isEnabled;
    } catch (error) {
      console.error('Error checking multimodal capability:', error);
      return false;
    }
  };

  /**
   * Get compatible projection models for a given LLM
   * @param modelId The ID of the LLM model
   * @returns Array of compatible projection models
   */
  getCompatibleProjectionModels = (modelId: string): Model[] => {
    const model = this.models.find(m => m.id === modelId);
    if (!model || !model.supportsMultimodal) {
      return [];
    }

    // If the model has explicitly defined compatible projection models, use those
    if (
      model.compatibleProjectionModels &&
      model.compatibleProjectionModels.length > 0
    ) {
      return this.models.filter(
        m =>
          m.modelType === ModelType.PROJECTION &&
          model.compatibleProjectionModels?.includes(m.id),
      );
    }

    // Otherwise, try to find projection models from the same repository
    const modelIdParts = model.id.split('/');
    if (modelIdParts.length >= 2) {
      const author = modelIdParts[0];
      const repo = modelIdParts[1];

      return this.models.filter(
        m =>
          m.modelType === ModelType.PROJECTION &&
          m.id.startsWith(`${author}/${repo}/`),
      );
    }

    return [];
  };

  /**
   * Set default projection model for an LLM
   * @param modelId The ID of the LLM model
   * @param projectionModelId The ID of the projection model to set as default
   */
  setDefaultProjectionModel = (modelId: string, projectionModelId: string) => {
    const model = this.models.find(m => m.id === modelId);
    if (model && model.supportsMultimodal) {
      runInAction(() => {
        model.defaultProjectionModel = projectionModelId;
      });
    }
  };

  /**
   * Get the default projection model for an LLM
   * @param modelId The ID of the LLM model
   * @returns The default projection model, or undefined if none is set
   */
  getDefaultProjectionModel = (modelId: string): Model | undefined => {
    const model = this.models.find(m => m.id === modelId);
    if (!model || !model.supportsMultimodal || !model.defaultProjectionModel) {
      return undefined;
    }

    return this.models.find(m => m.id === model.defaultProjectionModel);
  };

  /**
   * Get all LLM models that use a specific projection model as their default
   * @param projectionModelId The ID of the projection model
   * @returns Array of LLM models that use this projection model as default
   */
  getLLMsUsingProjectionModel = (projectionModelId: string): Model[] => {
    return this.models.filter(
      m =>
        m.supportsMultimodal &&
        m.defaultProjectionModel === projectionModelId &&
        m.modelType !== ModelType.PROJECTION,
    );
  };

  /**
   * Get all downloaded LLM models that use a specific projection model as their default
   * @param projectionModelId The ID of the projection model
   * @returns Array of downloaded LLM models that use this projection model as default
   */
  getDownloadedLLMsUsingProjectionModel = (
    projectionModelId: string,
  ): Model[] => {
    return this.getLLMsUsingProjectionModel(projectionModelId).filter(
      m => m.isDownloaded,
    );
  };

  /**
   * Check if a vision model has its required projection model downloaded
   * @param model The vision model to check
   * @returns true if the model doesn't need a projection model or if it has one downloaded
   */
  hasRequiredProjectionModel = (model: Model): boolean => {
    const status = this.getProjectionModelStatus(model);
    return status.isAvailable;
  };

  /**
   * Get detailed status of a vision model's projection model
   * @param model The vision model to check
   * @returns Object with availability status and detailed state information
   */
  getProjectionModelStatus = (
    model: Model,
  ): {
    isAvailable: boolean;
    state: 'not_needed' | 'downloaded' | 'downloading' | 'missing';
    projectionModel?: Model;
  } => {
    // Non-multimodal models don't need projection models
    if (!model.supportsMultimodal || !model.defaultProjectionModel) {
      return {
        isAvailable: true,
        state: 'not_needed',
      };
    }

    // Find the projection model
    const projectionModel = this.models.find(
      m => m.id === model.defaultProjectionModel,
    );

    if (!projectionModel) {
      return {
        isAvailable: false,
        state: 'missing',
      };
    }

    // Check if projection model is downloaded
    if (projectionModel.isDownloaded) {
      return {
        isAvailable: true,
        state: 'downloaded',
        projectionModel,
      };
    }

    // Check if projection model is currently downloading
    if (downloadManager.isDownloading(projectionModel.id)) {
      return {
        isAvailable: true, // Consider it available during download
        state: 'downloading',
        projectionModel,
      };
    }

    // Projection model exists but is not downloaded and not downloading
    return {
      isAvailable: false,
      state: 'missing',
      projectionModel,
    };
  };

  /**
   * Check if a projection model can be safely deleted
   * @param projectionModelId The ID of the projection model to check
   * @returns Object with canDelete flag and reason if deletion is blocked
   */
  canDeleteProjectionModel = (
    projectionModelId: string,
  ): {canDelete: boolean; reason?: string; dependentModels?: Model[]} => {
    const projectionModel = this.models.find(m => m.id === projectionModelId);

    if (
      !projectionModel ||
      projectionModel.modelType !== ModelType.PROJECTION
    ) {
      return {
        canDelete: false,
        reason: 'Model not found or not a projection model',
      };
    }

    // Check if it's currently active - but also verify that we actually have a context
    // This prevents false positives when the context has been released but state hasn't updated
    if (this.activeProjectionModelId === projectionModelId) {
      // Double-check: if we don't have an active context, the projection model isn't really active
      if (!this.context) {
        console.log(
          'Projection model marked as active but no context exists, allowing deletion:',
          projectionModelId,
        );
      } else {
        return {
          canDelete: false,
          reason: 'Projection model is currently active',
        };
      }
    }

    // Get dependent models for warning purposes
    const dependentModels =
      this.getDownloadedLLMsUsingProjectionModel(projectionModelId);

    if (dependentModels.length > 0) {
      console.log(
        'Projection model is used by downloaded LLM models:',
        dependentModels.map(m => m.id),
      );

      // Return true to allow manual deletion with warning
      // Automatic cleanup will check dependencies separately
      return {
        canDelete: true,
        reason: 'Projection model is used by downloaded LLM models',
        dependentModels,
      };
    }

    return {canDelete: true, dependentModels};
  };

  /**
   * Automatically cleanup orphaned projection models
   * @param projectionModelId The ID of the projection model to check for cleanup
   */
  cleanupOrphanedProjectionModel = async (projectionModelId: string) => {
    const projectionModel = this.models.find(m => m.id === projectionModelId);

    if (
      !projectionModel ||
      projectionModel.modelType !== ModelType.PROJECTION
    ) {
      return; // Not a projection model, nothing to cleanup
    }

    if (!projectionModel.isDownloaded) {
      return; // Not downloaded, nothing to cleanup
    }

    // For automatic cleanup, check if there are any dependent models
    const dependentModels =
      this.getDownloadedLLMsUsingProjectionModel(projectionModelId);

    if (dependentModels.length > 0) {
      console.log(
        'Skipping auto-cleanup of projection model - still used by downloaded LLMs:',
        dependentModels.map(m => m.id),
      );
      return;
    }

    console.log(
      'Auto-cleaning up orphaned projection model:',
      projectionModelId,
    );
    try {
      await this.deleteModel(projectionModel);
    } catch (error) {
      console.error('Failed to auto-cleanup orphaned projection model:', error);
    }
  };

  /**
   * Automatically cleanup multiple orphaned projection models
   * @param projectionModelIds Array of projection model IDs to check for cleanup
   */
  cleanupOrphanedProjectionModels = async (projectionModelIds: string[]) => {
    console.log('Checking for orphaned projection models:', projectionModelIds);

    // Process each projection model for potential cleanup
    for (const projectionModelId of projectionModelIds) {
      await this.cleanupOrphanedProjectionModel(projectionModelId);
    }
  };

  /**
   * Set vision preference for a model
   * @param modelId The ID of the model
   * @param enabled Whether vision capabilities should be enabled
   */
  setModelVisionEnabled = async (modelId: string, enabled: boolean) => {
    const model = this.models.find(m => m.id === modelId);
    if (!model || !model.supportsMultimodal) {
      return;
    }

    // Store the previous vision state to detect changes
    const previousVisionEnabled = this.getModelVisionPreference(model);

    runInAction(() => {
      model.visionEnabled = enabled;
    });

    // Check if this model is currently active and if vision state actually changed
    const isActiveModel = this.activeModelId === modelId;
    const visionStateChanged = previousVisionEnabled !== enabled;

    if (isActiveModel && visionStateChanged && this.context) {
      console.log(
        `Vision ${
          enabled ? 'enabled' : 'disabled'
        } for active model, reloading context`,
        {
          modelId,
          previousState: previousVisionEnabled,
          newState: enabled,
          isMultimodalActive: this.isMultimodalActive,
        },
      );

      try {
        // Reload the context with the new vision setting
        await this.initContext(model);
      } catch (error) {
        console.error(
          'Failed to reload context after vision state change:',
          error,
        );

        // Revert the vision setting if context reload failed
        runInAction(() => {
          model.visionEnabled = previousVisionEnabled;
        });

        // Re-throw the error so the UI can handle it appropriately
        throw error;
      }
    }
  };

  /**
   * Get vision preference for a model
   * @param model The model to check
   * @returns true if vision should be enabled (defaults to true for backward compatibility)
   */
  getModelVisionPreference = (model: Model): boolean => {
    // For non-multimodal models, always return false
    if (!model.supportsMultimodal) {
      return false;
    }

    // Default to true for backward compatibility if not explicitly set
    return model.visionEnabled !== false;
  };

  /**
   * Starts a completion with one or more images
   * @param params - Completion parameters including image paths
   * @returns Promise<void>
   */
  startImageCompletion = async (params: {
    prompt: string;
    image_path?: string; // For backward compatibility
    image_paths?: string[]; // New parameter for multiple images
    systemMessage?: string;
    onToken?: (token: string) => void;
    onComplete?: (text: string) => void;
    onError?: (error: Error) => void;
  }): Promise<void> => {
    if (!this.context) {
      throw new Error('No model context available');
    }

    // Check if multimodal is enabled
    const isMultimodalEnabled = await this.isMultimodalEnabled();
    if (!isMultimodalEnabled) {
      throw new Error('Multimodal is not enabled for this model');
    }

    runInAction(() => {
      this.inferencing = true;
      this.isStreaming = false;
    });

    try {
      // Handle both single image_path and multiple image_paths
      let imagePaths: string[] = [];

      if (params.image_paths && params.image_paths.length > 0) {
        // Use the provided image_paths array
        imagePaths = [...params.image_paths];
      } else if (params.image_path) {
        // Backward compatibility: convert single image_path to array
        imagePaths = [params.image_path];
      }

      if (imagePaths.length === 0) {
        throw new Error('No images provided for multimodal completion');
      }

      // Process all image paths to handle file:// prefix
      const processedImagePaths = imagePaths.map(path =>
        path.startsWith('file://')
          ? Platform.OS === 'ios'
            ? path.substring(7) // iOS: remove 'file://'
            : path // Android: keep as is
          : path,
      );

      // Create a system message if provided
      const systemMessage = params.systemMessage?.trim()
        ? {
            role: 'system',
            content: params.systemMessage,
          }
        : undefined;

      // Create a user message with text and all images
      const userMessage = {
        role: 'user',
        content: [
          {
            type: 'text',
            text: params.prompt,
          },
          // Add all images to the content array
          ...processedImagePaths.map(path => ({
            type: 'image_url',
            image_url: {url: path},
          })),
        ],
      };

      // Start the completion
      runInAction(() => {
        this.isStreaming = true;
      });

      const completionParams =
        await chatSessionRepository.getGlobalCompletionSettings();
      const stopWords = toJS(modelStore.activeModel?.stopWords);

      // Create completion params with app-specific properties
      const messages = systemMessage
        ? [systemMessage, userMessage]
        : [userMessage];
      const completionParamsWithAppProps = {
        ...completionParams,
        messages: messages,
        stop: stopWords,
      } as CompletionParams;

      // Strip app-specific properties before passing to llama.rn
      const cleanCompletionParams = toApiCompletionParams(
        completionParamsWithAppProps,
      );

      const result = await this.context.completion(
        cleanCompletionParams,
        data => {
          if (data.token) {
            params.onToken?.(data.token);
          }
        },
      );

      params.onComplete?.(result.text);
    } catch (error) {
      console.error('Error in multi-image completion:', error);
      params.onError?.(
        error instanceof Error ? error : new Error(String(error)),
      );
    } finally {
      runInAction(() => {
        this.inferencing = false;
        this.isStreaming = false;
      });
    }
  };

  /**
   * Fetches and updates model file details from HuggingFace.
   * This is used when we need to get the lfs.oid for integrity checks.
   * @param model - The model to update
   * @returns Promise<void>
   */
  async fetchAndUpdateModelFileDetails(model: Model): Promise<void> {
    if (!model.hfModel?.id) {
      return;
    }

    try {
      const fileDetails = await fetchModelFilesDetails(model.hfModel.id);
      const matchingFile = fileDetails.find(
        file => file.path === model.hfModelFile?.rfilename,
      );

      if (matchingFile && matchingFile.lfs) {
        runInAction(() => {
          if (model.hfModelFile) {
            model.hfModelFile.lfs = matchingFile.lfs;
          }
        });
      }
    } catch (error) {
      console.error('Failed to fetch model file details:', error);
    }
  }

  // Expensive operation.
  // It will be calculating hash if hash is not set, unless force is true.
  updateModelHash = async (modelId: string, force: boolean = false) => {
    const model = this.models.find(m => m.id === modelId);

    // We only update hash if the model is downloaded and not currently being downloaded.
    if (model?.isDownloaded && !downloadManager.isDownloading(modelId)) {
      // If not forced, we only update hash if it's not already set.
      if (model.hash && !force) {
        return;
      }
      const filePath = await this.getModelFullPath(model);
      const hash = await getSHA256Hash(filePath);
      runInAction(() => {
        model.hash = hash;
      });
    }
  };

  isModelAvailable = (modelId?: string): boolean => {
    if (!modelId) {
      return false;
    }
    return this.availableModels.some(m => m.id === modelId);
  };

  // /**
  //  * Gets localized strings based on the current language from uiStore
  //  */
  // getL10n() {
  //   const language = uiStore.language;
  //   // Import the l10n object from utils
  //   const {l10n} = require('../utils/l10n');
  //   // Return the localized strings for the current language
  //   return l10n[language];
  // }

  clearDownloadError = () => {
    this.downloadError = null;
  };

  retryDownload = () => {
    const modelId = this.downloadError?.metadata?.modelId;
    this.clearDownloadError();

    if (modelId) {
      // Find the model and retry download
      const model = this.models.find(m => m.id === modelId);
      if (model) {
        this.checkSpaceAndDownload(model.id);
      }
    }
  };
}

export const modelStore = new ModelStore();
