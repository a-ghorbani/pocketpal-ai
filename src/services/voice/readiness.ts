import {ttsStore} from '../../store';
import type {Voice} from '../tts/types';
import {hasVoiceFile} from '../tts/voiceFiles';

export type NeuralVoice = Voice & {engine: Exclude<Voice['engine'], 'system'>};

/**
 * Voice mode needs a neural voice the picker offers on this device: only
 * neural voices report which chunk plays.
 */
export const isVoiceModeVoice = (voice: Voice | null): voice is NeuralVoice =>
  voice != null &&
  voice.engine !== 'system' &&
  ttsStore.isEngineOffered(voice.engine);

export const isVoiceModeVoiceReady = async (
  voice: Voice | null,
): Promise<boolean> => isVoiceModeVoice(voice) && hasVoiceFile(voice);

export {isMicGranted} from '../../utils/asrMicPermission';
