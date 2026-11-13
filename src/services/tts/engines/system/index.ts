import Speech, {TTSEngine} from '@pocketpalai/react-native-speech';

import {l10n} from '../../../../locales';
import {createEngineStreamingHandle} from '../../streamingHandle';
import type {Engine, StreamOptions, StreamingHandle, Voice} from '../../types';
import {getSystemVoices} from './voices';

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
    return getSystemVoices(l10n.en.voiceAndSpeech);
  }

  /**
   * The fork still requires `Speech.initialize({engine: OS_NATIVE})` when
   * switching from a neural engine — needed so playback routes through the
   * OS native path instead of staying on the previously-active neural
   * engine. The runtime calls this whenever System becomes the active
   * engine; switching back to a neural engine triggers its own loadInto.
   *
   * Android OS speech takes audio focus, and so gets call and alarm
   * interruptions, only with `ducking`.
   */
  async loadInto(): Promise<void> {
    await Speech.initialize({engine: TTSEngine.OS_NATIVE, ducking: true});
  }

  /**
   * On the OS engine `Speech.speak()` resolves once the text is queued, so
   * replay goes through a one-shot stream, whose `finalize()` resolves when
   * the last utterance's audio ends (or a `Speech.stop()` settles it).
   */
  async play(text: string, voice: Voice): Promise<void> {
    const handle = createEngineStreamingHandle(this, voice.id);
    handle.appendText(text);
    await handle.finalize();
  }

  playStreaming(
    voice: Voice,
    waitFor?: Promise<void>,
    streamOpts?: StreamOptions,
  ): StreamingHandle {
    return createEngineStreamingHandle(this, voice.id, streamOpts, waitFor);
  }

  async stop(): Promise<void> {
    await Speech.stop();
  }
}
