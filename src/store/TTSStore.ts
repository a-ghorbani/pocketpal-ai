import {makeAutoObservable, runInAction} from 'mobx';
import {makePersistable} from 'mobx-persist-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Speech, {TTSEngine} from '@mhpdev/react-native-speech';
import type {KokoroVoice} from '@mhpdev/react-native-speech';
import type {
  TTSSettings,
  AppTTSEngineType,
  NeuralEngineType,
  KokoroModelInfo,
  ModelDownloadState,
} from '../types/tts';
import {
  getRecommendedModel,
  getAllModels,
  type KokoroModelCatalogEntry,
} from '../services/tts/models';

/**
 * Store for managing TTS (Text-to-Speech) settings
 * Uses unified Speech API from @mhpdev/react-native-speech v2.0+
 */
export class TTSStore {
  // TTS Settings
  settings: TTSSettings = {
    enabled: false,
    engineType: 'platform',
    neuralEngine: 'kokoro',
    platformVoice: undefined,
    platformRate: 1.0,
    platformPitch: 1.0,
    platformLanguage: undefined,
    neuralVoiceId: undefined,
    neuralSpeed: 1.0,
    volume: 1.0,
  };

  // Kokoro model configuration
  kokoroModel: KokoroModelInfo | null = null;

  // Model download state
  modelDownloadState: ModelDownloadState = {
    isDownloading: false,
    progress: 0,
  };

  // Available voices (cached from Speech.getVoicesWithMetadata())
  availableVoices: KokoroVoice[] = [];

  // Track if neural engine is initialized
  isNeuralEngineInitialized = false;

  constructor() {
    makeAutoObservable(this);
    makePersistable(this, {
      name: 'TTSStore',
      properties: ['settings', 'kokoroModel'],
      storage: AsyncStorage,
    }).then(() => {
      // Initialize after persistence is loaded
      this.initializeEngines();
    });
  }

  /**
   * Initialize TTS engines
   */
  async initializeEngines() {
    // Initialize OS native engine (default)
    try {
      await Speech.initialize({engine: TTSEngine.OS_NATIVE});
      console.log('[TTSStore] OS native TTS initialized');
    } catch (error) {
      console.error('[TTSStore] Failed to initialize OS TTS:', error);
    }

    // Initialize Kokoro if model is downloaded
    if (this.kokoroModel?.isDownloaded) {
      await this.initializeKokoroEngine();
    }
  }

  /**
   * Initialize Kokoro neural engine using Speech.initialize()
   */
  async initializeKokoroEngine() {
    if (!this.kokoroModel || !this.kokoroModel.isDownloaded) {
      console.log(
        '[TTSStore] Kokoro model not downloaded, skipping initialization',
      );
      return;
    }

    const {modelPath, vocabPath, mergesPath, voicesPath} = this.kokoroModel;
    if (!modelPath || !vocabPath || !mergesPath || !voicesPath) {
      console.error('[TTSStore] Kokoro model paths incomplete');
      return;
    }

    try {
      await Speech.initialize({
        engine: TTSEngine.KOKORO,
        modelPath,
        vocabPath,
        mergesPath,
        voicesPath,
      });

      runInAction(() => {
        this.isNeuralEngineInitialized = true;
      });

      // Load available voices
      await this.loadAvailableVoices();

      console.log('[TTSStore] Kokoro engine initialized successfully');
    } catch (error) {
      console.error('[TTSStore] Failed to initialize Kokoro engine:', error);
      runInAction(() => {
        this.isNeuralEngineInitialized = false;
      });
    }
  }

  /**
   * Load available voices from Speech.getVoicesWithMetadata()
   */
  async loadAvailableVoices() {
    if (!this.isNeuralEngineInitialized) {
      runInAction(() => {
        this.availableVoices = [];
      });
      return;
    }

    try {
      const voices = await Speech.getVoicesWithMetadata();
      runInAction(() => {
        this.availableVoices = voices as KokoroVoice[];
      });
    } catch (error) {
      console.error('[TTSStore] Failed to load voices:', error);
      runInAction(() => {
        this.availableVoices = [];
      });
    }
  }

  // ============ Settings Management ============

  /**
   * Set whether TTS is enabled
   */
  setEnabled(enabled: boolean) {
    runInAction(() => {
      this.settings.enabled = enabled;
    });
  }

  /**
   * Set the TTS engine type
   */
  setEngineType(engineType: AppTTSEngineType) {
    runInAction(() => {
      this.settings.engineType = engineType;
    });

    // Re-initialize Speech with the appropriate engine
    if (engineType === 'platform') {
      Speech.initialize({engine: TTSEngine.OS_NATIVE}).catch(err =>
        console.error('[TTSStore] Failed to switch to OS native:', err),
      );
    } else if (engineType === 'neural' && this.isNeuralEngineInitialized) {
      // Already initialized, just switch back
      const neuralEngine =
        this.settings.neuralEngine === 'kokoro'
          ? TTSEngine.KOKORO
          : TTSEngine.SUPERTONIC;
      Speech.initialize({engine: neuralEngine}).catch(err =>
        console.error('[TTSStore] Failed to switch to neural:', err),
      );
    }
  }

