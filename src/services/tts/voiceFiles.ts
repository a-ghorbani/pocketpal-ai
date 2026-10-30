import * as RNFS from '@dr.pogodin/react-native-fs';

import {getNeuralEngine} from './engineRegistry';
import type {Voice, VoiceFileSource} from './types';
import {ensureVoiceFileAt} from './voiceFileDownload';

const voiceFileOf = (voice: Voice): VoiceFileSource | undefined =>
  voice.engine === 'system'
    ? undefined
    : getNeuralEngine(voice.engine).voiceFile?.(voice.id);

/** True when the voice's own file is on disk, or the voice has none. */
export const hasVoiceFile = async (voice: Voice): Promise<boolean> => {
  const file = voiceFileOf(voice);
  return file ? RNFS.exists(file.path) : true;
};

/** Present, or downloaded now. Resolves `false` on failure; never rejects. */
export const ensureVoiceFile = async (voice: Voice): Promise<boolean> => {
  const file = voiceFileOf(voice);
  return file ? ensureVoiceFileAt(voice, file) : true;
};
