/**
 * Native Speech Recognizer TurboModule spec.
 *
 * Bridges iOS SFSpeechRecognizer and Android SpeechRecognizer
 * to JavaScript for the STT (Speech-to-Text) service.
 *
 * Architecture (ADR-2026-003): System STT fallback engine.
 * The native side handles:
 * - iOS: SFSpeechRecognizer with SFSpeechAudioBufferRecognitionRequest
 * - Android: SpeechRecognizer with RecognitionListener
 *
 * Native implementation files:
 * - iOS: ios/SpeechRecognizerModule.swift + SpeechRecognizerModule.mm
 * - Android: android/app/src/main/java/com/pocketpalai/SpeechRecognizerModule.kt
 */

import type {TurboModule} from 'react-native';
import {TurboModuleRegistry} from 'react-native';

export interface SpeechRecognitionResult {
  text: string;
  isFinal: boolean;
  confidence?: number;
  language?: string;
}

export interface Spec extends TurboModule {
  /** Check if the system speech recognizer is available on this device. */
  isAvailable(): Promise<boolean>;

  /** Start listening for speech. Delivers results via events. */
  startRecognition(options: {
    language?: string;
    sampleRate?: number;
    enablePartial?: boolean;
  }): Promise<void>;

  /** Stop listening and get the final result. */
  stopRecognition(): Promise<void>;

  /** Cancel listening and discard results. */
  cancelRecognition(): Promise<void>;

  // Event emitter methods (required by TurboModule for addListener pattern)
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('SpeechRecognizerModule');
