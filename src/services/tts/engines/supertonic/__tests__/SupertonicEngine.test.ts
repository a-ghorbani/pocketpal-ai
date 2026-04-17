/**
 * Tests for the v1.2 real SupertonicEngine.
 *
 * Mocks `@dr.pogodin/react-native-fs` via `__mocks__/external/...` and
 * `@pocketpalai/react-native-speech` via `moduleNameMapper`. Platform.OS is
 * overridden per-test via `jest.doMock` / `Object.defineProperty`.
 */

import {Platform} from 'react-native';
import * as RNFS from '@dr.pogodin/react-native-fs';
import Speech, {TTSEngine} from '@pocketpalai/react-native-speech';

import {SupertonicEngine} from '..';
import {
  SUPERTONIC_MODEL_BASE_URL,
  SUPERTONIC_MODEL_FILES,
  SUPERTONIC_VOICES_MANIFEST_FILENAME,
} from '../../../constants';
import {ttsRuntime} from '../../../runtime';
import {SUPERTONIC_VOICES} from '../voices';

import {
  __getCreatedStreams,
  __resetCreatedStreams,
} from '../../../../../../__mocks__/external/@pocketpalai/react-native-speech';

const setPlatform = (os: 'ios' | 'android') => {
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    get: () => os,
  });
};

