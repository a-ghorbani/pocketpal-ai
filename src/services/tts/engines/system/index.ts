import Speech, {TTSEngine} from '@pocketpalai/react-native-speech';

import {ttsRuntime} from '../../runtime';
import {createEngineStreamingHandle} from '../../streamingHandle';
import type {Engine, StreamingHandle, Voice} from '../../types';
import {getSystemVoices} from './voices';

const SYSTEM_SPEECH_DRAIN_TIMEOUT_MS = 120_000;

/**
 * Thin wrapper around the OS native TTS path exposed by
 * `@pocketpalai/react-native-speech`. Always available on iOS 13+ / Android 8+.
 */
export class SystemEngine implements Engine {
  readonly id = 'system' as const;

  async isInstalled(): Promise<boolean> {
    return true;
  }

  getVoices(): Promise<Voice[]> {
    return getSystemVoices();
  }

  /**
   * The fork still requires `Speech.initialize({engine: OS_NATIVE})` when
   * switching from a neural engine — needed so playback routes through the
   * OS native path instead of staying on the previously-active neural
   * engine. The runtime calls this whenever System becomes the active
   * engine; switching back to a neural engine triggers its own loadInto.
   */
  async loadInto(): Promise<void> {
    await Speech.initialize({engine: TTSEngine.OS_NATIVE});
  }

  async play(text: string, voice: Voice): Promise<void> {
    await ttsRuntime.acquire(this, () => Speech.speak(text, voice.id));
  }

  /**
   * Streaming path. The library's stream degrades to roughly per-sentence
   * speaks on OS engine (native `speak()` resolves on dispatch, so the
   * stream's underrun guard fires immediately), but the OS native queue
   * handles the chaining — behavior is equivalent to the prior JS-side
   * `onFinish` loop and we inherit the library's CJK sentence handling.
   */
  playStreaming(voice: Voice, waitFor?: Promise<void>): StreamingHandle {
    const delegate = createEngineStreamingHandle(
      this,
      voice.id,
      undefined,
      waitFor,
    );
    let cancelled = false;
    return {
      appendText: delegate.appendText,
      async finalize() {
        await delegate.finalize();
        const deadline = Date.now() + SYSTEM_SPEECH_DRAIN_TIMEOUT_MS;
        const startupDeadline = Date.now() + 1_000;
        let observedSpeaking = false;
        let consecutiveIdleChecks = 0;
        while (!cancelled && consecutiveIdleChecks < 2) {
          if (Date.now() >= deadline) {
            throw new Error('System speech playback did not finish in time');
          }
          const speaking = await Speech.isSpeaking();
          observedSpeaking ||= speaking;
          consecutiveIdleChecks =
            observedSpeaking && !speaking ? consecutiveIdleChecks + 1 : 0;
          if (!observedSpeaking && Date.now() >= startupDeadline) {
            return;
          }
          if (!cancelled && consecutiveIdleChecks < 2) {
            await new Promise(resolve => setTimeout(resolve, 40));
          }
        }
      },
      async cancel() {
        cancelled = true;
        await delegate.cancel();
      },
    };
  }

  async stop(): Promise<void> {
    await Speech.stop();
  }
}
