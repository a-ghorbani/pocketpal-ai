import {makeAutoObservable, runInAction} from 'mobx';
import {makePersistable} from 'mobx-persist-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Speech from '@mhpdev/react-native-speech';
import type {
  TTSSettings,
  TTSEngineType,
  NeuralVoiceModel,
  VoiceDownloadState,
} from '../types/tts';
import {VOICE_MODEL_CATALOG} from '../services/tts/voiceModelCatalog';

/**
 * Store for managing TTS (Text-to-Speech) settings and neural voice models
 */
export class TTSStore {
  // TTS Settings
  settings: TTSSettings = {
    enabled: false,
    engineType: 'platform',
    platformVoice: undefined,
    platformRate: 1.0,
    platformPitch: 1.0,
    platformLanguage: undefined,
    neuralVoice: undefined,
    neuralRate: 1.0,
    neuralSpeakerId: undefined,
    volume: 1.0,
  };

  // Neural voice models catalog
  neuralVoices: Map<string, NeuralVoiceModel> = new Map();

  // Download states for voice models
  downloadStates: Map<string, VoiceDownloadState> = new Map();

  // Neural engine availability
  isNeuralEngineAvailable = false;

  constructor() {
    makeAutoObservable(this);
    makePersistable(this, {
      name: 'TTSStore',
      properties: ['settings', 'neuralVoices'],
      storage: AsyncStorage,
    }).then(() => {
      // Populate voice catalog after persistence is loaded
      this.populateVoiceCatalog();
    });

    // Check neural engine availability on initialization
    this.checkNeuralEngineAvailability();
  }

  /**
   * Populate the voice catalog with available voices
   */
  private populateVoiceCatalog() {
    runInAction(() => {
      // Add catalog voices that aren't already in the store
      VOICE_MODEL_CATALOG.forEach(catalogEntry => {
        if (!this.neuralVoices.has(catalogEntry.identifier)) {
          const voice: NeuralVoiceModel = {
            ...catalogEntry,
            isDownloaded: false,
          };
          this.neuralVoices.set(catalogEntry.identifier, voice);
        }
      });
    });
  }

  /**
   * Check if neural TTS engine is available
   */
  async checkNeuralEngineAvailability() {
    try {
      const available = await Speech.isNeuralEngineAvailable();
      runInAction(() => {
        this.isNeuralEngineAvailable = available;
      });
    } catch (error) {
      console.error('[TTSStore] Failed to check neural engine availability:', error);
      runInAction(() => {
        this.isNeuralEngineAvailable = false;
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
  setEngineType(engineType: TTSEngineType) {
    runInAction(() => {
      this.settings.engineType = engineType;
    });
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
   * Set neural voice
   */
  setNeuralVoice(voiceId: string | undefined) {
    runInAction(() => {
      this.settings.neuralVoice = voiceId;
    });
  }

  /**
   * Set neural rate (length scale)
   */
  setNeuralRate(rate: number) {
    runInAction(() => {
      this.settings.neuralRate = Math.max(0.5, Math.min(2.0, rate));
    });
  }

  /**
   * Set neural speaker ID
   */
  setNeuralSpeakerId(speakerId: number | undefined) {
    runInAction(() => {
      this.settings.neuralSpeakerId = speakerId;
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

  // ============ Voice Model Management ============

  /**
   * Add a neural voice model to the catalog
   */
  addNeuralVoiceModel(voice: NeuralVoiceModel) {
    runInAction(() => {
      this.neuralVoices.set(voice.identifier, voice);
    });
  }

  /**
   * Update neural voice model
   */
  updateNeuralVoiceModel(identifier: string, updates: Partial<NeuralVoiceModel>) {
    const voice = this.neuralVoices.get(identifier);
    if (voice) {
      runInAction(() => {
        this.neuralVoices.set(identifier, {...voice, ...updates});
      });
    }
  }

  /**
   * Remove a neural voice model from the catalog
   */
  removeNeuralVoiceModel(identifier: string) {
    runInAction(() => {
      this.neuralVoices.delete(identifier);
      // If this was the selected voice, clear the selection
      if (this.settings.neuralVoice === identifier) {
        this.settings.neuralVoice = undefined;
      }
    });
  }

  /**
   * Get a neural voice model by identifier
   */
  getNeuralVoiceModel(identifier: string): NeuralVoiceModel | undefined {
    return this.neuralVoices.get(identifier);
  }

  /**
   * Get all neural voice models
   */
  getAllNeuralVoices(): NeuralVoiceModel[] {
    return Array.from(this.neuralVoices.values());
  }

  /**
   * Get downloaded neural voices
   */
  getDownloadedNeuralVoices(): NeuralVoiceModel[] {
    return this.getAllNeuralVoices().filter(v => v.isDownloaded);
  }

  /**
   * Get available (not downloaded) neural voices
   */
  getAvailableNeuralVoices(): NeuralVoiceModel[] {
    return this.getAllNeuralVoices().filter(v => !v.isDownloaded);
  }

  // ============ Download State Management ============

  /**
   * Set download state for a voice model
   */
  setDownloadState(identifier: string, state: VoiceDownloadState) {
    runInAction(() => {
      this.downloadStates.set(identifier, state);

      // Update the voice model's download progress
      const voice = this.neuralVoices.get(identifier);
      if (voice) {
        this.neuralVoices.set(identifier, {
          ...voice,
          downloadProgress: state.progress,
        });
      }
    });
  }

  /**
   * Get download state for a voice model
   */
  getDownloadState(identifier: string): VoiceDownloadState | undefined {
    return this.downloadStates.get(identifier);
  }

  /**
   * Clear download state for a voice model
   */
  clearDownloadState(identifier: string) {
    runInAction(() => {
      this.downloadStates.delete(identifier);
    });
  }

  // ============ Computed Properties ============

  /**
   * Get the currently active voice configuration
   */
  get activeVoiceConfig() {
    if (this.settings.engineType === 'neural') {
      const voiceId = this.settings.neuralVoice;
      if (voiceId) {
        const voice = this.neuralVoices.get(voiceId);
        return {
          engineType: 'neural' as const,
          voice: voiceId,
          rate: this.settings.neuralRate,
          speakerId: this.settings.neuralSpeakerId,
          volume: this.settings.volume,
          voiceModel: voice,
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
   * Check if a voice is currently downloading
   */
  isVoiceDownloading(identifier: string): boolean {
    const state = this.downloadStates.get(identifier);
    return state?.isDownloading ?? false;
  }
}

export const ttsStore = new TTSStore();

