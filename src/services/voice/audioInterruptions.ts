import {NativeNeuralAudioPlayer} from '@pocketpalai/react-native-speech/lib/module/NativeAudioPlayer.js';

/** An OS audio interruption: a call, an alarm, Siri, or lost audio focus. */
export interface AudioInterruption {
  type: 'began' | 'ended';
}

/** Subscribes to the speech library's audio-session interruptions. */
export const onAudioInterruption = (
  listener: (event: AudioInterruption) => void,
): {remove(): void} => NativeNeuralAudioPlayer.onAudioInterruption(listener);
