/**
 * SystemSTTEngine — uses native iOS/Android speech recognition APIs.
 *
 * Architecture (ADR-2026-003): Fallback STT engine.
 * - iOS: SFSpeechRecognizer (built-in, no download needed)
 * - Android: SpeechRecognizer (built-in, no download needed)
 *
 * Native bridge: src/specs/NativeSpeechRecognizer.ts
 * Events arrive via NativeEventEmitter with 'stt:*' event names.
 */

import {Platform, PermissionsAndroid} from 'react-native';

import type {
  STTEngine,
  STTCallbacks,
  STTStartOptions,
  STTResult,
} from './types';
import {subscribeToSTTEvents} from './nativeBridge';

// Lazy-load native module
let nativeModule: any = null;
function getNativeModule(): any {
  if (nativeModule === null) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('../../specs/NativeSpeechRecognizer').default;
      nativeModule = mod ?? undefined;
    } catch {
      nativeModule = undefined;
    }
  }
  return nativeModule;
}

export class SystemSTTEngine implements STTEngine {
  readonly id = 'system' as const;

  private isActive = false;
  private callbacks: STTCallbacks | null = null;
  private partialText = '';
  private language: string | undefined;
  private unsubscribe: (() => void) | null = null;

  async isAvailable(): Promise<boolean> {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
      return false;
    }
    const mod = getNativeModule();
    if (!mod) {
      // Mock mode for testing
      return true;
    }
    try {
      return await mod.isAvailable();
    } catch {
      return false;
    }
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

    const mod = getNativeModule();

    // Subscribe to native events if module is available
    if (mod) {
      this.unsubscribe = subscribeToSTTEvents(mod, {
        onStart: () => this.callbacks?.onStart?.(),
        onPartial: (text: string) => {
          this.partialText = text;
          this.callbacks?.onPartial?.(text);
        },
        onResult: (data: any) => {
          this.isActive = false;
          const result: STTResult = {
            text: data.text || this.partialText,
            confidence: data.confidence,
            language: data.language || this.language,
          };
          this.callbacks?.onResult?.(result);
          this.cleanup();
        },
        onError: (error: string) => {
          this.isActive = false;
          this.callbacks?.onError?.(new Error(error));
          this.cleanup();
        },
        onEnd: () => {
          this.isActive = false;
          this.callbacks?.onEnd?.();
          this.cleanup();
        },
      });

      try {
        await mod.startRecognition({
          language: options?.language || 'en-US',
          sampleRate: options?.sampleRate || 16000,
          enablePartial: options?.enablePartial ?? true,
        });
      } catch (e) {
        this.cleanup();
        throw e;
      }
    } else {
      // Mock mode for testing: just call onStart
      callbacks.onStart?.();
    }
  }

  async stop(): Promise<void> {
    if (!this.isActive) {
      return;
    }

    const mod = getNativeModule();
    if (mod) {
      await mod.stopRecognition();
    }

    // If no event comes, deliver result from partial
    if (this.isActive) {
      this.isActive = false;
      const result: STTResult = {
        text: this.partialText,
        language: this.language || 'en-US',
      };
      this.callbacks?.onResult?.(result);
      this.cleanup();
    }
  }

  async cancel(): Promise<void> {
    if (!this.isActive) {
      return;
    }

    this.isActive = false;
    const mod = getNativeModule();
    if (mod) {
      try {
        await mod.cancelRecognition();
      } catch {
        // ignore
      }
    }
    this.partialText = '';
    this.callbacks?.onEnd?.();
    this.cleanup();
  }

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

  static async isSystemSupported(): Promise<boolean> {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
      return false;
    }
    const mod = getNativeModule();
    if (!mod) {
      return true; // Mock mode
    }
    try {
      return await mod.isAvailable();
    } catch {
      return false;
    }
  }

  private cleanup(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.callbacks = null;
  }
}
