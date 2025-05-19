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
import {deepMerge, getSHA256Hash, hfAsModel} from '../utils';
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
} from '../utils/types';

import {ErrorState, createErrorState} from '../utils/errors';
import {chatSessionRepository} from '../repositories/ChatSessionRepository';

class ModelStore {
  models: Model[] = [];
  version: number | undefined = undefined; // Persisted version

  appState: AppStateStatus = AppState.currentState;
  useAutoRelease: boolean = true;
  isContextLoading: boolean = false;
  loadingModel: Model | undefined = undefined;
  n_context: number = 1024;
  n_gpu_layers: number = 50;
  n_threads: number = 4;
  max_threads: number = 4; // Will be set in constructor
  flash_attn: boolean = false;
  cache_type_k: CacheType = CacheType.F16;
  cache_type_v: CacheType = CacheType.F16;
  n_batch: number = 512;
  n_ubatch: number = 512;

  activeModelId: string | undefined = undefined;

  // Track initialization settings for the active context
  activeContextSettings:
    | {
        n_context: number;
        n_batch: number;
        n_ubatch: number;
        n_threads: number;
        flash_attn: boolean;
        cache_type_k: CacheType;
        cache_type_v: CacheType;
        n_gpu_layers: number;
      }
    | undefined = undefined;

  context: LlamaContext | undefined = undefined;
  useMetal = false; //Platform.OS === 'ios';

  lastUsedModelId: string | undefined = undefined;

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
        'n_context',
        'n_threads',
        'flash_attn',
        'cache_type_k',
        'cache_type_v',
        'n_batch',
        'n_ubatch',
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

  setNContext = (n_context: number) => {
    runInAction(() => {
      this.n_context = n_context;
    });
  };

