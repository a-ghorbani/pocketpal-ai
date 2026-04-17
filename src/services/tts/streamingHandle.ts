import Speech, {
  type SpeechStreamOptions,
} from '@pocketpalai/react-native-speech';

import {ttsRuntime} from './runtime';
import type {Engine, StreamingHandle} from './types';

/**
 * Characters we aim to pack into each synthesis batch after the first
 * sentence. 300 matches the library's default and produces natural
 * multi-sentence prosody without pushing latency too high on the
 * second-batch flush.
 */
const STREAM_TARGET_CHARS = 300;

/**
 * Bridges the library's `createSpeechStream` with our `ttsRuntime`
 * engine-swap guard.
 *
 * The library's stream calls `Speech.speak` internally, which doesn't
 * route through `ttsRuntime.acquire` — so we pin the engine once, up
 * front, and hold appends in a queue until the acquire resolves. After
 * that, appends pass straight through. This keeps the per-call
 * acquire-release overhead out of the streaming hot path while still
 * guaranteeing the correct engine is loaded before any audio starts.
 *
 * `waitFor` lets the caller sequence the acquire behind an external
 * promise (e.g. a prior `stop()` so the old `Speech.stop()` completes
 * before any new synthesis starts — prevents the stop flag from
 * accidentally killing the new stream's first sentence).
 */
export function createEngineStreamingHandle(
  engine: Engine,
  voiceId: string,
  options?: Omit<SpeechStreamOptions, 'targetChars' | 'onError'>,
  waitFor?: Promise<void>,
): StreamingHandle {
  const stream = Speech.createSpeechStream(voiceId, {
    targetChars: STREAM_TARGET_CHARS,
    ...options,
  });

  let acquired = false;
  let dead = false;
  const pending: string[] = [];

  const ready = (waitFor ?? Promise.resolve())
    .catch(() => {
      // Swallow stop errors — we still want to start the new stream.
    })
    .then(() =>
      ttsRuntime.acquire(engine, async () => {
        acquired = true;
        if (dead) {
          return;
        }
        for (const chunk of pending) {
          stream.append(chunk);
        }
        pending.length = 0;
      }),
    )
    .catch(err => {
      console.warn(`[${engine.id}] streaming acquire failed:`, err);
      throw err;
    });

  return {
    appendText(chunk: string) {
      if (dead) {
        return;
      }
      if (acquired) {
        stream.append(chunk);
      } else {
        pending.push(chunk);
      }
    },
    async finalize() {
      if (dead) {
        return;
      }
      await ready;
      await stream.finalize();
    },
    async cancel() {
      if (dead) {
        return;
      }
      dead = true;
      pending.length = 0;
      await stream.cancel();
    },
  };
}
