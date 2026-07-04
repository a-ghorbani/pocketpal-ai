/**
 * SystemSTTEngine — uses native iOS/Android speech recognition APIs.
 *
 * Architecture (ADR-2026-003): Fallback STT engine.
 * - iOS: SFSpeechRecognizer (built-in, no download needed)
 * - Android: SpeechRecognizer (built-in, no download needed)
 *
 * This engine requires no model download and works out-of-the-box,
 * but needs microphone permission and (on iOS) an active internet
 * connection for best accuracy.
 *
 * NOTE: Native bridge integration is pending. The JS interface and
 * state machine are complete.
 */

import {Platform, PermissionsAndroid} from 'react-native';

import type {
  STTEngine,
  STTCallbacks,
  STTStartOptions,
  STTResult,
} from './types';

export class SystemSTTEngine implements STTEngine {
  readonly id = 'system' as const;

  private isActive = false;
  private callbacks: STTCallbacks | null = null;
  private partialText = '';
  private language: string | undefined;

  async isAvailable(): Promise<boolean> {
    // System STT is available on both iOS and Android natively
    // No model download required
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      return true;
    }
    return false;
  }

  requiresModel(): boolean {
    return false;
  }

  async start(
    callbacks: STTCallbacks,
    options?: STTStartOptions,
  ): Promise<void> {
    if (this.isActive) {
      throw new Error('SystemSTTEngine: already listening');
    }

    // Check/request microphone permission on Android
    if (Platform.OS === 'android') {
      const granted = await this.requestAndroidPermission();
      if (!granted) {
        callbacks.onError?.(
          new Error('Microphone permission denied'),
        );
        return;
      }
    }

    this.callbacks = callbacks;
    this.partialText = '';
    this.language = options?.language;
    this.isActive = true;

    try {
      callbacks.onStart?.();

      // TODO: Native bridge integration
      // iOS: SFSpeechRecognizer with SFSpeechAudioBufferRecognitionRequest
      // Android: SpeechRecognizer with RecognitionListener
      //
      // When native module is ready:
      // 1. Start audio recording
      // 2. Feed audio to system recognizer
      // 3. Emit partial results via callbacks.onPartial
      // 4. On stop, emit final result via callbacks.onResult
    } catch (e) {
      this.isActive = false;
      this.callbacks?.onError?.(
        e instanceof Error ? e : new Error(String(e)),
      );
    }
  }

  async stop(): Promise<void> {
    if (!this.isActive) {
      return;
    }

    this.isActive = false;

    try {
      // TODO: Stop audio and get final result from native

      const result: STTResult = {
        text: this.partialText,
        language: this.language || 'en-US',
      };

      this.callbacks?.onResult?.(result);
    } catch (e) {
      this.callbacks?.onError?.(
        e instanceof Error ? e : new Error(String(e)),
      );
    } finally {
      this.callbacks?.onEnd?.();
      this.callbacks = null;
    }
  }

  async cancel(): Promise<void> {
    if (!this.isActive) {
      return;
    }

    this.isActive = false;
    this.partialText = '';
    this.callbacks?.onEnd?.();
    this.callbacks = null;
  }

  /**
   * Request microphone permission on Android.
   * iOS permission is handled via Info.plist (NSSpeechRecognitionUsageDescription).
   */
  private async requestAndroidPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return true;
    }

    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: 'Microphone Permission',
          message:
            'PocketPal needs access to your microphone for speech recognition.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        },
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
      return false;
    }
  }

  /**
   * Check if the device's system speech recognizer is available.
   * Some Android devices don't have SpeechRecognizer.
   */
  static async isSystemSupported(): Promise<boolean> {
    // TODO: Check native availability
    // iOS: SFSpeechRecognizer.isAvailable
    // Android: SpeechRecognizer.isRecognitionAvailable
    return Platform.OS === 'ios' || Platform.OS === 'android';
  }
}
