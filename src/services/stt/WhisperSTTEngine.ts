/**
 * WhisperSTTEngine — local Whisper.cpp STT via llama.rn.
 *
 * Architecture (ADR-2026-003): Primary STT engine, fully offline.
 * Uses Whisper GGUF model loaded via llama.rn, same inference
 * infrastructure as the chat LLM.
 *
 * NOTE: Native bridge integration is pending. The JS interface and
 * state machine are complete; the actual audio capture → whisper
 * inference pipeline will be wired when llama.rn exposes the
 * whisper transcribe API.
 */

import {Platform} from 'react-native';

import type {
  STTEngine,
  STTCallbacks,
  STTStartOptions,
  STTResult,
} from './types';

// Default Whisper model size (tiny ~75MB, base ~142MB)
// These will be configurable via Settings once native bridge is ready
const DEFAULT_MODEL_SIZE = 'tiny';

export class WhisperSTTEngine implements STTEngine {
  readonly id = 'whisper' as const;

  private isActive = false;
  private callbacks: STTCallbacks | null = null;
  private partialText = '';
  private modelLoaded = false;
  private modelPath: string | null = null;

  async isAvailable(): Promise<boolean> {
    // Whisper STT requires:
    // 1. llama.rn to expose transcribe API (pending)
    // 2. A Whisper GGUF model to be downloaded
    // For now, returns false until native bridge is wired
    return this.modelLoaded;
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

    if (!this.modelLoaded || !this.modelPath) {
      throw new Error(
        `WhisperSTTEngine: model not loaded. Download a Whisper ${DEFAULT_MODEL_SIZE} model first.`,
      );
    }

    this.callbacks = callbacks;
    this.partialText = '';
    this.isActive = true;

    try {
      callbacks.onStart?.();

      // TODO: Native bridge integration
      // When llama.rn exposes whisper transcribe:
      // 1. Start audio capture (AudioRecorder)
      // 2. Feed audio chunks to whisper context
      // 3. Emit partial results via callbacks.onPartial
      // 4. On stop, emit final result via callbacks.onResult
      //
      // For now, this is a placeholder that will be replaced
      // with actual native calls when the bridge is ready.
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
      // TODO: Stop audio capture and run final transcribe

      const result: STTResult = {
        text: this.partialText,
        language: 'auto',
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
   * Load a Whisper model from the given path.
   * Will be called by STTRuntime when the user downloads a model.
   */
  async loadModel(modelPath: string): Promise<void> {
    // TODO: Native bridge integration
    // When llama.rn exposes whisper model loading:
    // const context = await Llama.createContext(modelPath, {whisper: true})
    this.modelPath = modelPath;
    this.modelLoaded = true;
  }

  /**
   * Unload the current model and free memory.
   */
  async unloadModel(): Promise<void> {
    this.modelPath = null;
    this.modelLoaded = false;
  }

  /** Whether a model is currently loaded. */
  isModelLoaded(): boolean {
    return this.modelLoaded;
  }

  /** The size of the recommended default model. */
  getDefaultModelSize(): string {
    return DEFAULT_MODEL_SIZE;
  }

  /**
   * Platform check — Whisper STT is supported on both iOS and Android
   * via llama.rn, but not on web.
   */
  static isPlatformSupported(): boolean {
    return Platform.OS === 'ios' || Platform.OS === 'android';
  }
}
