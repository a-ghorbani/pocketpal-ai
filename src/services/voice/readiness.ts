import {Platform} from 'react-native';

import {PERMISSIONS, RESULTS, check} from 'react-native-permissions';

import type {Voice} from '../tts/types';

export type NeuralVoice = Voice & {engine: Exclude<Voice['engine'], 'system'>};

/** Voice mode needs a neural voice: only those report which chunk plays. */
export const isVoiceModeVoice = (voice: Voice | null): voice is NeuralVoice =>
  voice != null && voice.engine !== 'system';

/** Whether the microphone is already granted, without asking. */
export async function isMicGranted(): Promise<boolean> {
  try {
    const status = await check(
      Platform.OS === 'ios'
        ? PERMISSIONS.IOS.MICROPHONE
        : PERMISSIONS.ANDROID.RECORD_AUDIO,
    );
    return status === RESULTS.GRANTED || status === RESULTS.LIMITED;
  } catch (err) {
    console.warn('[voiceMode] microphone check failed:', err);
    return false;
  }
}
