/**
 * TTS (Text-to-Speech) type definitions
 */

export type TTSEngineType = 'platform' | 'neural';
export type VoiceQuality = 'low' | 'medium' | 'high';

/**
 * Neural voice model information
 */
export interface NeuralVoiceModel {
  /** Unique identifier for the voice */
  identifier: string;
  /** Display name */
  name: string;
  /** Language code (e.g., 'en-US', 'fr-FR') */
  language: string;
  /** Voice quality level */
  quality: VoiceQuality;
  /** Number of speakers in the model (1 for single-speaker) */
  numSpeakers: number;
  /** Sample rate in Hz */
  sampleRate: number;
  /** Model size in bytes */
  size: number;
  /** Whether the model is downloaded */
  isDownloaded: boolean;
  /** Download progress (0-100) */
  downloadProgress?: number;
  /** Local path to model.onnx file */
  modelPath?: string;
  /** Local path to tokens.txt file */
  tokensPath?: string;
  /** Local path to espeak-ng-data directory */
  dataPath?: string;
  /** Download URL for the model package */
  downloadUrl?: string;
  /** Gender of the voice (if applicable) */
  gender?: 'male' | 'female' | 'neutral';
  /** Description of the voice */
  description?: string;
}

/**
 * TTS settings stored in TTSStore
 */
export interface TTSSettings {
  /** Whether TTS is enabled globally */
  enabled: boolean;

  /** Selected engine type */
  engineType: TTSEngineType;

  // Platform TTS settings
  /** Selected platform voice identifier */
  platformVoice?: string;
  /** Platform TTS rate (0.1-2.0) */
  platformRate: number;
  /** Platform TTS pitch (0.5-2.0) */
  platformPitch: number;
  /** Platform TTS language */
  platformLanguage?: string;

  // Neural TTS settings
  /** Selected neural voice identifier */
  neuralVoice?: string;
  /** Neural TTS rate/length scale (0.5-2.0) */
  neuralRate: number;
  /** Speaker ID for multi-speaker models */
  neuralSpeakerId?: number;

  // Common settings
  /** Volume level (0.0-1.0) */
  volume: number;
}

/**
 * Voice model download state
 */
export interface VoiceDownloadState {
  isDownloading: boolean;
  progress: number;
  error?: Error;
}

/**
 * Voice model catalog entry (before download)
 */
export interface VoiceModelCatalogEntry {
  identifier: string;
  name: string;
  language: string;
  quality: VoiceQuality;
  numSpeakers: number;
  sampleRate: number;
  size: number;
  downloadUrl: string;
  gender?: 'male' | 'female' | 'neutral';
  description?: string;
  /** Files included in the package */
  files: {
    model: string; // e.g., "model.onnx"
    tokens: string; // e.g., "tokens.txt"
    data: string; // e.g., "espeak-ng-data"
  };
}
