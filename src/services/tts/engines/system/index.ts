import Speech, {TTSEngine} from '@pocketpalai/react-native-speech';

import {ttsRuntime} from '../../runtime';
import {createEngineStreamingHandle} from '../../streamingHandle';
import type {Engine, StreamingHandle, Voice} from '../../types';
import {getSystemVoices} from './voices';

const SYSTEM_SPEECH_DRAIN_TIMEOUT_MS = 120_000;
const SYSTEM_SPEECH_START_TIMEOUT_MS = 1_000;

async function waitForSystemSpeechDrain(
  isCancelled: () => boolean,
  hasFinished: () => boolean,
  hasFailed: () => boolean,
) {
  const deadline = Date.now() + SYSTEM_SPEECH_DRAIN_TIMEOUT_MS;
  const startupDeadline = Date.now() + SYSTEM_SPEECH_START_TIMEOUT_MS;
  let observedSpeaking = false;
  let consecutiveIdleChecks = 0;
  while (!isCancelled() && consecutiveIdleChecks < 2) {
    if (hasFailed()) {
      throw new Error('System speech playback failed');
    }
    if (Date.now() >= deadline) {
      throw new Error('System speech playback did not finish in time');
    }
    const speaking = await Speech.isSpeaking();
    observedSpeaking ||= speaking || hasFinished();
    consecutiveIdleChecks =
      observedSpeaking && !speaking ? consecutiveIdleChecks + 1 : 0;
    if (!observedSpeaking && Date.now() >= startupDeadline) {
      throw new Error('System speech playback was not observed');
    }
    if (!isCancelled() && consecutiveIdleChecks < 2) {
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    if (hasFailed()) {
      throw new Error('System speech playback failed');
    }
  }
}

/**
 * Thin wrapper around the OS native TTS path exposed by
 * `@pocketpalai/react-native-speech`. Always available on iOS 13+ / Android 8+.
 */
export class SystemEngine implements Engine {
  readonly id = 'system' as const;
  private playbackVersion = 0;

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
    const version = ++this.playbackVersion;
    let finished = false;
    let failed = false;
    const finishSubscription = Speech.onFinish(() => {
      finished = true;
    });
    const errorSubscription = Speech.onError(() => {
      failed = true;
    });
    try {
      await ttsRuntime.acquire(this, async () => {
        await Speech.speak(text, voice.id);
        await waitForSystemSpeechDrain(
          () => this.playbackVersion !== version,
          () => finished,
          () => failed,
        );
      });
    } finally {
      finishSubscription.remove();
      errorSubscription.remove();
    }
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
    let finished = false;
    let failed = false;
    const finishSubscription = Speech.onFinish(() => {
      finished = true;
    });
    const errorSubscription = Speech.onError(() => {
      failed = true;
    });
    const removeListeners = () => {
      finishSubscription.remove();
      errorSubscription.remove();
    };
    return {
      appendText: delegate.appendText,
      async finalize() {
        try {
          await delegate.finalize();
          await waitForSystemSpeechDrain(
            () => cancelled,
            () => finished,
            () => failed,
          );
        } finally {
          removeListeners();
        }
      },
      async cancel() {
        cancelled = true;
        try {
          await delegate.cancel();
        } finally {
          removeListeners();
        }
      },
    };
  }

  async stop(): Promise<void> {
    this.playbackVersion += 1;
    await Speech.stop();
  }
}
