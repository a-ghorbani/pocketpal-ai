/**
 * TTS (Text-to-Speech) Type Definitions
 * Uses unified Speech API from @mhpdev/react-native-speech v2.0+
 *
 * The library now provides a unified API where engine selection is done via
 * Speech.initialize({ engine: TTSEngine.KOKORO, ... }) instead of separate
 * engine-specific APIs like Speech.kokoro.speak().
 */

// Re-export types from react-native-speech library
export {TTSEngine} from '@mhpdev/react-native-speech';
export type {
  KokoroVoice,
  KokoroConfig,
  SupertonicVoice,
  SupertonicConfig,
  SynthesisOptions,
  EngineStatus,
} from '@mhpdev/react-native-speech';

// ============ App-Level Types ============

/**
 * App-level engine type (simplified for UI)
 * - 'platform': Use OS native TTS (TTSEngine.OS_NATIVE)
 * - 'neural': Use neural TTS (TTSEngine.KOKORO or TTSEngine.SUPERTONIC)
 */
export type AppTTSEngineType = 'platform' | 'neural';

/**
 * Neural engine selection (when AppTTSEngineType is 'neural')
 */
export type NeuralEngineType = 'kokoro' | 'supertonic';

/**
 * Voice Gender (for UI display)
 */
export type VoiceGender = 'male' | 'female' | 'neutral';

/**
 * Supported Languages
 */
export type SupportedLanguage = 'en' | 'zh' | 'ko' | 'ja';

// ============ Model Configuration ============

/**
 * Kokoro model configuration (extends library's KokoroConfig with app metadata)
 */
export interface KokoroModelInfo {
  variant: 'full' | 'fp16' | 'q8' | 'quantized';
  version: string;
  size: number; // Size in bytes
  isDownloaded: boolean;
  // Paths (required for Speech.initialize())
  modelPath?: string; // Path to kokoro-*.onnx
  vocabPath?: string; // Path to vocab.json
  mergesPath?: string; // Path to merges.txt
  voicesPath?: string; // Path to voices.bin
}

/**
 * Supertonic model configuration (for future support)
 */
export interface SupertonicModelInfo {
  variant: string;
  version: string;
  size: number;
  isDownloaded: boolean;
  // Paths (required for Speech.initialize())
  modelPath?: string; // Path to model.onnx
  voicesPath?: string; // Path to voices.bin
}

// ============ TTS Settings ============

/**
 * TTS settings stored in TTSStore
 */
export interface TTSSettings {
  /** Whether TTS is enabled globally */
  enabled: boolean;

  /** Selected engine type (app-level) */
  engineType: AppTTSEngineType;

  /** Selected neural engine (when engineType is 'neural') */
  neuralEngine?: NeuralEngineType;

  // Platform TTS settings
  /** Selected platform voice identifier */
  platformVoice?: string;
  /** Platform TTS rate (0.1-2.0) */
  platformRate: number;
  /** Platform TTS pitch (0.5-2.0) */
  platformPitch: number;
  /** Platform TTS language */
  platformLanguage?: string;

  // Neural TTS settings (engine-agnostic)
  /** Selected neural voice ID */
  neuralVoiceId?: string;
  /** Neural TTS speed (0.5-2.0) */
  neuralSpeed: number;

  // Common settings
  /** Volume level (0.0-1.0) */
  volume: number;
}

// ============ Download State ============

/**
 * Model download state
 */
export interface ModelDownloadState {
  isDownloading: boolean;
  progress: number; // 0-100
  error?: string;
  bytesDownloaded?: number;
  totalBytes?: number;
}
