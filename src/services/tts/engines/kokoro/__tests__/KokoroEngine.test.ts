/**
 * Tests for KokoroEngine (two-phase install: core files all-or-nothing,
 * per-voice `.bin` best-effort).
 */

import {Platform} from 'react-native';
import * as RNFS from '@dr.pogodin/react-native-fs';
import Speech, {TTSEngine} from '@pocketpalai/react-native-speech';
import {waitFor} from '@testing-library/react-native';

import {KokoroEngine} from '..';
import {ttsRuntime} from '../../../runtime';
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
            fromUrl:
              'url' in file
                ? file.url
                : `${KOKORO_MODEL_BASE_URL}/${file.urlPath}`,
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
            toFile: expect.stringMatching(
              new RegExp(`/voices/${voice.id}\\.bin\\.part$`),
            ),
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

    it('keeps baseUrl in the voices manifest', async () => {
      (RNFS.downloadFile as jest.Mock).mockImplementation(okDownload);

      await new KokoroEngine().downloadModel();

      const manifestCall = (RNFS.writeFile as jest.Mock).mock.calls.find(
        ([p]: [string]) => p.endsWith(`/${KOKORO_VOICES_MANIFEST_FILENAME}`),
      );
      expect(JSON.parse(manifestCall![1])).toHaveProperty(
        'baseUrl',
        KOKORO_VOICES_BASE_URL,
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
      const unlinked = (RNFS.unlink as jest.Mock).mock.calls.map(
        ([path]: [string]) => path,
      );
      expect(unlinked.every(path => path.endsWith('.bin.part'))).toBe(true);
      expect(RNFS.moveFile).not.toHaveBeenCalled();
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

  describe('playStreaming()', () => {
    it('passes voice stream options to the lib stream', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      ttsRuntime._resetForTests();
      const onProgress = jest.fn();

      new KokoroEngine().playStreaming(anyVoice, undefined, {
        firstChunk: 'clause',
        onProgress,
      });
      await waitFor(() =>
        expect(Speech.createSpeechStream).toHaveBeenCalledWith(
          anyVoice.id,
          expect.objectContaining({firstChunk: 'clause'}),
        ),
      );
    });
  });

  describe('per-platform weights and migration', () => {
    const INT8_URL =
      'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/1939ad2a8e416c0acfeecc08a694d14ef25f2231/onnx/model_quantized.onnx';
    const DIRS = {
      android: '/path/to/documents/tts/kokoro',
      ios: '/path/to/library/Application Support/tts/kokoro',
    };
    const FP32_INSTALL = [
      'model_fp32.onnx',
      'tokenizer.json',
      TTS_DICT_FILENAME,
      KOKORO_VOICES_MANIFEST_FILENAME,
      'voices/af_heart.bin',
    ];

    type Loaded = {
      engine: KokoroEngine;
      fs: Record<string, jest.Mock>;
      speech: typeof Speech;
      files: Set<string>;
      dir: string;
    };

    // Constants are chosen per platform at module load, so each platform gets
    // its own module registry over a small in-memory filesystem. Platform is
    // set in both registries: react-native resolves it lazily on each access.
    const loadOn = (os: 'ios' | 'android', present: string[]): Loaded => {
      const dir = DIRS[os];
      const files = new Set(present.map(name => `${dir}/${name}`));
      let loaded!: Loaded;
      setPlatform(os);
      jest.isolateModules(() => {
        Object.defineProperty(require('react-native').Platform, 'OS', {
          configurable: true,
          get: () => os,
        });
        const fs = require('@dr.pogodin/react-native-fs');
        fs.exists.mockImplementation(async (path: string) => files.has(path));
        fs.mkdir.mockResolvedValue(undefined);
        fs.unlink.mockImplementation(async (path: string) => {
          for (const file of [...files]) {
            if (file === path || file.startsWith(`${path}/`)) {
              files.delete(file);
            }
          }
        });
        fs.writeFile.mockImplementation(async (path: string) => {
          files.add(path);
        });
        fs.moveFile.mockImplementation(async (from: string, to: string) => {
          files.delete(from);
          files.add(to);
        });
        fs.downloadFile.mockImplementation(({toFile}: {toFile: string}) => {
          files.add(toFile);
          return {
            jobId: 1,
            promise: Promise.resolve({statusCode: 200, bytesWritten: 1}),
          };
        });
        loaded = {
          engine: new (require('..').KokoroEngine)(),
          fs,
          speech: require('@pocketpalai/react-native-speech').default,
          files,
          dir,
        };
      });
      return loaded;
    };

    const has = ({files, dir}: Loaded, name: string) =>
      files.has(`${dir}/${name}`);

    describe('Android (int8)', () => {
      it('downloads the pinned int8 weights into model_int8.onnx and loads them', async () => {
        const kokoro = loadOn('android', []);

        await kokoro.engine.downloadModel();

        expect(kokoro.fs.downloadFile).toHaveBeenCalledWith(
          expect.objectContaining({
            fromUrl: INT8_URL,
            toFile: `${kokoro.dir}/model_int8.onnx`,
          }),
        );
        expect(kokoro.fs.downloadFile).not.toHaveBeenCalledWith(
          expect.objectContaining({
            fromUrl: expect.stringContaining('onnx/model.onnx'),
          }),
        );
        await expect(kokoro.engine.isInstalled()).resolves.toBe(true);

        await kokoro.engine.loadInto();
        expect(kokoro.speech.initialize).toHaveBeenCalledWith(
          expect.objectContaining({
            modelPath: `file://${kokoro.dir}/model_int8.onnx`,
          }),
        );
      });

      it('reads an FP32 install as not installed and deletes its weights', async () => {
        const kokoro = loadOn('android', [...FP32_INSTALL, 'model.onnx']);

        await expect(kokoro.engine.isInstalled()).resolves.toBe(false);

        expect(has(kokoro, 'model_fp32.onnx')).toBe(false);
        expect(has(kokoro, 'model.onnx')).toBe(false);
        expect(has(kokoro, 'tokenizer.json')).toBe(true);
        expect(has(kokoro, TTS_DICT_FILENAME)).toBe(true);
        expect(has(kokoro, 'voices/af_heart.bin')).toBe(true);
      });

      it('reclaimLegacySpace() keeps the int8 install intact', async () => {
        const kokoro = loadOn('android', ['model_int8.onnx', ...FP32_INSTALL]);

        await kokoro.engine.reclaimLegacySpace();

        expect(has(kokoro, 'model_fp32.onnx')).toBe(false);
        expect(has(kokoro, 'model_int8.onnx')).toBe(true);
        await expect(kokoro.engine.isInstalled()).resolves.toBe(true);
      });

      it('an install check still runs when the reclaim fails', async () => {
        const kokoro = loadOn('android', ['model_int8.onnx', ...FP32_INSTALL]);
        kokoro.fs.exists.mockImplementationOnce(() =>
          Promise.reject(new Error('io')),
        );

        await expect(kokoro.engine.isInstalled()).resolves.toBe(true);
      });

      it('deletes the old voices manifest before the first core download', async () => {
        const kokoro = loadOn('android', FP32_INSTALL);
        let manifestAtFirstDownload: boolean | undefined;
        kokoro.fs.downloadFile.mockImplementation(
          ({toFile}: {toFile: string}) => {
            manifestAtFirstDownload ??= has(
              kokoro,
              KOKORO_VOICES_MANIFEST_FILENAME,
            );
            kokoro.files.add(toFile);
            return {
              jobId: 1,
              promise: Promise.resolve({statusCode: 200, bytesWritten: 1}),
            };
          },
        );

        await kokoro.engine.downloadModel();

        expect(manifestAtFirstDownload).toBe(false);
        expect(has(kokoro, KOKORO_VOICES_MANIFEST_FILENAME)).toBe(true);
      });

      it('an install killed during the weights download never reads as installed', async () => {
        const kokoro = loadOn('android', FP32_INSTALL);
        kokoro.fs.downloadFile.mockImplementation(
          ({toFile}: {toFile: string}) => {
            kokoro.files.add(toFile);
            return {jobId: 1, promise: new Promise(() => {})};
          },
        );

        kokoro.engine.downloadModel();
        await waitFor(() =>
          expect(kokoro.fs.downloadFile).toHaveBeenCalledTimes(1),
        );

        await expect(kokoro.engine.isInstalled()).resolves.toBe(false);
      });
    });

    describe('iOS (FP32)', () => {
      it('keeps an FP32 install installed and untouched', async () => {
        const kokoro = loadOn('ios', FP32_INSTALL);

        await expect(kokoro.engine.isInstalled()).resolves.toBe(true);
        await kokoro.engine.reclaimLegacySpace();

        expect(kokoro.files).toEqual(
          new Set(FP32_INSTALL.map(name => `${kokoro.dir}/${name}`)),
        );
        expect(kokoro.fs.downloadFile).not.toHaveBeenCalled();
      });

      it('reclaims only the FP16 weights', async () => {
        const kokoro = loadOn('ios', [...FP32_INSTALL, 'model.onnx']);

        await kokoro.engine.reclaimLegacySpace();

        expect(has(kokoro, 'model.onnx')).toBe(false);
        expect(has(kokoro, 'model_fp32.onnx')).toBe(true);
      });

      it('downloads FP32 weights into model_fp32.onnx and loads them', async () => {
        const kokoro = loadOn('ios', []);

        await kokoro.engine.downloadModel();

        expect(kokoro.fs.downloadFile).toHaveBeenCalledWith(
          expect.objectContaining({
            fromUrl: `${KOKORO_MODEL_BASE_URL}/onnx/model.onnx`,
            toFile: `${kokoro.dir}/model_fp32.onnx`,
          }),
        );
        await kokoro.engine.loadInto();
        expect(kokoro.speech.initialize).toHaveBeenCalledWith(
          expect.objectContaining({
            modelPath: `file://${kokoro.dir}/model_fp32.onnx`,
          }),
        );
      });
    });
  });
});