describe('SupertonicEngine (v1.2 real)', () => {
  const anyVoice = SUPERTONIC_VOICES[0]!;

  beforeEach(() => {
    jest.clearAllMocks();
    (RNFS as any).__resetMockState?.();
    __resetCreatedStreams();
    ttsRuntime._resetForTests();
    setPlatform('ios');
    // By default mark as fresh install (no files exist yet).
    (RNFS.exists as jest.Mock).mockResolvedValue(false);
    (RNFS.mkdir as jest.Mock).mockResolvedValue(undefined);
    (RNFS.writeFile as jest.Mock).mockResolvedValue(undefined);
    (RNFS.unlink as jest.Mock).mockResolvedValue(undefined);
  });

  describe('getModelPath()', () => {
    it('returns iOS Application Support path on iOS', () => {
      setPlatform('ios');
      const engine = new SupertonicEngine();
      expect(engine.getModelPath()).toBe(
        '/path/to/library/Application Support/tts/supertonic',
      );
    });

    it('returns Documents path on Android', () => {
      setPlatform('android');
      const engine = new SupertonicEngine();
      expect(engine.getModelPath()).toBe('/path/to/documents/tts/supertonic');
    });
  });

  describe('getVoices()', () => {
    it('returns the 10-voice catalog', async () => {
      const voices = await new SupertonicEngine().getVoices();
      expect(voices).toHaveLength(10);
      expect(voices.every(v => v.engine === 'supertonic')).toBe(true);
    });
  });

  describe('isInstalled()', () => {
    it('returns true when all 5 model files and manifest exist', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      await expect(new SupertonicEngine().isInstalled()).resolves.toBe(true);
    });

    it('returns false when any model file is missing', async () => {
      (RNFS.exists as jest.Mock).mockImplementation((path: string) =>
        Promise.resolve(!path.endsWith('vocoder.onnx')),
      );
      await expect(new SupertonicEngine().isInstalled()).resolves.toBe(false);
    });

    it('returns false when manifest is missing', async () => {
      (RNFS.exists as jest.Mock).mockImplementation((path: string) =>
        Promise.resolve(!path.endsWith(SUPERTONIC_VOICES_MANIFEST_FILENAME)),
      );
      await expect(new SupertonicEngine().isInstalled()).resolves.toBe(false);
    });
  });

  describe('downloadModel()', () => {
    const okDownload = () => ({
      promise: Promise.resolve({statusCode: 200, bytesWritten: 100}),
      jobId: 1,
    });

    it('downloads core files + voice styles and writes manifest on iOS', async () => {
      (RNFS.downloadFile as jest.Mock).mockImplementation(okDownload);

      await new SupertonicEngine().downloadModel();

      // 5 core ONNX files + 10 voice style JSON files
      expect(RNFS.downloadFile).toHaveBeenCalledTimes(
        SUPERTONIC_MODEL_FILES.length + SUPERTONIC_VOICES.length,
      );
      for (const file of SUPERTONIC_MODEL_FILES) {
        expect(RNFS.downloadFile).toHaveBeenCalledWith(
          expect.objectContaining({
            fromUrl: `${SUPERTONIC_MODEL_BASE_URL}/${file.urlPath}`,
            toFile: expect.stringContaining(`/tts/supertonic/${file.name}`),
          }),
        );
      }
      expect(RNFS.writeFile).toHaveBeenCalledWith(
        expect.stringContaining(
          `/tts/supertonic/${SUPERTONIC_VOICES_MANIFEST_FILENAME}`,
        ),
        expect.any(String),
      );
    });

    it('sets NSURLIsExcludedFromBackupKey=true on parent tts/ directory (iOS)', async () => {
      (RNFS.downloadFile as jest.Mock).mockImplementation(okDownload);

      await new SupertonicEngine().downloadModel();

      // Two mkdirs: parent tts/ and child supertonic/. Both pass the flag;
      // the flag is a no-op on Android but iOS applies it.
      expect(RNFS.mkdir).toHaveBeenCalledWith(
        '/path/to/library/Application Support/tts',
        {NSURLIsExcludedFromBackupKey: true},
      );
      expect(RNFS.mkdir).toHaveBeenCalledWith(
        '/path/to/library/Application Support/tts/supertonic',
        {NSURLIsExcludedFromBackupKey: true},
      );
    });

    it('reports 0..1 progress across all files', async () => {
      let progressCb: any;
      (RNFS.downloadFile as jest.Mock).mockImplementation((opts: any) => {
        progressCb = opts.progress;
        // Simulate a single mid-download progress tick before resolving.
        progressCb?.({bytesWritten: 50, contentLength: 100});
        return {
          promise: Promise.resolve({statusCode: 200, bytesWritten: 100}),
          jobId: 1,
        };
      });

      const progresses: number[] = [];
      await new SupertonicEngine().downloadModel(p => progresses.push(p));

      expect(progresses.length).toBeGreaterThan(0);
      expect(progresses[progresses.length - 1]).toBe(1);
      expect(Math.min(...progresses)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...progresses)).toBeLessThanOrEqual(1);
    });

    it('cleans up partial download and rethrows on failure', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      (RNFS.downloadFile as jest.Mock)
        .mockImplementationOnce(okDownload)
        .mockImplementationOnce(() => ({
          promise: Promise.resolve({statusCode: 500, bytesWritten: 0}),
          jobId: 2,
        }));

      await expect(new SupertonicEngine().downloadModel()).rejects.toThrow(
        /HTTP 500/,
      );

      // Model directory was unlinked during cleanup.
      expect(RNFS.unlink).toHaveBeenCalledWith(
        expect.stringContaining('/tts/supertonic'),
      );
    });
  });

  describe('deleteModel()', () => {
    it('unlinks the model directory when it exists', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      await new SupertonicEngine().deleteModel();
      expect(RNFS.unlink).toHaveBeenCalledWith(
        expect.stringContaining('/tts/supertonic'),
      );
    });

    it('is a safe no-op when the directory does not exist', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(false);
      await expect(
        new SupertonicEngine().deleteModel(),
      ).resolves.toBeUndefined();
      expect(RNFS.unlink).not.toHaveBeenCalled();
    });
  });

  describe('play()', () => {
    it('throws when the model is not installed', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(false);
      await expect(
        new SupertonicEngine().play('hello', anyVoice),
      ).rejects.toThrow(/not installed/i);
    });

    it('initializes lazily and delegates to Speech.speak when installed', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);

      const engine = new SupertonicEngine();
      await engine.play('hello', anyVoice);

      expect(Speech.initialize).toHaveBeenCalledTimes(1);
      expect(Speech.initialize).toHaveBeenCalledWith(
        expect.objectContaining({
          engine: TTSEngine.SUPERTONIC,
          durationPredictorPath: expect.stringMatching(
            /^file:\/\/.*duration_predictor\.onnx$/,
          ),
          vocoderPath: expect.stringMatching(/^file:\/\/.*vocoder\.onnx$/),
          voicesPath: expect.stringMatching(/voices-manifest\.json$/),
        }),
      );
      expect(Speech.speak).toHaveBeenCalledWith('hello', anyVoice.id, {
        language: 'en',
      });

      // Second play() reuses the initialized engine.
      await engine.play('again', anyVoice);
      expect(Speech.initialize).toHaveBeenCalledTimes(1);
    });

    it('forwards the language argument to Speech.speak when provided', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);

      const engine = new SupertonicEngine();
      await engine.play('hello', anyVoice, {language: 'en'});

      expect(Speech.speak).toHaveBeenCalledWith('hello', anyVoice.id, {
        language: 'en',
      });
    });
  });

  describe('playStreaming()', () => {
    const flush = async () => {
      for (let i = 0; i < 5; i++) {
        await new Promise(r => setImmediate(r));
      }
    };

    it('creates a lib stream with targetChars=300 and default language', () => {
      new SupertonicEngine().playStreaming(anyVoice);

      expect(Speech.createSpeechStream).toHaveBeenCalledTimes(1);
      expect(Speech.createSpeechStream).toHaveBeenCalledWith(
        anyVoice.id,
        expect.objectContaining({targetChars: 300, language: 'en'}),
      );
    });

    it('forwards language and inferenceSteps options', () => {
      new SupertonicEngine().playStreaming(anyVoice, {
        language: 'en',
        inferenceSteps: 5,
      });

      expect(Speech.createSpeechStream).toHaveBeenCalledWith(
        anyVoice.id,
        expect.objectContaining({
          targetChars: 300,
          language: 'en',
          inferenceSteps: 5,
        }),
      );
    });

    it('forwards appendText to the lib stream once the engine is acquired', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      const handle = new SupertonicEngine().playStreaming(anyVoice);

      handle.appendText('Hello world. ');
      handle.appendText('How are you?');
      await flush();

      const [stream] = __getCreatedStreams();
      expect(stream!.append).toHaveBeenCalledTimes(2);
      expect(stream!.append).toHaveBeenNthCalledWith(1, 'Hello world. ');
      expect(stream!.append).toHaveBeenNthCalledWith(2, 'How are you?');
    });

    it('cancel() is safe before any append', async () => {
      const handle = new SupertonicEngine().playStreaming(anyVoice);
      await expect(handle.cancel()).resolves.toBeUndefined();
    });

    it('finalize() after cancel() is a no-op', async () => {
      const handle = new SupertonicEngine().playStreaming(anyVoice);
      await handle.cancel();
      await expect(handle.finalize()).resolves.toBeUndefined();
    });
  });
});
