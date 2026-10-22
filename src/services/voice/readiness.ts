import type {Voice} from '../tts/types';

export type NeuralVoice = Voice & {engine: Exclude<Voice['engine'], 'system'>};

/** Voice mode needs a neural voice: only those report which chunk plays. */
export const isVoiceModeVoice = (voice: Voice | null): voice is NeuralVoice =>
  voice != null && voice.engine !== 'system';

export {isMicGranted} from '../../utils/asrMicPermission';
