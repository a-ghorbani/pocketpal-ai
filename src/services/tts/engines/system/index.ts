import Speech from '@mhpdev/react-native-speech';

import type {Engine, Voice} from '../../types';
import {getSystemVoices} from './voices';

/**
 * Thin wrapper around the OS native TTS path exposed by
 * `@mhpdev/react-native-speech`. Always available on iOS 13+ / Android 8+.
 */
export class SystemEngine implements Engine {
  readonly id = 'system' as const;

  async isInstalled(): Promise<boolean> {
    return true;
  }

  getVoices(): Promise<Voice[]> {
    return getSystemVoices();
  }

  async play(text: string, voice: Voice): Promise<void> {
    await Speech.speak(text, voice.id);
  }

  async stop(): Promise<void> {
    await Speech.stop();
  }
}
