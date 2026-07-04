/**
 * WhisperSTTEngine — local Whisper.cpp STT via llama.rn.
 *
 * Architecture (ADR-2026-003): Primary STT engine, fully offline.
 * Uses Whisper GGUF model loaded via the native WhisperTranscribeModule.
 *
 * Native bridge: src/specs/NativeWhisperTranscribe.ts
 * Events arrive via NativeEventEmitter with 'stt:*' event names.
 */

import {Platform} from 'react-native';

import type {
  STTEngine,
  STTCallbacks,
  STTStartOptions,
  STTResult,
} from './types';
import {subscribeToSTTEvents} from './nativeBridge';

// Lazy-load native module to avoid crash if not linked yet
let nativeModule: any = null;
function getNativeModule(): any {
  if (nativeModule === null) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('../../specs/NativeWhisperTranscribe').default;
      nativeModule = mod ?? undefined;
    } catch {
      nativeModule = undefined;
    }
  }
  return nativeModule;
}

const DEFAULT_MODEL_SIZE = 'tiny';

export class WhisperSTTEngine implements STTEngine {
  readonly id = 'whisper' as const;

  private isActive = false;
  private callbacks: STTCallbacks | null = null;
  private partialText = '';
  private modelLoaded = false;
  private unsubscribe: (() => void) | null = null;

  async isAvailable(): Promise<boolean> {
    const mod = getNativeModule();
    if (!mod) {
      return false;
    }
    try {
      return await mod.isModelLoaded();
    } catch {
      return false;
    }
  }

  requiresModel(): boolean {
    return true;
  }

  async start(
    callbacks: STTCallbacks,
    options?: STTStartOptions,
  ): Promise<void> {
    if (this.isActive) {
      throw new Error('WhisperSTTEngine: already listening');
    }

    const mod = getNativeModule();
    if (!mod) {
      throw new Error(
        'WhisperSTTEngine: native module not linked. Ensure WhisperTranscribeModule is registered.',
      );
    }

    if (!this.modelLoaded) {
      throw new Error(
        `WhisperSTTEngine: model not loaded. Download a Whisper ${DEFAULT_MODEL_SIZE} model first.`,
      );
    }

    this.callbacks = callbacks;
    this.partialText = '';
    this.isActive = true;

    // Subscribe to native events
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
          language: data.language,
          segments: data.segments,
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
      await mod.startTranscription({
        language: options?.language || 'auto',
        sampleRate: options?.sampleRate || 16000,
        enablePartial: options?.enablePartial ?? true,
      });
    } catch (e) {
      this.cleanup();
      throw e;
    }
  }

  async stop(): Promise<void> {
    if (!this.isActive) {
      return;
    }

    const mod = getNativeModule();
    if (mod) {
      await mod.stopTranscription();
    }
    // The result will be delivered via 'stt:result' event
    // If no event comes, force a result from partial
    if (this.isActive) {
      this.isActive = false;
      const result: STTResult = {
        text: this.partialText,
        language: 'auto',
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
        await mod.cancelTranscription();
      } catch {
        // ignore
      }
    }
    this.partialText = '';
    this.callbacks?.onEnd?.();
    this.cleanup();
  }

  async loadModel(modelPath: string): Promise<void> {
    const mod = getNativeModule();
    if (!mod) {
      // Mock mode: mark as loaded for testing
      this.modelLoaded = true;
      return;
    }
    await mod.loadModel(modelPath);
    this.modelLoaded = true;
  }

  async unloadModel(): Promise<void> {
    const mod = getNativeModule();
    if (mod && this.modelLoaded) {
      try {
        await mod.unloadModel();
      } catch {
        // ignore
      }
    }
    this.modelLoaded = false;
  }

  isModelLoaded(): boolean {
    return this.modelLoaded;
  }

  getDefaultModelSize(): string {
    return DEFAULT_MODEL_SIZE;
  }

  private cleanup(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.callbacks = null;
  }

  static isPlatformSupported(): boolean {
    return Platform.OS === 'ios' || Platform.OS === 'android';
  }
}
