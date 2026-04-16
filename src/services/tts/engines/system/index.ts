import Speech, {TTSEngine} from '@pocketpalai/react-native-speech';

import {ttsRuntime} from '../../runtime';
import type {Engine, StreamingHandle, Voice} from '../../types';
import {getSystemVoices} from './voices';

/**
 * Match the longest prefix ending in a sentence-terminating punctuation
 * mark (ASCII + common CJK) followed by whitespace or end-of-string.
 * Non-greedy so we extract one sentence at a time from the buffer.
 */
const SENTENCE_END = /^[\s\S]*?[.!?。！？](?=\s|$)/;

/**
 * JS-side sentence chaining streaming handle.
 *
 * The fork does not expose a per-utterance native queue, so we drive the
 * chain ourselves: buffer incoming text, extract whole sentences, and feed
 * them to `Speech.speak` one at a time. Each `onFinish` event pops the
 * next queued sentence. This keeps latency to first speech close to "time
 * to first sentence" rather than "time to full response".
 */
const createSystemStreamingHandle = (
  engine: Engine,
  voice: Voice,
): StreamingHandle => {
  let buffer = '';
  const queue: string[] = [];
  let speaking = false;
  let dead = false;
  let finalizeResolve: (() => void) | null = null;
  let finalized = false;

  const speakNext = () => {
    if (dead) {
      return;
    }
    const next = queue.shift();
    if (next === undefined) {
      speaking = false;
      if (finalized && finalizeResolve) {
        finalizeResolve();
        finalizeResolve = null;
      }
      return;
    }
    speaking = true;
    ttsRuntime
      .acquire(engine, () => Speech.speak(next, voice.id))
      .catch(err => {
        console.warn('[SystemEngine] speak failed:', err);
      });
  };

  const subscription = Speech.onFinish(() => {
    if (dead) {
      return;
    }
    speakNext();
  });

  const drainBuffer = () => {
    while (true) {
      const match = buffer.match(SENTENCE_END);
      if (!match) {
        break;
      }
      const sentence = match[0].trim();
      buffer = buffer.slice(match[0].length);
      if (sentence.length > 0) {
        queue.push(sentence);
      }
    }
  };

  return {
    appendText(chunk: string) {
      if (dead || finalized) {
        return;
      }
      buffer += chunk;
      drainBuffer();
      if (!speaking) {
        speakNext();
      }
    },
    async finalize() {
      if (dead || finalized) {
        return;
      }
      finalized = true;
      drainBuffer();
      const tail = buffer.trim();
      buffer = '';
      if (tail.length > 0) {
        queue.push(tail);
      }
      if (!speaking) {
        speakNext();
      }
      // If nothing was ever queued, resolve immediately.
      if (queue.length === 0 && !speaking) {
        subscription.remove();
        return;
      }
      await new Promise<void>(resolve => {
        finalizeResolve = () => {
          subscription.remove();
          resolve();
        };
      });
    },
    async cancel() {
      if (dead) {
        return;
      }
      dead = true;
      queue.length = 0;
      buffer = '';
      subscription.remove();
      if (finalizeResolve) {
        finalizeResolve();
        finalizeResolve = null;
      }
      await ttsRuntime.stop();
    },
  };
};

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

  playStreaming(voice: Voice): StreamingHandle {
    return createSystemStreamingHandle(this, voice);
  }

  async stop(): Promise<void> {
    await ttsRuntime.stop();
  }
}