  /**
   * Set platform voice
   */
  setPlatformVoice(voice: string | undefined) {
    runInAction(() => {
      this.settings.platformVoice = voice;
    });
  }

  /**
   * Set platform rate
   */
  setPlatformRate(rate: number) {
    runInAction(() => {
      this.settings.platformRate = Math.max(0.1, Math.min(2.0, rate));
    });
  }

  /**
   * Set platform pitch
   */
  setPlatformPitch(pitch: number) {
    runInAction(() => {
      this.settings.platformPitch = Math.max(0.5, Math.min(2.0, pitch));
    });
  }

  /**
   * Set platform language
   */
  setPlatformLanguage(language: string | undefined) {
    runInAction(() => {
      this.settings.platformLanguage = language;
    });
  }

  /**
   * Set neural engine type (kokoro or supertonic)
   */
  setNeuralEngine(engineType: NeuralEngineType) {
    runInAction(() => {
      this.settings.neuralEngine = engineType;
    });

    // Re-initialize with the selected neural engine
    if (engineType === 'kokoro' && this.kokoroModel?.isDownloaded) {
      this.initializeKokoroEngine();
    }
    // TODO: Add supertonic initialization when supported
  }

  /**
   * Set neural voice
   */
  setNeuralVoice(voiceId: string | undefined) {
    runInAction(() => {
      this.settings.neuralVoiceId = voiceId;
    });
  }

  /**
   * Set neural speed
   */
  setNeuralSpeed(speed: number) {
    runInAction(() => {
      this.settings.neuralSpeed = Math.max(0.5, Math.min(2.0, speed));
    });
  }

  /**
   * Set volume
   */
  setVolume(volume: number) {
    runInAction(() => {
      this.settings.volume = Math.max(0.0, Math.min(1.0, volume));
    });
  }

  // ============ Model Management ============

  /**
   * Set Kokoro model configuration
   */
  setKokoroModel(model: KokoroModelInfo) {
    runInAction(() => {
      this.kokoroModel = model;
    });
  }

  /**
   * Mark Kokoro model as downloaded
   */
  markKokoroModelDownloaded(paths: {
    modelPath: string;
    vocabPath: string;
    mergesPath: string;
    voicesPath: string;
  }) {
    if (this.kokoroModel) {
      runInAction(() => {
        this.kokoroModel = {
          ...this.kokoroModel!,
          isDownloaded: true,
          ...paths,
        };
      });

      // Initialize the engine now that model is downloaded
      this.initializeKokoroEngine();
    }
  }

  /**
   * Get available Kokoro model variants
   */
  getAvailableKokoroModels(): KokoroModelCatalogEntry[] {
    return getAllModels();
  }

  /**
   * Get recommended Kokoro model
   */
  getRecommendedKokoroModel(): KokoroModelCatalogEntry {
    return getRecommendedModel();
  }

  /**
   * Check if Kokoro model is downloaded
   */
  isKokoroModelDownloaded(): boolean {
    return this.kokoroModel?.isDownloaded ?? false;
  }

  // ============ Download State Management ============

  /**
   * Set model download state
   */
  setModelDownloadState(state: ModelDownloadState) {
    runInAction(() => {
      this.modelDownloadState = state;
    });
  }

  /**
   * Get model download state
   */
  getModelDownloadState(): ModelDownloadState {
    return this.modelDownloadState;
  }

  /**
   * Check if model is currently downloading
   */
  isModelDownloading(): boolean {
    return this.modelDownloadState.isDownloading;
  }

  // ============ Computed Properties ============

  /**
   * Get the currently active voice configuration
   */
  get activeVoiceConfig() {
    if (this.settings.engineType === 'neural') {
      const voiceId = this.settings.neuralVoiceId;
      if (voiceId) {
        return {
          engineType: 'neural' as const,
          neuralEngine: this.settings.neuralEngine,
          voiceId,
          speed: this.settings.neuralSpeed,
          volume: this.settings.volume,
        };
      }
    }

    return {
      engineType: 'platform' as const,
      voice: this.settings.platformVoice,
      rate: this.settings.platformRate,
      pitch: this.settings.platformPitch,
      language: this.settings.platformLanguage,
      volume: this.settings.volume,
    };
  }

  /**
   * Get available voices for current engine
   */
  getAvailableVoices(language?: string): KokoroVoice[] {
    if (language) {
      return this.availableVoices.filter(v => v.language === language);
    }
    return this.availableVoices;
  }

  /**
   * Get voice by ID
   */
  getVoiceById(voiceId: string): KokoroVoice | undefined {
    return this.availableVoices.find(v => v.id === voiceId);
  }
}

export const ttsStore = new TTSStore();
