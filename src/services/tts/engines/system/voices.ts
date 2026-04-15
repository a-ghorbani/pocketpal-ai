import Speech from '@pocketpalai/react-native-speech';

import type {Voice} from '../../types';

/**
 * Fetch the OS-provided voice catalog and map it onto our generic `Voice`
 * shape. Lives in its own file so v2 can grow filtering/sorting helpers
 * (e.g., "only English voices", "group by quality") without touching
 * `SystemEngine`.
 */
export const getSystemVoices = async (): Promise<Voice[]> => {
  const voices = await Speech.getAvailableVoices();
  return voices.map(v => ({
    id: v.identifier,
    name: v.name ?? v.identifier,
    engine: 'system',
    language: v.language,
    character: 'clear',
  }));
};
