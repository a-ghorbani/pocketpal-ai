import {AppState, AppStateStatus, NativeModules} from 'react-native';

import {v4 as uuidv4} from 'uuid';
import 'react-native-get-random-values';
import {makePersistable} from 'mobx-persist-store';
import * as RNFS from '@dr.pogodin/react-native-fs';
import {computed, makeAutoObservable, runInAction} from 'mobx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {CompletionParams, LlamaContext, initLlama} from '@pocketpalai/llama.rn';

import {fetchModelFilesDetails} from '../api/hf';

import {uiStore} from './UIStore';
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
            model.downloadSpeed = `${progress.speed} ETA: ${progress.eta}`;
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
      onError: modelId => {
        const model = this.models.find(m => m.id === modelId);
        if (model) {
          runInAction(() => {
            model.progress = 0;
            model.isDownloaded = false;
          });
        }
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

    if (storedVersion < MODEL_LIST_VERSION) {
      this.mergeModelLists();
      runInAction(() => {
        this.version = MODEL_LIST_VERSION;
      });
    } else {
      await this.initializeDownloadStatus();
      this.removeInvalidLocalModels();
    }
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
      await downloadManager.startDownload(model, destinationPath);
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

  initContext = async (model: Model) => {
    await this.releaseContext();
    const filePath = await this.getModelFullPath(model);
    if (!filePath) {
      throw new Error('Model path is undefined');
    }
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
      };
      const ctx = await initLlama(
        {
          model: filePath,
          use_mlock: true,
          ...initSettings,
          use_progress_callback: true,
        },
        (_progress: number) => {
          //console.log('progress: ', _progress);
        },
      );

      await this.updateModelStopTokens(ctx, model);

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
    } catch (error) {
      console.error('Failed to download HF model:', error);
      throw error;
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
      description: '',
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

  get chatTitle() {
    if (this.isContextLoading) {
      return 'Loading model ...';
    }
    return (
      (this.context?.model as any)?.metadata?.['general.name'] ?? 'Chat Page'
    );
  }

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
}

export const modelStore = new ModelStore();
