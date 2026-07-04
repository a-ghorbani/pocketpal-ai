/**
 * Native Whisper Transcribe TurboModule spec.
 *
 * Bridges llama.rn's whisper.cpp integration to JavaScript
 * for the primary STT (Speech-to-Text) engine.
 *
 * Architecture (ADR-2026-003): Primary STT engine, fully offline.
 * The native side handles:
 * - Audio capture via AVAudioEngine (iOS) / AudioRecord (Android)
 * - Whisper.cpp model loading and inference
 * - Streaming partial results via events
 *
 * Native implementation files:
 * - iOS: ios/WhisperTranscribeModule.swift + WhisperTranscribeModule.mm
 * - Android: android/app/src/main/java/com/pocketpalai/WhisperTranscribeModule.kt
 */

import type {TurboModule} from 'react-native';
import {TurboModuleRegistry} from 'react-native';

export interface WhisperTranscribeResult {
  text: string;
  isFinal: boolean;
  language?: string;
  confidence?: number;
  segments?: Array<{
    text: string;
    start: number;
    end: number;
  }>;
}

export interface Spec extends TurboModule {
  /** Load a Whisper GGUF model from the given file path. */
  loadModel(modelPath: string): Promise<void>;

  /** Unload the current model and free memory. */
  unloadModel(): Promise<void>;

  /** Whether a model is currently loaded. */
  isModelLoaded(): Promise<boolean>;

  /** Start audio capture and whisper transcription. */
  startTranscription(options: {
    language?: string;
    sampleRate?: number;
    enablePartial?: boolean;
  }): Promise<void>;

  /** Stop audio capture and get the final transcription. */
  stopTranscription(): Promise<void>;

  /** Cancel transcription and discard results. */
  cancelTranscription(): Promise<void>;

  // Event emitter methods (required by TurboModule for addListener pattern)
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>(
  'WhisperTranscribeModule',
);
