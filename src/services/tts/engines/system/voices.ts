import Speech from '@pocketpalai/react-native-speech';
import type {VoiceProps} from '@pocketpalai/react-native-speech';

import type {Voice} from '../../types';

/** Android-only fields; `undefined` means the engine did not say. */
type OsVoice = VoiceProps & {
  networkConnectionRequired?: boolean;
  notInstalled?: boolean;
};

/**
 * The OS voice catalog as the picker shows it. Android speaks with the last
 * voice whose name matches the id, so a repeated id keeps its last entry.
 */
export const getSystemVoices = async (): Promise<Voice[]> => {
  const osVoices: OsVoice[] = await Speech.getAvailableVoices();
  const lastById = new Map<string, OsVoice>();
  for (const voice of osVoices) {
    lastById.delete(voice.identifier);
    lastById.set(voice.identifier, voice);
  }
  return [...lastById.values()]
    .filter(voice => voice.notInstalled !== true)
    .map(voice => ({
      id: voice.identifier,
      name: voice.name ?? voice.identifier,
      engine: 'system',
      language: voice.language,
      ...(voice.networkConnectionRequired === true
        ? {requiresNetwork: true}
        : {}),
    }));
};
