import {ttsStore} from '../../store';
import type {Voice} from '../tts/types';
import {hasVoiceFile} from '../tts/voiceFiles';

/** Voice mode speaks with any voice the picker offers on this device. */
export const isVoiceModeVoice = (voice: Voice | null): voice is Voice =>
  voice != null && ttsStore.isEngineOffered(voice.engine);

export const isVoiceModeVoiceReady = async (
  voice: Voice | null,
): Promise<boolean> => isVoiceModeVoice(voice) && hasVoiceFile(voice);

export {isMicGranted} from '../../utils/asrMicPermission';
