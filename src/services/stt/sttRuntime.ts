/**
 * STT runtime — manages the active STT session.
 *
 * Responsible for:
 * - Selecting the best available engine (Whisper preferred, system fallback)
 * - Managing start/stop/cancel lifecycle
 * - Ensuring only one session runs at a time
 *
 * Architecture (ADR-2026-003): Whisper is preferred (offline), System
 * API is the fallback (always available, may need internet).
 */

import type {STTEngine, STTCallbacks, STTStartOptions} from './types';
import {getEngine, getAllEngines} from './engineRegistry';

class STTRuntime {
  private activeEngine: STTEngine | null = null;
  private isListening = false;

  /**
   * Pick the best available engine.
   * Preference: whisper (offline) > system (always available)
   */
  async selectEngine(): Promise<STTEngine> {
    const engines = getAllEngines();

    // Try Whisper first (offline, preferred)
    const whisper = getEngine('whisper');
    if (whisper && (await whisper.isAvailable())) {
      return whisper;
    }

    // Fall back to system
    const system = getEngine('system');
    if (system && (await system.isAvailable())) {
      return system;
    }

    // Last resort: return system anyway (will error on start)
    return system || engines[0];
  }

  /**
   * Start speech recognition.
   * Automatically selects the best available engine.
   */
  async start(
    callbacks: STTCallbacks,
    options?: STTStartOptions,
  ): Promise<void> {
    if (this.isListening) {
      throw new Error('STTRuntime: already listening');
    }

    const engine = await this.selectEngine();
    this.activeEngine = engine;
    this.isListening = true;

    // Wrap callbacks to track state
    const wrappedCallbacks: STTCallbacks = {
      onStart: () => callbacks.onStart?.(),
      onPartial: text => callbacks.onPartial?.(text),
      onResult: result => {
        this.isListening = false;
        callbacks.onResult?.(result);
      },
      onError: error => {
        this.isListening = false;
        callbacks.onError?.(error);
      },
      onEnd: () => {
        this.isListening = false;
        this.activeEngine = null;
        callbacks.onEnd?.();
      },
    };

    await engine.start(wrappedCallbacks, options);
  }

  /**
   * Stop listening and get the final result.
   */
  async stop(): Promise<void> {
    if (!this.activeEngine) {
      return;
    }
    await this.activeEngine.stop();
    this.activeEngine = null;
    this.isListening = false;
  }

  /**
   * Cancel listening and discard results.
   */
  async cancel(): Promise<void> {
    if (!this.activeEngine) {
      return;
    }
    await this.activeEngine.cancel();
    this.activeEngine = null;
    this.isListening = false;
  }

  /**
   * Whether recognition is currently active.
   */
  getIsActive(): boolean {
    return this.isListening;
  }

  /**
   * Get the currently active engine, if any.
   */
  getActiveEngine(): STTEngine | null {
    return this.activeEngine;
  }
}

export const sttRuntime = new STTRuntime();
