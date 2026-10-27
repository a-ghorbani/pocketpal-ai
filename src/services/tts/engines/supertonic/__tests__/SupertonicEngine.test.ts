/**
 * Tests for the SupertonicEngine (v3, 31 languages + version sentinel).
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
  SUPERTONIC_MODEL_VERSION,
  SUPERTONIC_VERSION_SENTINEL_FILENAME,
  SUPERTONIC_VOICES_MANIFEST_FILENAME,
} from '../../../constants';
import {ttsRuntime} from '../../../runtime';
import {SUPERTONIC_VOICES} from '../voices';

import {
  __getCreatedStreams,
  __resetCreatedStreams,
} from '../../../../../../__mocks__/external/@pocketpalai/react-native-speech';

const CURRENT_MANIFEST = JSON.stringify(
  {voices: SUPERTONIC_VOICES.map(v => v.id)},
  null,
  2,
);
const LEGACY_MANIFEST = JSON.stringify({
  baseUrl: 'https://example.invalid/voice_styles',
  voices: SUPERTONIC_VOICES.map(v => v.id),
});

const setPlatform = (os: 'ios' | 'android') => {
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    get: () => os,
  });
};

describe('SupertonicEngine', () => {
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
    // When the sentinel is read, default to a valid current-version payload
    // so an "all files present" install reports as v3-installed. Individual
    // tests override this to exercise stale/missing/unparseable sentinels.
    (RNFS.readFile as jest.Mock).mockResolvedValue(
      JSON.stringify({version: SUPERTONIC_MODEL_VERSION}),
    );
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
    it('returns true when all 5 model files, manifest, and current-version sentinel exist', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      await expect(new SupertonicEngine().isInstalled()).resolves.toBe(true);
    });

    it('returns false for a stale v2 install (no version sentinel)', async () => {
      (RNFS.exists as jest.Mock).mockImplementation((path: string) =>
        Promise.resolve(!path.endsWith(SUPERTONIC_VERSION_SENTINEL_FILENAME)),
      );
      await expect(new SupertonicEngine().isInstalled()).resolves.toBe(false);
    });

    it('returns false when a download is interrupted before the sentinel write (all files present, no sentinel)', async () => {
      // Sentinel is the final disk write of downloadModel(): if the process
      // dies after the model files land but before it, every file check passes
      // yet the install must not count as complete.
      (RNFS.exists as jest.Mock).mockImplementation((path: string) =>
        Promise.resolve(!path.endsWith(SUPERTONIC_VERSION_SENTINEL_FILENAME)),
      );
      await expect(new SupertonicEngine().isInstalled()).resolves.toBe(false);
    });

    it('returns false when the sentinel records an older version', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      (RNFS.readFile as jest.Mock).mockResolvedValue(
        JSON.stringify({version: SUPERTONIC_MODEL_VERSION - 1}),
      );
      await expect(new SupertonicEngine().isInstalled()).resolves.toBe(false);
    });

    it('returns false when the sentinel is unparseable', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      (RNFS.readFile as jest.Mock).mockResolvedValue('not json');
      await expect(new SupertonicEngine().isInstalled()).resolves.toBe(false);
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

    it('downloads voice styles through .part', async () => {
      (RNFS.downloadFile as jest.Mock).mockImplementation(okDownload);

      await new SupertonicEngine().downloadModel();

      for (const voice of SUPERTONIC_VOICES) {
        expect(RNFS.downloadFile).toHaveBeenCalledWith(
          expect.objectContaining({
            toFile: expect.stringMatching(
              new RegExp(`/tts/supertonic/${voice.id}\\.json\\.part$`),
            ),
          }),
        );
      }
    });

    it('stays installed when a voice style returns non-200, leaving no file at its path', async () => {
      let call = 0;
      (RNFS.downloadFile as jest.Mock).mockImplementation(() => {
        call++;
        return {
          promise: Promise.resolve({
            statusCode: call <= SUPERTONIC_MODEL_FILES.length ? 200 : 404,
            bytesWritten: 0,
          }),
          jobId: call,
        };
      });

      await expect(
        new SupertonicEngine().downloadModel(),
      ).resolves.toBeUndefined();

      expect(RNFS.moveFile).not.toHaveBeenCalled();
      expect(RNFS.writeFile).toHaveBeenCalledWith(
        expect.stringContaining(`/${SUPERTONIC_VERSION_SENTINEL_FILENAME}`),
        expect.any(String),
      );
    });

    it('writes the voices manifest without a baseUrl', async () => {
      (RNFS.downloadFile as jest.Mock).mockImplementation(okDownload);

      await new SupertonicEngine().downloadModel();

      const manifestCall = (RNFS.writeFile as jest.Mock).mock.calls.find(
        ([p]: [string]) =>
          p.endsWith(`/${SUPERTONIC_VOICES_MANIFEST_FILENAME}`),
      );
      expect(JSON.parse(manifestCall![1])).toEqual({
        voices: SUPERTONIC_VOICES.map(v => v.id),
      });
    });

    it('writes the version sentinel as the final disk write', async () => {
      (RNFS.downloadFile as jest.Mock).mockImplementation(okDownload);

      await new SupertonicEngine().downloadModel();

      const writeCalls = (RNFS.writeFile as jest.Mock).mock.calls;
      const sentinelIdx = writeCalls.findIndex(([p]: [string]) =>
        p.endsWith(`/${SUPERTONIC_VERSION_SENTINEL_FILENAME}`),
      );
      const manifestIdx = writeCalls.findIndex(([p]: [string]) =>
        p.endsWith(`/${SUPERTONIC_VOICES_MANIFEST_FILENAME}`),
      );
      expect(sentinelIdx).toBeGreaterThan(-1);
      // Sentinel must be the LAST write, and must come after the manifest,
      // so an interrupted download never reports as installed.
      expect(sentinelIdx).toBe(writeCalls.length - 1);
      expect(sentinelIdx).toBeGreaterThan(manifestIdx);
      expect(writeCalls[sentinelIdx]![1]).toBe(
        JSON.stringify({version: SUPERTONIC_MODEL_VERSION}),
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

  describe('reclaimLegacySpace()', () => {
    it('deletes the whole model dir when the sentinel is stale (v2)', async () => {
      // Stale v2: model dir exists, but no current-version sentinel.
      (RNFS.exists as jest.Mock).mockImplementation((path: string) =>
        Promise.resolve(!path.endsWith(SUPERTONIC_VERSION_SENTINEL_FILENAME)),
      );
      await new SupertonicEngine().reclaimLegacySpace();
      expect(RNFS.unlink).toHaveBeenCalledWith(
        expect.stringContaining('/tts/supertonic'),
      );
    });

    it('is a no-op when the install is already at the current version', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(true);
      await new SupertonicEngine().reclaimLegacySpace();
      expect(RNFS.unlink).not.toHaveBeenCalled();
    });

    it('is a safe no-op when nothing is on disk', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(false);
      await expect(
        new SupertonicEngine().reclaimLegacySpace(),
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
          executionProviders: ['cpu'],
        }),
      );
      expect(Speech.speak).toHaveBeenCalledWith('hello', anyVoice.id, {
        language: 'na',
      });

      // Second play() reuses the initialized engine.
      await engine.play('again', anyVoice);
      expect(Speech.initialize).toHaveBeenCalledTimes(1);
    });

    it('rewrites the voices manifest without a baseUrl before Speech.initialize', async () => {
      (RNFS.readFile as jest.Mock).mockResolvedValue(LEGACY_MANIFEST);

      await new SupertonicEngine().loadInto();

      const writeCalls = (RNFS.writeFile as jest.Mock).mock.calls;
      expect(writeCalls).toHaveLength(1);
      expect(writeCalls[0]![0]).toMatch(
        new RegExp(`/tts/supertonic/${SUPERTONIC_VOICES_MANIFEST_FILENAME}$`),
      );
      expect(JSON.parse(writeCalls[0]![1])).not.toHaveProperty('baseUrl');
      expect(
        (RNFS.writeFile as jest.Mock).mock.invocationCallOrder[0],
      ).toBeLessThan(
        (Speech.initialize as jest.Mock).mock.invocationCallOrder[0]!,
      );
    });

    describe('legacy manifest repair in loadInto', () => {
      const modelDir = '/path/to/library/Application Support/tts/supertonic';
      const manifestPath = `${modelDir}/${SUPERTONIC_VOICES_MANIFEST_FILENAME}`;
      const stylePath = (id: string) => `${modelDir}/${id}.json`;
      const truncatedStyle = '{"style_dp":{';
      const usableStyle = '{"style_dp":{"data":[1]},"style_ttl":{"data":[1]}}';

      const mockDisk = (files: Record<string, string>) => {
        (RNFS.exists as jest.Mock).mockImplementation(
          async (path: string) => path in files,
        );
        (RNFS.readFile as jest.Mock).mockImplementation(
          async (path: string) => {
            if (!(path in files)) {
              throw new Error(`ENOENT: ${path}`);
            }
            return files[path];
          },
        );
      };

      const order = (mock: unknown, index = 0) =>
        (mock as jest.Mock).mock.invocationCallOrder[index]!;

      it('removes a truncated style, keeps a usable one, then writes the manifest once', async () => {
        mockDisk({
          [manifestPath]: LEGACY_MANIFEST,
          [stylePath('F1')]: truncatedStyle,
          [stylePath('M1')]: usableStyle,
        });

        await new SupertonicEngine().loadInto();

        expect(RNFS.unlink).toHaveBeenCalledTimes(1);
        expect(RNFS.unlink).toHaveBeenCalledWith(stylePath('F1'));
        expect(RNFS.writeFile).toHaveBeenCalledTimes(1);
        expect(RNFS.writeFile).toHaveBeenCalledWith(
          manifestPath,
          CURRENT_MANIFEST,
        );
        expect(order(RNFS.unlink)).toBeLessThan(order(RNFS.writeFile));
        expect(order(RNFS.writeFile)).toBeLessThan(order(Speech.initialize));
      });

      it('removes a style that holds an HTTP error body', async () => {
        mockDisk({
          [manifestPath]: LEGACY_MANIFEST,
          [stylePath('F2')]: '{"error":"Entry not found"}',
        });

        await new SupertonicEngine().loadInto();

        expect(RNFS.unlink).toHaveBeenCalledWith(stylePath('F2'));
        expect(order(RNFS.unlink)).toBeLessThan(order(Speech.initialize));
      });

      it('neither checks styles nor rewrites a manifest the app wrote', async () => {
        mockDisk({
          [manifestPath]: CURRENT_MANIFEST,
          [stylePath('F1')]: truncatedStyle,
        });

        await new SupertonicEngine().loadInto();

        expect(RNFS.writeFile).not.toHaveBeenCalled();
        expect(RNFS.readFile).toHaveBeenCalledTimes(1);
        expect(RNFS.readFile).toHaveBeenCalledWith(manifestPath);
        expect(RNFS.unlink).not.toHaveBeenCalled();
        expect(Speech.initialize).toHaveBeenCalledTimes(1);
      });

      it('repairs and rewrites a manifest whose voice list is stale', async () => {
        mockDisk({
          [manifestPath]: JSON.stringify(
            {voices: SUPERTONIC_VOICES.slice(1).map(v => v.id)},
            null,
            2,
          ),
          [stylePath('F1')]: truncatedStyle,
        });

        await new SupertonicEngine().loadInto();

        expect(RNFS.unlink).toHaveBeenCalledWith(stylePath('F1'));
        expect(RNFS.writeFile).toHaveBeenCalledTimes(1);
        expect(RNFS.writeFile).toHaveBeenCalledWith(
          manifestPath,
          CURRENT_MANIFEST,
        );
        expect(order(RNFS.unlink)).toBeLessThan(order(Speech.initialize));
        expect(order(RNFS.writeFile)).toBeLessThan(order(Speech.initialize));
      });

      it('rejects without writing the manifest or initializing when a removal fails', async () => {
        mockDisk({
          [manifestPath]: LEGACY_MANIFEST,
          [stylePath('F1')]: truncatedStyle,
        });
        (RNFS.unlink as jest.Mock).mockRejectedValueOnce(new Error('EACCES'));

        await expect(new SupertonicEngine().loadInto()).rejects.toThrow(
          'EACCES',
        );

        expect(RNFS.writeFile).not.toHaveBeenCalled();
        expect(Speech.initialize).not.toHaveBeenCalled();
      });

      it('removes a style missing style_ttl', async () => {
        mockDisk({
          [manifestPath]: LEGACY_MANIFEST,
          [stylePath('F1')]: '{"style_dp":{"data":[1]}}',
          [stylePath('M1')]: usableStyle,
        });

        await new SupertonicEngine().loadInto();

        expect(RNFS.unlink).toHaveBeenCalledTimes(1);
        expect(RNFS.unlink).toHaveBeenCalledWith(stylePath('F1'));
      });

      it('treats a missing manifest as legacy: repairs, writes it, then initializes', async () => {
        mockDisk({[stylePath('F1')]: truncatedStyle});

        await new SupertonicEngine().loadInto();

        expect(RNFS.unlink).toHaveBeenCalledWith(stylePath('F1'));
        expect(RNFS.writeFile).toHaveBeenCalledTimes(1);
        expect(RNFS.writeFile).toHaveBeenCalledWith(
          manifestPath,
          CURRENT_MANIFEST,
        );
        expect(order(RNFS.writeFile)).toBeLessThan(order(Speech.initialize));
      });

      it('rejects without writing the manifest or initializing when a style read fails', async () => {
        mockDisk({[manifestPath]: LEGACY_MANIFEST});
        (RNFS.exists as jest.Mock).mockImplementation(
          async (path: string) => path === stylePath('F1'),
        );

        await expect(new SupertonicEngine().loadInto()).rejects.toThrow(
          'ENOENT',
        );

        expect(RNFS.writeFile).not.toHaveBeenCalled();
        expect(Speech.initialize).not.toHaveBeenCalled();
      });

      it('rejects without initializing when the manifest write fails', async () => {
        mockDisk({[manifestPath]: LEGACY_MANIFEST});
        (RNFS.writeFile as jest.Mock).mockRejectedValueOnce(
          new Error('ENOSPC'),
        );

        await expect(new SupertonicEngine().loadInto()).rejects.toThrow(
          'ENOSPC',
        );

        expect(Speech.initialize).not.toHaveBeenCalled();
      });
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

    it('creates a lib stream with targetChars=300 and default language', async () => {
      new SupertonicEngine().playStreaming(anyVoice);
      await flush();

      expect(Speech.createSpeechStream).toHaveBeenCalledTimes(1);
      expect(Speech.createSpeechStream).toHaveBeenCalledWith(
        anyVoice.id,
        expect.objectContaining({targetChars: 300, language: 'na'}),
      );
    });

    it('forwards language and inferenceSteps options', async () => {
      new SupertonicEngine().playStreaming(anyVoice, undefined, {
        language: 'en',
        inferenceSteps: 5,
      });
      await flush();

      expect(Speech.createSpeechStream).toHaveBeenCalledWith(
        anyVoice.id,
        expect.objectContaining({
          targetChars: 300,
          language: 'en',
          inferenceSteps: 5,
        }),
      );
    });

    it('merges voice stream options with language and subscribes progress', async () => {
      const onProgress = jest.fn();
      new SupertonicEngine().playStreaming(anyVoice, undefined, {
        language: 'en',
        firstChunk: 'clause',
        onProgress,
      });
      await flush();

      const [voiceId, options] = (Speech.createSpeechStream as jest.Mock).mock
        .calls[0];
      expect(voiceId).toBe(anyVoice.id);
      expect(options).toEqual(
        expect.objectContaining({
          language: 'en',
          firstChunk: 'clause',
        }),
      );
      expect(options).not.toHaveProperty('onProgress');
      const [stream] = __getCreatedStreams();
      expect(stream!.onProgress).toHaveBeenCalledTimes(1);
      expect(stream!.onProgress).toHaveBeenCalledWith(onProgress);
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
