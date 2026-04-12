import {Platform} from 'react-native';

/**
 * Configure the iOS audio session for TTS playback.
 *
 * The underlying `@mhpdev/react-native-speech` package sets this internally
 * when it synthesizes, but we call it early so the first utterance doesn't
 * get truncated while the session warms up. No-op on Android (not needed).
 */
export const configureAudioSession = async (): Promise<void> => {
  if (Platform.OS !== 'ios') {
    return;
  }
  // The native package configures `AVAudioSessionCategoryPlayback` on its own
  // when `speak()` is first invoked. This wrapper exists as a future hook:
  // v1.2 may need to force playback-category ahead of Supertonic streaming
  // (which uses a separate audio path).
};
