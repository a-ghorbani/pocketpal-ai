import {ttsStore} from '../../store';
import type {Voice} from '../tts/types';

export type NeuralVoice = Voice & {engine: Exclude<Voice['engine'], 'system'>};

/**
 * Voice mode needs a neural voice the picker offers on this device: only
 * neural voices report which chunk plays.
 */
export const isVoiceModeVoice = (voice: Voice | null): voice is NeuralVoice =>
  voice != null &&
  voice.engine !== 'system' &&
  ttsStore.isEngineOffered(voice.engine);

export {isMicGranted} from '../../utils/asrMicPermission';
