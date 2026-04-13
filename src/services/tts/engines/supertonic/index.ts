import type {Engine, StreamingHandle, Voice} from '../../types';
import {SUPERTONIC_VOICES} from './voices';

/**
 * Supertonic engine — STUB for v1.0.
 *
 * The voice catalog is real (`SUPERTONIC_VOICES`) so the v1.1 UI can render
 * selection state. Model download and inference are deferred to v1.2; every
 * method that requires the model throws a clear "not installed" error which
 * `TTSStore.play` catches and swallows so the app stays interactive.
 */
export class SupertonicEngine implements Engine {
  readonly id = 'supertonic' as const;

  async isInstalled(): Promise<boolean> {
    return false;
  }

  async getVoices(): Promise<Voice[]> {
    return SUPERTONIC_VOICES;
  }

  async play(_text: string, _voice: Voice): Promise<void> {
    throw new Error('Supertonic not installed (enabled in v1.2)');
  }

  playStreaming(_voice: Voice): StreamingHandle {
    // v1.0 stub: silently accumulate chunks; reject on finalize with the
    // same "not installed" contract as `play()`. The store catches this and
    // resets to idle, matching R1 swallow-the-stub-error semantics.
    let dead = false;
    return {
      appendText(_chunk: string) {
        // silent no-op
      },
      async finalize() {
        if (dead) {
          return;
        }
        throw new Error('Supertonic not installed (enabled in v1.2)');
      },
      async cancel() {
        dead = true;
      },
    };
  }

  async stop(): Promise<void> {
    // No-op: nothing can be playing because `play` always throws in v1.0.
  }

  async downloadModel(): Promise<void> {
    throw new Error('Supertonic downloadModel not implemented in v1.0');
  }

  async deleteModel(): Promise<void> {
    throw new Error('Supertonic deleteModel not implemented in v1.0');
  }

  getModelPath(): string {
    throw new Error('Supertonic getModelPath not implemented in v1.0');
  }
}
