import {Platform} from 'react-native';
import * as RNFS from '@dr.pogodin/react-native-fs';

import {
  KITTEN_MODEL_BASE_URL,
  KOKORO_VOICES_BASE_URL,
  SUPERTONIC_VOICES_BASE_URL,
} from '../constants';
import {ttsRuntime} from '../runtime';
import type {Voice} from '../types';
import {ensureVoiceFile, hasVoiceFile} from '../voiceFiles';

const kokoroDir = '/path/to/documents/tts/kokoro';
const kittenDir = '/path/to/documents/tts/kitten';
const supertonicDir = '/path/to/documents/tts/supertonic';

const bella: Voice = {id: 'af_bella', name: 'Bella', engine: 'kokoro'};
const kittenBella: Voice = {
  id: 'expr-voice-2-f',
  name: 'Bella',
  engine: 'kitten',
};
const lily: Voice = {id: 'F2', name: 'Lily', engine: 'supertonic'};
const phonon: Voice = {id: 'en_us-amy', name: 'Amy', engine: 'phonon'};
const system: Voice = {id: 'com.apple.x', name: 'X', engine: 'system'};

const bellaPath = `${kokoroDir}/voices/af_bella.bin`;

const mockDownload = (result: Promise<{statusCode: number}>) =>
  (RNFS.downloadFile as jest.Mock).mockReturnValue({promise: result});

describe('voice files', () => {
  let warn: jest.SpyInstance;
  let invalidate: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      get: () => 'android',
    });
    (RNFS.exists as jest.Mock).mockResolvedValue(false);
    (RNFS.mkdir as jest.Mock).mockResolvedValue(undefined);
    (RNFS.unlink as jest.Mock).mockResolvedValue(undefined);
    mockDownload(Promise.resolve({statusCode: 200}));
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    invalidate = jest.spyOn(ttsRuntime, 'invalidate');
  });

  afterEach(() => {
    warn.mockRestore();
    invalidate.mockRestore();
  });

  describe('hasVoiceFile', () => {
    it('checks the engine voice path', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      await expect(hasVoiceFile(bella)).resolves.toBe(true);
      expect(RNFS.exists).toHaveBeenCalledWith(bellaPath);

      (RNFS.exists as jest.Mock).mockResolvedValue(false);
      await expect(hasVoiceFile(bella)).resolves.toBe(false);
    });

    it.each([phonon, system])(
      'is true with no I/O for a voice without its own file (%s)',
      async voice => {
        await expect(hasVoiceFile(voice)).resolves.toBe(true);
        expect(RNFS.exists).not.toHaveBeenCalled();
      },
    );
  });

  describe('ensureVoiceFile', () => {
    it('does one exists and nothing else when the file is present', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);

      await expect(ensureVoiceFile(bella)).resolves.toBe(true);

      expect(RNFS.exists).toHaveBeenCalledTimes(1);
      expect(RNFS.downloadFile).not.toHaveBeenCalled();
      expect(RNFS.mkdir).not.toHaveBeenCalled();
    });

    it.each([phonon, system])(
      'is true with no I/O for a voice without its own file (%s)',
      async voice => {
        await expect(ensureVoiceFile(voice)).resolves.toBe(true);
        expect(RNFS.exists).not.toHaveBeenCalled();
        expect(RNFS.downloadFile).not.toHaveBeenCalled();
      },
    );

    it('downloads to .part and moves it into place after HTTP 200', async () => {
      await expect(ensureVoiceFile(bella)).resolves.toBe(true);

      expect(RNFS.mkdir).toHaveBeenCalledWith(`${kokoroDir}/voices`, {
        NSURLIsExcludedFromBackupKey: true,
      });
      expect(RNFS.downloadFile).toHaveBeenCalledWith(
        expect.objectContaining({
          fromUrl: `${KOKORO_VOICES_BASE_URL}/af_bella.bin`,
          toFile: `${bellaPath}.part`,
        }),
      );
      expect(RNFS.moveFile).toHaveBeenCalledWith(
        `${bellaPath}.part`,
        bellaPath,
      );
      expect(RNFS.unlink).not.toHaveBeenCalled();
    });

    it('unlinks a file that appeared at the voice path before moving', async () => {
      (RNFS.exists as jest.Mock)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      await expect(ensureVoiceFile(bella)).resolves.toBe(true);

      const unlinkOrder = (RNFS.unlink as jest.Mock).mock
        .invocationCallOrder[0];
      const moveOrder = (RNFS.moveFile as jest.Mock).mock
        .invocationCallOrder[0];
      expect(RNFS.unlink).toHaveBeenCalledWith(bellaPath);
      expect(unlinkOrder).toBeLessThan(moveOrder!);
    });

    it('removes the .part file and never moves on a non-200', async () => {
      mockDownload(Promise.resolve({statusCode: 404}));

      await expect(ensureVoiceFile(bella)).resolves.toBe(false);

      expect(RNFS.unlink).toHaveBeenCalledWith(`${bellaPath}.part`);
      expect(RNFS.moveFile).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('resolves false with one warning when the download throws', async () => {
      mockDownload(Promise.reject(new Error('Network request failed')));

      await expect(ensureVoiceFile(bella)).resolves.toBe(false);

      expect(RNFS.moveFile).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('shares one download between concurrent calls for the same voice', async () => {
      let finish: (value: {statusCode: number}) => void = () => {};
      mockDownload(new Promise(resolve => (finish = resolve)));

      const first = ensureVoiceFile(bella);
      const second = ensureVoiceFile(bella);
      await Promise.resolve();
      finish({statusCode: 200});

      await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
      expect(RNFS.downloadFile).toHaveBeenCalledTimes(1);
    });

    it('invalidates Supertonic after downloading one of its styles', async () => {
      await expect(ensureVoiceFile(lily)).resolves.toBe(true);

      expect(RNFS.downloadFile).toHaveBeenCalledWith(
        expect.objectContaining({
          fromUrl: `${SUPERTONIC_VOICES_BASE_URL}/F2.json`,
          toFile: `${supertonicDir}/F2.json.part`,
        }),
      );
      expect(invalidate).toHaveBeenCalledWith('supertonic');
    });

    it('does not invalidate on the Supertonic fast path', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      await ensureVoiceFile(lily);
      expect(invalidate).not.toHaveBeenCalled();
    });

    it('does not invalidate after a Kokoro download', async () => {
      await ensureVoiceFile(bella);
      expect(invalidate).not.toHaveBeenCalled();
    });

    it('fetches a Kitten voice from the voices folder of its model repo', async () => {
      await expect(ensureVoiceFile(kittenBella)).resolves.toBe(true);

      expect(RNFS.downloadFile).toHaveBeenCalledWith(
        expect.objectContaining({
          fromUrl: `${KITTEN_MODEL_BASE_URL}/voices/expr-voice-2-f.json`,
          toFile: `${kittenDir}/voices/expr-voice-2-f.json.part`,
        }),
      );
      expect(RNFS.moveFile).toHaveBeenCalledWith(
        `${kittenDir}/voices/expr-voice-2-f.json.part`,
        `${kittenDir}/voices/expr-voice-2-f.json`,
      );
    });
  });
});
