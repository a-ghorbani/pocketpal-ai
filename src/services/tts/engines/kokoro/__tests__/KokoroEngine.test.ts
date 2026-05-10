/**
 * Tests for KokoroEngine (two-phase install: core files all-or-nothing,
 * per-voice `.bin` best-effort).
 */

import {Platform} from 'react-native';
import * as RNFS from '@dr.pogodin/react-native-fs';
import Speech, {TTSEngine} from '@pocketpalai/react-native-speech';

import {KokoroEngine} from '..';
import {
  KOKORO_MODEL_BASE_URL,
  KOKORO_MODEL_FILES,
  KOKORO_VOICES_BASE_URL,
  KOKORO_VOICES_MANIFEST_FILENAME,
  TTS_DICT_FILENAME,
  TTS_DICT_URL,
} from '../../../constants';
import {KOKORO_VOICES} from '../voices';

const setPlatform = (os: 'ios' | 'android') => {
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    get: () => os,
  });
};

describe('KokoroEngine', () => {
  const anyVoice = KOKORO_VOICES[0]!;

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
      expect(new KokoroEngine().getModelPath()).toBe(
        '/path/to/library/Application Support/tts/kokoro',
      );
    });

    it('returns Documents path on Android', () => {
      setPlatform('android');
      expect(new KokoroEngine().getModelPath()).toBe(
        '/path/to/documents/tts/kokoro',
      );
    });
  });

  describe('isInstalled()', () => {
    it('returns true when core files, dict, and manifest all exist', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      await expect(new KokoroEngine().isInstalled()).resolves.toBe(true);
    });

    it('returns false when a core model file is missing', async () => {
      (RNFS.exists as jest.Mock).mockImplementation((path: string) =>
        Promise.resolve(!path.endsWith('tokenizer.json')),
      );
      await expect(new KokoroEngine().isInstalled()).resolves.toBe(false);
    });

    it('returns false when the dict is missing', async () => {
      (RNFS.exists as jest.Mock).mockImplementation((path: string) =>
        Promise.resolve(!path.endsWith(TTS_DICT_FILENAME)),
      );
      await expect(new KokoroEngine().isInstalled()).resolves.toBe(false);
    });

    it('returns false when the voices manifest is missing', async () => {
      (RNFS.exists as jest.Mock).mockImplementation((path: string) =>
        Promise.resolve(!path.endsWith(KOKORO_VOICES_MANIFEST_FILENAME)),
      );
      await expect(new KokoroEngine().isInstalled()).resolves.toBe(false);
    });
  });

  describe('downloadModel() — two-phase', () => {
    const okDownload = () => ({
      promise: Promise.resolve({statusCode: 200, bytesWritten: 100}),
      jobId: 1,
    });

    it('deletes a legacy FP16 weights file (model.onnx) before downloading FP32', async () => {
      (RNFS.downloadFile as jest.Mock).mockImplementation(okDownload);
      (RNFS.exists as jest.Mock).mockImplementation((path: string) =>
        Promise.resolve(path.endsWith('/model.onnx')),
      );

      await new KokoroEngine().downloadModel();

      expect(RNFS.unlink).toHaveBeenCalledWith(
        expect.stringContaining('/tts/kokoro/model.onnx'),
      );
    });

    it('does not unlink anything when no legacy FP16 weights are present', async () => {
      (RNFS.downloadFile as jest.Mock).mockImplementation(okDownload);
      (RNFS.exists as jest.Mock).mockResolvedValue(false);

      await new KokoroEngine().downloadModel();

      expect(RNFS.unlink).not.toHaveBeenCalledWith(
        expect.stringContaining('/tts/kokoro/model.onnx'),
      );
    });

    it('phase 1 downloads model + tokenizer + dict, phase 2 downloads each voice, then writes manifest', async () => {
      (RNFS.downloadFile as jest.Mock).mockImplementation(okDownload);

      await new KokoroEngine().downloadModel();

      // Phase 1: core files (KOKORO_MODEL_FILES) + dict.
      for (const file of KOKORO_MODEL_FILES) {
        expect(RNFS.downloadFile).toHaveBeenCalledWith(
          expect.objectContaining({
            fromUrl: `${KOKORO_MODEL_BASE_URL}/${file.urlPath}`,
            toFile: expect.stringContaining(`/tts/kokoro/${file.name}`),
          }),
        );
      }
      expect(RNFS.downloadFile).toHaveBeenCalledWith(
        expect.objectContaining({
          fromUrl: TTS_DICT_URL,
          toFile: expect.stringContaining(`/tts/kokoro/${TTS_DICT_FILENAME}`),
        }),
      );

      // Phase 2: every voice is downloaded.
      for (const voice of KOKORO_VOICES) {
        expect(RNFS.downloadFile).toHaveBeenCalledWith(
          expect.objectContaining({
            fromUrl: `${KOKORO_VOICES_BASE_URL}/${voice.id}.bin`,
            toFile: expect.stringContaining(`/voices/${voice.id}.bin`),
          }),
        );
      }

      // Manifest written last.
      expect(RNFS.writeFile).toHaveBeenCalledWith(
        expect.stringContaining(
          `/tts/kokoro/${KOKORO_VOICES_MANIFEST_FILENAME}`,
        ),
        expect.any(String),
      );
    });

    it('phase 1 failure cleans up the model dir and rethrows (manifest NOT written)', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      (RNFS.downloadFile as jest.Mock)
        .mockImplementationOnce(okDownload) // model.onnx succeeds
        .mockImplementationOnce(() => ({
          promise: Promise.resolve({statusCode: 500, bytesWritten: 0}),
          jobId: 2,
        })); // tokenizer fails

      await expect(new KokoroEngine().downloadModel()).rejects.toThrow(
        /HTTP 500/,
      );

      expect(RNFS.unlink).toHaveBeenCalledWith(
        expect.stringContaining('/tts/kokoro'),
      );
      // Manifest must not be written on core failure.
      expect(RNFS.writeFile).not.toHaveBeenCalled();
    });

    it('phase 2 voice failure is tolerated (best-effort): manifest still written, no throw', async () => {
      const coreFilesCount = KOKORO_MODEL_FILES.length + 1; // +dict
      let call = 0;
      (RNFS.downloadFile as jest.Mock).mockImplementation(() => {
        call++;
        if (call <= coreFilesCount) {
          return okDownload();
        }
        // Every voice fails with a non-200 status.
        return {
          promise: Promise.resolve({statusCode: 404, bytesWritten: 0}),
          jobId: call,
        };
      });

      await expect(new KokoroEngine().downloadModel()).resolves.toBeUndefined();

      expect(RNFS.writeFile).toHaveBeenCalledWith(
        expect.stringContaining(KOKORO_VOICES_MANIFEST_FILENAME),
        expect.any(String),
      );
      // Phase-1 cleanup must NOT be triggered.
      expect(RNFS.unlink).not.toHaveBeenCalled();
    });

    it('phase 2 voice rejection is tolerated (best-effort): manifest still written, no throw', async () => {
      const coreFilesCount = KOKORO_MODEL_FILES.length + 1;
      let call = 0;
      (RNFS.downloadFile as jest.Mock).mockImplementation(() => {
        call++;
        if (call <= coreFilesCount) {
          return okDownload();
        }
        return {
          promise: Promise.reject(new Error('network blip')),
          jobId: call,
        };
      });

      await expect(new KokoroEngine().downloadModel()).resolves.toBeUndefined();

      expect(RNFS.writeFile).toHaveBeenCalledWith(
        expect.stringContaining(KOKORO_VOICES_MANIFEST_FILENAME),
        expect.any(String),
      );
    });

    it('reports monotonic progress ending at 1.0', async () => {
      (RNFS.downloadFile as jest.Mock).mockImplementation(okDownload);

      const progresses: number[] = [];
      await new KokoroEngine().downloadModel(p => progresses.push(p));

      expect(progresses.length).toBeGreaterThan(0);
      expect(progresses[progresses.length - 1]).toBe(1);
      expect(Math.min(...progresses)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...progresses)).toBeLessThanOrEqual(1);
    });
  });

  describe('deleteModel()', () => {
    it('unlinks the model directory when present', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      await new KokoroEngine().deleteModel();
      expect(RNFS.unlink).toHaveBeenCalledWith(
        expect.stringContaining('/tts/kokoro'),
      );
    });

    it('no-ops when the directory does not exist', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(false);
      await expect(new KokoroEngine().deleteModel()).resolves.toBeUndefined();
      expect(RNFS.unlink).not.toHaveBeenCalled();
    });
  });

  describe('play()', () => {
    it('throws when the model is not installed', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(false);
      await expect(new KokoroEngine().play('hello', anyVoice)).rejects.toThrow(
        /not installed/i,
      );
    });

    it('initializes lazily with Kokoro engine id and delegates to Speech.speak', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);

      const engine = new KokoroEngine();
      await engine.play('hello', anyVoice);

      expect(Speech.initialize).toHaveBeenCalledTimes(1);
      expect(Speech.initialize).toHaveBeenCalledWith(
        expect.objectContaining({
          engine: TTSEngine.KOKORO,
          modelPath: expect.stringMatching(/^file:\/\/.*model_fp32\.onnx$/),
          tokenizerPath: expect.stringMatching(/tokenizer\.json$/),
          voicesPath: expect.stringMatching(/voices-manifest\.json$/),
          dictPath: expect.stringMatching(/en-us\.bin$/),
          executionProviders: ['cpu'],
        }),
      );
      expect(Speech.speak).toHaveBeenCalledWith('hello', anyVoice.id);

      // Second play() reuses the initialized engine.
      await engine.play('again', anyVoice);
      expect(Speech.initialize).toHaveBeenCalledTimes(1);
    });
  });
});