  // Helper method to get effective values respecting constraints
  getEffectiveValues = () => {
    const effectiveContext = this.n_context;
    const effectiveBatch = Math.min(this.n_batch, effectiveContext);
    const effectiveUBatch = Math.min(this.n_ubatch, effectiveBatch);

    return {
      n_context: effectiveContext,
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

  handleAppStateChange = async (nextAppState: AppStateStatus) => {
    if (
      this.appState.match(/inactive|background/) &&
      nextAppState === 'active'
    ) {
      if (this.useAutoRelease) {
        await this.reinitializeContext();
      }
    } else if (
      this.appState === 'active' &&
      nextAppState.match(/inactive|background/)
    ) {
      if (this.useAutoRelease) {
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

  checkSpaceAndDownload = async (modelId: string) => {
    const model = this.models.find(m => m.id === modelId);
    // Skip if model is undefined, local or doesn't have a download URL
    // TODO: we need a better way to handle this. Why this could ever happen?
    if (
      !model ||
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
    } catch (err) {
      console.error('Failed to start download:', err);
      uiStore.showError('Failed to start download: ' + (err as Error).message);
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

    const filePath = await this.getModelFullPath(_model);
    if (_model.isLocal || _model.origin === ModelOrigin.LOCAL) {
      // Local models are always removed from the list, when the file is deleted.
      runInAction(() => {
        this.models.splice(modelIndex, 1);
        if (this.activeModelId === _model.id) {
          this.releaseContext();
        }
      });
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
          runInAction(() => {
            _model.progress = 0;
            if (this.activeModelId === _model.id) {
              this.releaseContext();
              this.activeModelId = undefined;
            }
          });
          //console.log('models: ', this.models);
        } else {
          console.error("Failed to delete, file doesn't exist: ", filePath);
        }
        this.refreshDownloadStatuses();
      } catch (err) {
        console.error('Failed to delete:', err);
      }
    }
  };

  initContext = async (model: Model, mmProjPath?: string) => {
    await this.releaseContext();
    const filePath = await this.getModelFullPath(model);
    if (!filePath) {
      throw new Error('Model path is undefined');
    }

    // Check if this is a vision model based on mmProjPath
    const isVisionModel = mmProjPath ? true : false;

    console.log('Initializing model:', model.name);
    console.log('mmProjPath :', mmProjPath);
    console.log('Is vision model:', isVisionModel ? 'Yes' : 'No');

    runInAction(() => {
      this.isContextLoading = true;
      this.loadingModel = model;
    });

    try {
      const effectiveValues = this.getEffectiveValues();
      const initSettings = {
        n_context: effectiveValues.n_context,
        n_batch: effectiveValues.n_batch,
        n_ubatch: effectiveValues.n_ubatch,
        n_threads: this.n_threads,
        flash_attn: this.flash_attn,
        cache_type_k: this.cache_type_k,
        cache_type_v: this.cache_type_v,
        n_gpu_layers: this.useMetal ? this.n_gpu_layers : 0,
        no_gpu_devices: !this.useMetal,
        mmproj_use_gpu: this.useMetal,
      };

      // If we have a projection model path, log it
      if (mmProjPath) {
        console.log('Using projection model path:', mmProjPath);
      }

      const ctx = await initLlama(
        {
          model: filePath,
          use_mlock: true,
          ...initSettings,
          use_progress_callback: true,
          // Add mmproj path if provided
          mmproj: mmProjPath,
        },
        (_progress: number) => {
          //console.log('progress: ', _progress);
        },
      );

      await this.updateModelStopTokens(ctx, model);

      // Initialize multimodal support if mmproj path was provided
      if (mmProjPath) {
        try {
          console.log('Initializing multimodal support...');
          // Always explicitly call initMultimodal even if we provided mmproj during initLlama
          const success = await ctx.initMultimodal(mmProjPath);
          if (!success) {
            console.error('Failed to initialize multimodal support');
          } else {
            console.log('Multimodal support initialized successfully');
            // Verify that multimodal is now enabled
            const isEnabled = await ctx.isMultimodalEnabled();
            console.log('Multimodal enabled status:', isEnabled);
          }
        } catch (error) {
          console.error('Error initializing multimodal support:', error);
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
  };

  releaseContext = async () => {
    console.log('attempt to release');
    chatSessionStore.exitEditMode();
    if (!this.context) {
      return Promise.resolve('No context to release');
    }
    await this.context.release();
    console.log('released');
    runInAction(() => {
      this.context = undefined;
      this.activeContextSettings = undefined;
      //this.activeModelId = undefined; // activeModelId is set to undefined in manualReleaseContext
    });
    return 'Context released successfully';
  };

  manualReleaseContext = async () => {
    await this.releaseContext();
    runInAction(() => {
      this.activeModelId = undefined;
    });
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

  downloadHFModel = async (hfModel: HuggingFaceModel, modelFile: ModelFile) => {
    try {
      const newModel = await this.addHFModel(hfModel, modelFile);
      await this.checkSpaceAndDownload(newModel.id);
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
   * @param hfModel - The Hugging Face model to add.
   * @param modelFile - The model file to add.
   * @returns The new model that was added.
   */
  addHFModel = async (hfModel: HuggingFaceModel, modelFile: ModelFile) => {
    const newModel = hfAsModel(hfModel, modelFile);
    const storeModel = this.models.find(m => m.id === newModel.id);
    if (storeModel) {
      // Model already exists, return the existing model
      return storeModel;
    }
    runInAction(() => {
      this.models.push(newModel);
    });
    await this.refreshDownloadStatuses();
    return newModel;
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
      isLocal: true,
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

  get availableModels(): Model[] {
    return this.models.filter(
      model =>
        // Include models that are either local or downloaded
        model.isLocal ||
        model.origin === ModelOrigin.LOCAL ||
        model.isDownloaded,
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
    if (!this.context) {
      console.log('isMultimodalEnabled: No context available');
      return false;
    }

    try {
      const isEnabled = await this.context.isMultimodalEnabled();
      console.log('isMultimodalEnabled check result:', isEnabled);

      // If not enabled but we have an active model that should support multimodal,
      // log additional information for debugging
      if (!isEnabled && this.activeModel) {
        console.log('Active model:', this.activeModel.name);
        // Models don't have palType directly, but we can log other relevant info
        console.log('Model ID:', this.activeModel.id);
      }

      return isEnabled;
    } catch (error) {
      console.error('Error checking multimodal capability:', error);
      return false;
    }
  };

  /**
   * Starts a completion with an image
   * @param params - Completion parameters including image_path
   * @returns Promise<void>
   */
  startImageCompletion = async (params: {
    prompt: string;
    image_path: string;
    systemMessage?: string;
    onToken?: (token: string) => void;
    onComplete?: (text: string) => void;
    onError?: (error: Error) => void;
  }): Promise<void> => {
    if (!this.context) {
      throw new Error('No model context available');
    }
    console.log('startImageCompletion params: ', params);

    const isMultimodalEnabled = await this.isMultimodalEnabled();
    if (!isMultimodalEnabled) {
      throw new Error('Multimodal is not enabled for this model');
    }

    runInAction(() => {
      this.inferencing = true;
      this.isStreaming = false;
    });

    try {
      // Prepare the image path - remove file:// prefix if present
      const imagePath = params.image_path.startsWith('file://')
        ? Platform.OS === 'ios'
          ? params.image_path.substring(7) // iOS: remove 'file://'
          : params.image_path // Android: keep as is
        : params.image_path;

      // Create a system message
      const systemMessage = params.systemMessage?.trim()
        ? {
            role: 'system',
            content: params.systemMessage,
          }
        : undefined;

      // Create a user message with the image
      const userMessage = {
        role: 'user',
        content: [
          {
            type: 'text',
            text: params.prompt,
          },
          {
            type: 'image_url',
            image_url: {url: imagePath},
          },
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

      // Cast to any to allow adding image_path which is supported by the native module
      // but not included in the TypeScript type definition
      const completionParamsWithImage = {
        ...cleanCompletionParams,
        image_path: imagePath,
      } as any;

      const result = await this.context.completion(
        completionParamsWithImage,
        data => {
          if (data.token) {
            params.onToken?.(data.token);
          }
        },
      );

      params.onComplete?.(result.text);
    } catch (error) {
      console.error('Error in image completion:', error);
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
