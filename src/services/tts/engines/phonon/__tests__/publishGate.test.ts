import fs from 'fs';
import path from 'path';

import {
  PHONON_IOS_MANIFEST_SHA256,
  PHONON_IOS_MODEL_BYTES,
  PHONON_IOS_REVISION,
} from '../../../constants';

const ROOT = path.join(__dirname, '../../../../../..');
const read = (relative: string) =>
  fs.readFileSync(path.join(ROOT, relative), 'utf8');

describe('Phonon release pins', () => {
  it('leaves no placeholder in the TTS constants or engine metadata', () => {
    expect(read('src/services/tts/constants.ts')).not.toContain('PLACEHOLDER');
    expect(read('src/components/TTSSetupSheet/engineMeta.ts')).not.toContain(
      'PLACEHOLDER',
    );
  });

  it('pins the iOS model mirror to a commit', () => {
    expect(PHONON_IOS_REVISION).toMatch(/^[0-9a-f]{40}$/);
  });

  it('pins the sha256 of the iOS model manifest', () => {
    expect(PHONON_IOS_MANIFEST_SHA256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('declares the iOS model byte total', () => {
    expect(PHONON_IOS_MODEL_BYTES).toBeGreaterThan(0);
  });

  it('depends on published versions of the speech library and the Phonon add-on', () => {
    const {dependencies} = JSON.parse(read('package.json'));
    expect(dependencies['@pocketpalai/react-native-speech']).toMatch(
      /^\d+\.\d+\.\d+$/,
    );
    expect(dependencies['@pocketpalai/react-native-speech-phonon']).toMatch(
      /^\d+\.\d+\.\d+$/,
    );
  });

  it('commits no local Phonon binary override', () => {
    for (const file of [
      'android/gradle.properties',
      'android/build.gradle',
      'ios/Podfile',
    ]) {
      expect(read(file)).not.toMatch(
        /RNSpeech_phonon|RN_SPEECH_PHONON|\bphonon(LibDir|Abis|ForceReason|SkipHwcapGate)\b/,
      );
    }
  });
});
