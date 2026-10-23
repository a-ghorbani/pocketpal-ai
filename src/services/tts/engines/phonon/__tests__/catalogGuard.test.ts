import * as constants from '../../../constants';
import {PHONON_VOICES} from '../voices';

const pinnedUrlParts = (): string[] =>
  Object.entries(constants)
    .filter(([key]) => key.startsWith('PHONON_'))
    .map(([, value]) => JSON.stringify(value));

describe('Phonon catalog', () => {
  it('never pins a non-commercial Phonon 40m model', () => {
    for (const part of pinnedUrlParts()) {
      expect(part).not.toMatch(/phonon-40m/i);
    }
  });

  it('pins only the English 31m checkpoint and its Core ML mirror', () => {
    expect(constants.PHONON_ANDROID_REPO).toBe('gradium/phonon-31m-en');
    expect(constants.PHONON_IOS_REPO).toBe('palshub/phonon-31m-en-coreml');
  });

  it('offers only English voices', () => {
    expect(PHONON_VOICES).toHaveLength(8);
    for (const voice of PHONON_VOICES) {
      expect(voice.language).toMatch(/^en/);
      expect(voice.engine).toBe('phonon');
    }
  });

  it('keeps the Android byte total equal to the pinned file sizes', () => {
    const pinned =
      constants.PHONON_ANDROID_FILES.reduce((sum, f) => sum + f.size, 0) +
      constants.PHONON_VOICE_PINS.length * constants.PHONON_VOICE_FILE_SIZE;
    expect(constants.PHONON_ANDROID_MODEL_BYTES).toBe(pinned);
  });
});
