/**
 * Minimal ambient module declaration for `@mhpdev/react-native-speech`.
 *
 * The package ships as untranspiled source on GitHub (no prebuilt `lib/`),
 * and `bob build --target typescript` fails against RN 0.82 types. Rather
 * than compile the whole package source, we declare the subset we call.
 * Remove this shim when the published package ships real typings.
 */
declare module '@mhpdev/react-native-speech' {
  export interface VoiceProps {
    name: string;
    quality: number;
    language: string;
    identifier: string;
  }

  export interface SpeechEventSubscription {
    remove(): void;
  }

  export interface SpeechEventEmitter<T> {
    (listener: (event: T) => void): SpeechEventSubscription;
  }

  export interface FinishEvent {
    utteranceId?: string;
  }

  /**
   * Supertonic v2 language codes. The fork's internal type still declares
   * `'en'` only; PocketPal's shim widens it for type-safe calls. v2 covers
   * EN/KO/ES/PT/FR with a single shared bundle.
   */
  export type SupertonicLanguage = 'en' | 'ko' | 'es' | 'pt' | 'fr';

  /**
   * Options accepted by the fork's `Speech.speak` in v2. `language` was
   * introduced alongside the v2 bundle; `speed` and `inferenceSteps` exist
   * for Supertonic fine-tuning.
   */
  export interface SpeakOptions {
    speed?: number;
    inferenceSteps?: number;
    language?: SupertonicLanguage;
  }

  /**
   * Engine identifier enum — mirrors `@mhpdev/react-native-speech/src/types/Engine.ts`.
   * Exported as a value (used both as a TS type and at runtime for
   * `Speech.initialize({engine: TTSEngine.SUPERTONIC})`).
   */
  export enum TTSEngine {
    OS_NATIVE = 'os-native',
    KOKORO = 'kokoro',
    SUPERTONIC = 'supertonic',
    POCKET = 'pocket',
    KITTEN = 'kitten',
  }

  export interface SupertonicInitializeConfig {
    engine: TTSEngine.SUPERTONIC;
    durationPredictorPath: string;
    textEncoderPath: string;
    vectorEstimatorPath: string;
    vocoderPath: string;
    unicodeIndexerPath: string;
    voicesPath: string;
    silentMode?: 'obey' | 'ignore';
    ducking?: boolean;
    maxChunkSize?: number;
  }

  export interface OSNativeInitializeConfig {
    engine: TTSEngine.OS_NATIVE;
  }

  export type InitializeConfig =
    | SupertonicInitializeConfig
    | OSNativeInitializeConfig;

  export default class Speech {
    static initialize(config: InitializeConfig): Promise<void>;
    static speak(
      text: string,
      voiceId?: string,
      options?: SpeakOptions,
    ): Promise<void>;
    static stop(): Promise<void>;
    static release(): Promise<void>;
    static getAvailableVoices(language?: string): Promise<VoiceProps[]>;
    /**
     * Fires when the current utterance finishes playing. Used by
     * `SystemEngine.playStreaming` to chain sentence-level utterances so
     * long LLM responses start speaking before synthesis completes.
     */
    static onFinish: SpeechEventEmitter<FinishEvent>;
  }
}
