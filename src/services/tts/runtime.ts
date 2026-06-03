import Speech from '@pocketpalai/react-native-speech';

import type {Engine, EngineId} from './types';

/**
 * Single-slot coordinator for the TTS native runtime.
 *
 * The fork's `Speech` module is global — only one neural engine has its
 * model loaded at a time. The previous design tracked initialization
 * per-engine-wrapper, which lied: a wrapper said `initialized=true`
 * even after another engine had silently swapped it out at the native
 * layer.
 *
 * `TTSRuntime` owns the truth ("which engine is currently loaded in
 * native land") and serializes all engine swaps and initialization
 * calls. Engine wrappers route their `play()` / `playStreaming()`
 * through `acquire()`, which guarantees the requested engine is the
 * active one before invoking the work fn.
 */
class TTSRuntime {
  /** id of the engine currently loaded in native land, null if released. */
  private activeEngineId: EngineId | null = null;
  /** FIFO chain of pending operations — guarantees no concurrent swaps. */
  private opMutex: Promise<unknown> = Promise.resolve();

  /**
   * Run `fn` with `engineId` guaranteed to be the active native engine.
   * Releases the previous engine (if neural) and loads the new one when
   * the active id doesn't match.
   *
   * Calls are serialized — concurrent acquires queue rather than racing.
   */
  async acquire<T>(engine: Engine, fn: () => Promise<T>): Promise<T> {
    return this.serialize(async () => {
      if (this.activeEngineId !== engine.id) {
        if (this.activeEngineId !== null) {
          await this.releaseInternal();
        }
        await engine.loadInto();
        this.activeEngineId = engine.id;
      }
      return fn();
    });
  }

  /**
   * Release the active engine's native resources. Safe to call when no
   * engine is active (no-op). Serialized with `acquire`.
   */
  async release(): Promise<void> {
    await this.serialize(async () => {
      await this.releaseInternal();
    });
  }

  /**
   * Stop any in-flight native playback. Serialized with `acquire` so a
   * subsequent `acquire()` queued on the same mutex runs AFTER the stop
   * completes — this is the only reason to prefer this over calling
   * `Speech.stop()` directly. Without serialization, a fire-and-forget
   * stop can cancel a newly-started utterance that was ordered later in
   * JS but reached native first.
   *
   * No-op when no engine is active.
   */
  async stop(): Promise<void> {
    await this.serialize(async () => {
      if (this.activeEngineId === null) {
        return;
      }
      try {
        await Speech.stop();
      } catch (err) {
        console.warn('[ttsRuntime] stop failed:', err);
      }
    });
  }

  /** Read-only view of which engine is currently loaded. Test/diagnostic use. */
  getActiveEngineId(): EngineId | null {
    return this.activeEngineId;
  }

  /**
   * Test-only synchronous reset. Clears the active id and resets the
   * mutex chain to a fresh resolved promise so a singleton runtime can
   * be used across isolated test cases without inter-test leakage.
   */
  _resetForTests(): void {
    this.activeEngineId = null;
    this.opMutex = Promise.resolve();
  }

  private async releaseInternal(): Promise<void> {
    const prev = this.activeEngineId;
    if (prev === null) {
      return;
    }
    // System engine doesn't hold neural resources — nothing to release.
    if (prev !== 'system') {
      try {
        await Speech.release();
      } catch (err) {
        console.warn(`[ttsRuntime] release failed for ${prev}:`, err);
      }
    }
    this.activeEngineId = null;
  }

  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.opMutex.then(fn, fn);
    // Keep the chain alive even if `fn` rejects. Swallow only here; the
    // returned promise still propagates the original rejection to the
    // caller.
    this.opMutex = next.catch(() => undefined);
    return next;
  }
}

export const ttsRuntime = new TTSRuntime();
