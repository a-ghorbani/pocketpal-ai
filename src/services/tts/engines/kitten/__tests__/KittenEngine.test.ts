/**
 * Tests for KittenEngine (single-phase all-or-nothing install).
 */

import {Platform} from 'react-native';
import * as RNFS from '@dr.pogodin/react-native-fs';
import Speech, {TTSEngine} from '@pocketpalai/react-native-speech';

import {KittenEngine} from '..';
import {
  KITTEN_MODEL_BASE_URL,
  KITTEN_MODEL_FILES,
  TTS_DICT_FILENAME,
  TTS_DICT_URL,
} from '../../../constants';
import {KITTEN_VOICES} from '../voices';

const setPlatform = (os: 'ios' | 'android') => {
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    get: () => os,
  });
};

describe('KittenEngine', () => {
  const anyVoice = KITTEN_VOICES[0]!;

  beforeEach(() => {
    jest.clearAllMocks();
    (RNFS as any).__resetMockState?.();
    setPlatform('ios');
    (RNFS.exists as jest.Mock).mockResolvedValue(false);
    (RNFS.mkdir as jest.Mock).mockResolvedValue(undefined);
    (RNFS.writeFile as jest.Mock).mockResolvedValue(undefined);
    (RNFS.unlink as jest.Mock).mockResolvedValue(undefined);
  });

  describe('getModelPath()', () => {
    it('returns iOS Application Support path on iOS', () => {
      setPlatform('ios');
      expect(new KittenEngine().getModelPath()).toBe(
        '/path/to/library/Application Support/tts/kitten',
      );
    });

    it('returns Documents path on Android', () => {
      setPlatform('android');
      expect(new KittenEngine().getModelPath()).toBe(
        '/path/to/documents/tts/kitten',
      );
    });
  });

  describe('isInstalled()', () => {
    it('returns true when all required files exist', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      await expect(new KittenEngine().isInstalled()).resolves.toBe(true);
    });

    it('returns false when the ONNX model file is missing', async () => {
      (RNFS.exists as jest.Mock).mockImplementation((path: string) =>
        Promise.resolve(!path.endsWith('kitten.onnx')),
      );
      await expect(new KittenEngine().isInstalled()).resolves.toBe(false);
    });

    it('returns false when the IPA dict is missing', async () => {
      (RNFS.exists as jest.Mock).mockImplementation((path: string) =>
        Promise.resolve(!path.endsWith(TTS_DICT_FILENAME)),
      );
      await expect(new KittenEngine().isInstalled()).resolves.toBe(false);
    });
  });

  describe('downloadModel()', () => {
    const okDownload = () => ({
      promise: Promise.resolve({statusCode: 200, bytesWritten: 100}),
      jobId: 1,
    });

    it('downloads model files plus dict in a single phase', async () => {
      (RNFS.downloadFile as jest.Mock).mockImplementation(okDownload);

      await new KittenEngine().downloadModel();

      expect(RNFS.downloadFile).toHaveBeenCalledTimes(
        KITTEN_MODEL_FILES.length + 1,
      );
      for (const file of KITTEN_MODEL_FILES) {
        expect(RNFS.downloadFile).toHaveBeenCalledWith(
          expect.objectContaining({
            fromUrl: `${KITTEN_MODEL_BASE_URL}/${file.urlPath}`,
            toFile: expect.stringContaining(`/tts/kitten/${file.name}`),
          }),
        );
      }
      expect(RNFS.downloadFile).toHaveBeenCalledWith(
        expect.objectContaining({
          fromUrl: TTS_DICT_URL,
          toFile: expect.stringContaining(`/tts/kitten/${TTS_DICT_FILENAME}`),
        }),
      );
    });

    it('cleans up and rethrows on any download failure (all-or-nothing)', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      (RNFS.downloadFile as jest.Mock)
        .mockImplementationOnce(okDownload)
        .mockImplementationOnce(() => ({
          promise: Promise.resolve({statusCode: 500, bytesWritten: 0}),
          jobId: 2,
        }));

      await expect(new KittenEngine().downloadModel()).rejects.toThrow(
        /HTTP 500/,
      );
      expect(RNFS.unlink).toHaveBeenCalledWith(
        expect.stringContaining('/tts/kitten'),
      );
    });

    it('reports progress ending at 1.0', async () => {
      (RNFS.downloadFile as jest.Mock).mockImplementation(okDownload);
      const progresses: number[] = [];
      await new KittenEngine().downloadModel(p => progresses.push(p));

      expect(progresses.length).toBeGreaterThan(0);
      expect(progresses[progresses.length - 1]).toBe(1);
      expect(Math.min(...progresses)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...progresses)).toBeLessThanOrEqual(1);
    });
  });

  describe('deleteModel()', () => {
    it('unlinks the model directory when present', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      await new KittenEngine().deleteModel();
      expect(RNFS.unlink).toHaveBeenCalledWith(
        expect.stringContaining('/tts/kitten'),
      );
    });

    it('no-ops when the directory does not exist', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(false);
      await expect(new KittenEngine().deleteModel()).resolves.toBeUndefined();
      expect(RNFS.unlink).not.toHaveBeenCalled();
    });
  });

  describe('play()', () => {
    it('throws when the model is not installed', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(false);
      await expect(new KittenEngine().play('hello', anyVoice)).rejects.toThrow(
        /not installed/i,
      );
    });

    it('initializes lazily with Kitten engine id and delegates to Speech.speak', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);

      const engine = new KittenEngine();
      await engine.play('hello', anyVoice);

      expect(Speech.initialize).toHaveBeenCalledTimes(1);
      expect(Speech.initialize).toHaveBeenCalledWith(
        expect.objectContaining({
          engine: TTSEngine.KITTEN,
          modelPath: expect.stringMatching(/^file:\/\/.*kitten\.onnx$/),
          voicesPath: expect.stringMatching(/voices-manifest\.json$/),
          dictPath: expect.stringMatching(/en-us\.bin$/),
          executionProviders: 'cpu',
        }),
      );
      expect(Speech.speak).toHaveBeenCalledWith('hello', anyVoice.id);

      await engine.play('again', anyVoice);
      expect(Speech.initialize).toHaveBeenCalledTimes(1);
    });
  });
});
