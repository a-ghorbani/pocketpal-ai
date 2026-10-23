import {Platform} from 'react-native';
import * as RNFS from '@dr.pogodin/react-native-fs';
import Speech from '@pocketpalai/react-native-speech';

import {PhononEngine} from '..';
import {ttsRuntime} from '../../../runtime';
import {
  PHONON_ANDROID_FILES,
  PHONON_ANDROID_REVISION,
  PHONON_IOS_MANIFEST_SHA256,
  PHONON_IOS_REVISION,
  PHONON_MODEL_VERSION,
  PHONON_VOICE_FILE_SIZE,
  PHONON_VOICE_PINS,
  PHONON_VOICES_REVISION,
} from '../../../constants';
import {PHONON_VOICES} from '../voices';

jest.mock('../../../constants', () => ({
  ...jest.requireActual('../../../constants'),
  PHONON_IOS_MANIFEST_SHA256: 'd'.repeat(64),
  PHONON_IOS_MODEL_BYTES: 300,
}));

const setPlatform = (os: 'ios' | 'android') => {
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    get: () => os,
  });
};

const currentSentinel = () =>
  Platform.OS === 'ios'
    ? {
        version: PHONON_MODEL_VERSION,
        iosRevision: PHONON_IOS_REVISION,
        iosManifestSha256: PHONON_IOS_MANIFEST_SHA256,
      }
    : {
        version: PHONON_MODEL_VERSION,
        androidRevision: PHONON_ANDROID_REVISION,
        voicesRevision: PHONON_VOICES_REVISION,
        voicePins: JSON.stringify(PHONON_VOICE_PINS),
      };

const ANDROID_DIR = '/path/to/documents/tts/phonon';
const IOS_DIR = '/path/to/library/Application Support/tts/phonon';
const IOS_BUNDLE_DIR = `${IOS_DIR}/phonon-31m-en-coreml`;
const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const IOS_MANIFEST = [
  `bundle.json\t100\t${SHA_A}`,
  `voices/Captain Silas Blackwater.safetensors\t200\t${SHA_B}`,
].join('\n');

/** Pinned size and sha256 per destination, as a correct download yields. */
const androidPins = (): Map<string, {size: number; sha256: string}> =>
  new Map([
    ...PHONON_ANDROID_FILES.map(
      f =>
        [`${ANDROID_DIR}/${f.name}`, {size: f.size, sha256: f.sha256}] as const,
    ),
    ...PHONON_VOICE_PINS.map(
      v =>
        [
          `${ANDROID_DIR}/voices/${v.name}.safetensors`,
          {size: PHONON_VOICE_FILE_SIZE, sha256: v.sha256},
        ] as const,
    ),
  ]);

const iosPins = (): Map<string, {size: number; sha256: string}> =>
  new Map([
    [`${IOS_DIR}/manifest.tsv`, {size: 0, sha256: PHONON_IOS_MANIFEST_SHA256}],
    [`${IOS_BUNDLE_DIR}/bundle.json`, {size: 100, sha256: SHA_A}],
    [
      `${IOS_BUNDLE_DIR}/voices/Captain Silas Blackwater.safetensors`,
      {size: 200, sha256: SHA_B},
    ],
  ]);

const serveFiles = (pins: Map<string, {size: number; sha256: string}>) => {
  (RNFS.downloadFile as jest.Mock).mockImplementation(() => ({
    jobId: 1,
    promise: Promise.resolve({statusCode: 200, bytesWritten: 1}),
  }));
  (RNFS.stat as jest.Mock).mockImplementation((path: string) =>
    Promise.resolve({size: pins.get(path)?.size ?? -1}),
  );
  (RNFS.hash as jest.Mock).mockImplementation((path: string) =>
    Promise.resolve(pins.get(path)?.sha256 ?? ''),
  );
  (RNFS.readFile as jest.Mock).mockImplementation((path: string) =>
    Promise.resolve(path.endsWith('manifest.tsv') ? IOS_MANIFEST : ''),
  );
};

const downloadedUrls = (): string[] =>
  (RNFS.downloadFile as jest.Mock).mock.calls.map(([opts]) => opts.fromUrl);

describe('PhononEngine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setPlatform('android');
    (RNFS.exists as jest.Mock).mockResolvedValue(true);
    (RNFS.mkdir as jest.Mock).mockResolvedValue(undefined);
    (RNFS.writeFile as jest.Mock).mockResolvedValue(undefined);
    (RNFS.unlink as jest.Mock).mockResolvedValue(undefined);
  });

  it('registers the add-on engine once, when the module loads', () => {
    jest.isolateModules(() => {
      const isolatedSpeech =
        require('@pocketpalai/react-native-speech').default;
      const addon = require('@pocketpalai/react-native-speech-phonon');
      require('..');
      expect(isolatedSpeech.registerEngine).toHaveBeenCalledTimes(1);
      expect(isolatedSpeech.registerEngine.mock.calls[0][0]).toBeInstanceOf(
        addon.PhononEngine,
      );
    });
  });

  describe('paths', () => {
    it('loads the model folder itself on Android', () => {
      const engine = new PhononEngine();
      expect(engine.getModelPath()).toBe(ANDROID_DIR);
      expect(engine.getLoadPath()).toBe(ANDROID_DIR);
    });

    it('loads the inner Core ML bundle folder on iOS', () => {
      setPlatform('ios');
      const engine = new PhononEngine();
      expect(engine.getModelPath()).toBe(IOS_DIR);
      expect(engine.getLoadPath()).toBe(IOS_BUNDLE_DIR);
    });
  });

  describe('downloadModel() on Android', () => {
    it('fetches the pinned checkpoint and curated voices, then writes the sentinel last', async () => {
      serveFiles(androidPins());

      await new PhononEngine().downloadModel();

      const urls = downloadedUrls();
      expect(urls).toHaveLength(
        PHONON_ANDROID_FILES.length + PHONON_VOICE_PINS.length,
      );
      expect(urls).toContain(
        'https://huggingface.co/gradium/phonon-31m-en/resolve/52433c46975bfa13144c56204c9f4ee1c5b148aa/model.q8.gguf',
      );
      const zoey = PHONON_VOICE_PINS.find(v => v.name === 'Zoey')!;
      expect(RNFS.downloadFile).toHaveBeenCalledWith(
        expect.objectContaining({
          fromUrl: `https://huggingface.co/gradium/phonon-voices/resolve/da6c9ec0d47be8df5c87c730a3aa97187f3229c3/voices/${zoey.voiceId}.safetensors`,
          toFile: `${ANDROID_DIR}/voices/Zoey.safetensors`,
        }),
      );

      const writes = (RNFS.writeFile as jest.Mock).mock.calls;
      expect(writes[0][0]).toBe(`${ANDROID_DIR}/voices.jsonl`);
      const lines = String(writes[0][1]).trim().split('\n');
      expect(lines).toHaveLength(PHONON_VOICE_PINS.length);
      expect(JSON.parse(lines[0]!)).toMatchObject({
        name: 'Zoey',
        filename: 'voices/Zoey.safetensors',
        voice_id: zoey.voiceId,
      });
      expect(writes[writes.length - 1]).toEqual([
        `${ANDROID_DIR}/model-version.json`,
        JSON.stringify(currentSentinel()),
      ]);
      expect(RNFS.unlink).not.toHaveBeenCalled();
    });

    it('creates its folders excluded from backup', async () => {
      serveFiles(androidPins());

      await new PhononEngine().downloadModel();

      expect(RNFS.mkdir).toHaveBeenCalledWith('/path/to/documents/tts', {
        NSURLIsExcludedFromBackupKey: true,
      });
      expect(RNFS.mkdir).toHaveBeenCalledWith(ANDROID_DIR, {
        NSURLIsExcludedFromBackupKey: true,
      });
      expect(RNFS.mkdir).toHaveBeenCalledWith(`${ANDROID_DIR}/voices`, {
        NSURLIsExcludedFromBackupKey: true,
      });
    });

    it('reports progress ending at 1', async () => {
      serveFiles(androidPins());
      const progress: number[] = [];

      await new PhononEngine().downloadModel(p => progress.push(p));

      expect(progress[progress.length - 1]).toBe(1);
      expect(Math.max(...progress)).toBeLessThanOrEqual(1);
    });

    it('deletes the folder and rethrows on an HTTP failure', async () => {
      serveFiles(androidPins());
      (RNFS.downloadFile as jest.Mock).mockImplementationOnce(() => ({
        jobId: 1,
        promise: Promise.resolve({statusCode: 404, bytesWritten: 0}),
      }));

      await expect(new PhononEngine().downloadModel()).rejects.toThrow(
        /HTTP 404/,
      );
      expect(RNFS.unlink).toHaveBeenCalledWith(ANDROID_DIR);
      expect(RNFS.writeFile).not.toHaveBeenCalled();
    });

    it('deletes the folder and rethrows on a size mismatch', async () => {
      serveFiles(androidPins());
      (RNFS.stat as jest.Mock).mockResolvedValueOnce({size: 1});

      await expect(new PhononEngine().downloadModel()).rejects.toThrow(
        /expected 2851 bytes, got 1/,
      );
      expect(RNFS.unlink).toHaveBeenCalledWith(ANDROID_DIR);
      expect(RNFS.writeFile).not.toHaveBeenCalled();
    });

    it('deletes the folder and rethrows on a sha256 mismatch', async () => {
      serveFiles(androidPins());
      (RNFS.hash as jest.Mock).mockResolvedValueOnce(SHA_A);

      await expect(new PhononEngine().downloadModel()).rejects.toThrow(
        /sha256 mismatch/,
      );
      expect(RNFS.unlink).toHaveBeenCalledWith(ANDROID_DIR);
      expect(RNFS.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('downloadModel() on iOS', () => {
    beforeEach(() => setPlatform('ios'));

    it('fetches every file the verified manifest lists into the bundle folder', async () => {
      serveFiles(iosPins());

      await new PhononEngine().downloadModel();

      const urls = downloadedUrls();
      expect(urls[0]).toMatch(
        /^https:\/\/huggingface\.co\/palshub\/phonon-31m-en-coreml\/resolve\/[^/]+\/phonon-31m-en-coreml\.manifest\.tsv$/,
      );
      expect(RNFS.downloadFile).toHaveBeenCalledWith(
        expect.objectContaining({toFile: `${IOS_DIR}/manifest.tsv`}),
      );
      expect(urls[2]).toMatch(
        /\/phonon-31m-en-coreml\/voices\/Captain%20Silas%20Blackwater\.safetensors$/,
      );
      expect(RNFS.downloadFile).toHaveBeenCalledWith(
        expect.objectContaining({
          toFile: `${IOS_BUNDLE_DIR}/voices/Captain Silas Blackwater.safetensors`,
        }),
      );
      expect(RNFS.writeFile).toHaveBeenCalledTimes(1);
      expect(RNFS.writeFile).toHaveBeenCalledWith(
        `${IOS_DIR}/model-version.json`,
        JSON.stringify(currentSentinel()),
      );
    });

    it('creates its folders excluded from backup', async () => {
      serveFiles(iosPins());

      await new PhononEngine().downloadModel();

      expect(RNFS.mkdir).toHaveBeenCalledWith(
        '/path/to/library/Application Support/tts',
        {NSURLIsExcludedFromBackupKey: true},
      );
      expect(RNFS.mkdir).toHaveBeenCalledWith(IOS_BUNDLE_DIR, {
        NSURLIsExcludedFromBackupKey: true,
      });
    });

    it('stops before the bundle when the manifest sha256 does not match the pin', async () => {
      serveFiles(iosPins());
      (RNFS.hash as jest.Mock).mockResolvedValueOnce(SHA_A);

      await expect(new PhononEngine().downloadModel()).rejects.toThrow(
        /manifest sha256 mismatch/,
      );
      expect(RNFS.downloadFile).toHaveBeenCalledTimes(1);
      expect(RNFS.unlink).toHaveBeenCalledWith(IOS_DIR);
    });

    it('stops before the bundle when the manifest sizes do not add up to the pinned total', async () => {
      serveFiles(iosPins());
      (RNFS.readFile as jest.Mock).mockResolvedValue(
        `bundle.json\t101\t${SHA_A}`,
      );

      await expect(new PhononEngine().downloadModel()).rejects.toThrow(
        /manifest lists 101 bytes, expected 300/,
      );
      expect(RNFS.downloadFile).toHaveBeenCalledTimes(1);
      expect(RNFS.unlink).toHaveBeenCalledWith(IOS_DIR);
      expect(RNFS.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('isInstalled()', () => {
    const sentinel = (fields: Record<string, unknown> = {}) => {
      const json = JSON.stringify({...currentSentinel(), ...fields});
      (RNFS.readFile as jest.Mock).mockImplementation((path: string) =>
        Promise.resolve(path.endsWith('manifest.tsv') ? IOS_MANIFEST : json),
      );
    };

    it('is true with every pinned file and a current sentinel', async () => {
      sentinel();
      await expect(new PhononEngine().isInstalled()).resolves.toBe(true);
    });

    it('is false without the sentinel', async () => {
      sentinel();
      (RNFS.exists as jest.Mock).mockImplementation((path: string) =>
        Promise.resolve(!path.endsWith('model-version.json')),
      );
      await expect(new PhononEngine().isInstalled()).resolves.toBe(false);
    });

    it('is false with an older sentinel', async () => {
      sentinel({version: PHONON_MODEL_VERSION - 1});
      await expect(new PhononEngine().isInstalled()).resolves.toBe(false);
    });

    it('is false with a sentinel that records no pins', async () => {
      (RNFS.readFile as jest.Mock).mockResolvedValue(
        JSON.stringify({version: PHONON_MODEL_VERSION}),
      );
      await expect(new PhononEngine().isInstalled()).resolves.toBe(false);
    });

    it.each(['androidRevision', 'voicesRevision'])(
      'is false on Android when the sentinel %s is stale',
      async key => {
        sentinel({[key]: 'e'.repeat(40)});
        await expect(new PhononEngine().isInstalled()).resolves.toBe(false);
      },
    );

    it.each([
      ['sha256', 'e'.repeat(64)],
      ['voiceId', 'stale-voice-id'],
      ['description', 'An older description'],
    ])(
      'is false on Android when a voice pin %s is stale',
      async (key, value) => {
        sentinel({
          voicePins: JSON.stringify(
            PHONON_VOICE_PINS.map((v, i) =>
              i === 0 ? {...v, [key]: value} : v,
            ),
          ),
        });
        await expect(new PhononEngine().isInstalled()).resolves.toBe(false);
      },
    );

    it.each(['iosRevision', 'iosManifestSha256'])(
      'is false on iOS when the sentinel %s is stale',
      async key => {
        setPlatform('ios');
        sentinel({[key]: 'e'.repeat(40)});
        await expect(new PhononEngine().isInstalled()).resolves.toBe(false);
      },
    );

    it('is false on Android when a voice file is missing', async () => {
      sentinel();
      (RNFS.exists as jest.Mock).mockImplementation((path: string) =>
        Promise.resolve(!path.endsWith('/voices/Alfie.safetensors')),
      );
      await expect(new PhononEngine().isInstalled()).resolves.toBe(false);
    });

    it('is false on iOS when a manifest-listed file is missing', async () => {
      setPlatform('ios');
      sentinel();
      (RNFS.exists as jest.Mock).mockImplementation((path: string) =>
        Promise.resolve(!path.endsWith('Captain Silas Blackwater.safetensors')),
      );
      await expect(new PhononEngine().isInstalled()).resolves.toBe(false);
    });

    it('is false on iOS without a saved manifest, without a warning', async () => {
      setPlatform('ios');
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      (RNFS.exists as jest.Mock).mockResolvedValue(false);
      (RNFS.readFile as jest.Mock).mockRejectedValue(
        new Error('ENOENT: no such file or directory'),
      );

      await expect(new PhononEngine().isInstalled()).resolves.toBe(false);
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('is true on iOS when the saved manifest and every listed file exist', async () => {
      setPlatform('ios');
      sentinel();
      await expect(new PhononEngine().isInstalled()).resolves.toBe(true);
      expect(RNFS.exists).toHaveBeenCalledWith(
        `${IOS_BUNDLE_DIR}/voices/Captain Silas Blackwater.safetensors`,
      );
    });
  });

  describe('reclaimLegacySpace()', () => {
    it('deletes the folder when the sentinel is from another version', async () => {
      (RNFS.readFile as jest.Mock).mockResolvedValue(
        JSON.stringify({
          ...currentSentinel(),
          version: PHONON_MODEL_VERSION + 1,
        }),
      );
      await new PhononEngine().reclaimLegacySpace();
      expect(RNFS.unlink).toHaveBeenCalledWith(ANDROID_DIR);
    });

    it('deletes the folder when the sentinel records an older pin', async () => {
      (RNFS.readFile as jest.Mock).mockResolvedValue(
        JSON.stringify({...currentSentinel(), androidRevision: 'e'.repeat(40)}),
      );
      await new PhononEngine().reclaimLegacySpace();
      expect(RNFS.unlink).toHaveBeenCalledWith(ANDROID_DIR);
    });

    it('keeps a current install', async () => {
      (RNFS.readFile as jest.Mock).mockResolvedValue(
        JSON.stringify(currentSentinel()),
      );
      await new PhononEngine().reclaimLegacySpace();
      expect(RNFS.unlink).not.toHaveBeenCalled();
    });
  });

  describe('loadInto()', () => {
    it('passes the checkpoint folder and voices metadata as plain paths on Android', async () => {
      await new PhononEngine().loadInto();
      expect(Speech.initialize).toHaveBeenCalledWith(
        expect.objectContaining({
          engine: 'phonon',
          modelPath: ANDROID_DIR,
          language: 'en',
          voicesMetadataPath: `${ANDROID_DIR}/voices.jsonl`,
        }),
      );
    });

    it('passes the inner bundle folder and no voices metadata on iOS', async () => {
      setPlatform('ios');
      await new PhononEngine().loadInto();
      const config = (Speech.initialize as jest.Mock).mock.calls[0][0];
      expect(config).toMatchObject({
        engine: 'phonon',
        modelPath: IOS_BUNDLE_DIR,
        language: 'en',
      });
      expect(config).not.toHaveProperty('voicesMetadataPath');
    });
  });

  it('speaks through Speech with the voice id after loading', async () => {
    (RNFS.readFile as jest.Mock).mockResolvedValue(
      JSON.stringify(currentSentinel()),
    );
    const voice = PHONON_VOICES[0]!;
    await new PhononEngine().play('hello', voice);
    expect(Speech.speak).toHaveBeenCalledWith('hello', 'Zoey');
  });

  it('refuses to play without an install and loads nothing', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValue(false);

    await expect(
      new PhononEngine().play('hello', PHONON_VOICES[0]!),
    ).rejects.toThrow('Phonon model is not installed');
    expect(Speech.initialize).not.toHaveBeenCalled();
    expect(Speech.speak).not.toHaveBeenCalled();
  });

  it('streams through the speech stream with the voice id', async () => {
    ttsRuntime._resetForTests();
    const handle = new PhononEngine().playStreaming(PHONON_VOICES[0]!);
    handle.appendText('Hello there.');
    await handle.finalize();

    expect(Speech.initialize).toHaveBeenCalledWith(
      expect.objectContaining({engine: 'phonon'}),
    );
    expect(Speech.createSpeechStream).toHaveBeenCalledWith(
      'Zoey',
      expect.anything(),
    );
  });

  it('passes voice stream options to the speech stream', async () => {
    ttsRuntime._resetForTests();
    const handle = new PhononEngine().playStreaming(
      PHONON_VOICES[0]!,
      undefined,
      {firstChunk: 'clause', onProgress: jest.fn()},
    );
    handle.appendText('Hello there.');
    await handle.finalize();

    expect(Speech.createSpeechStream).toHaveBeenCalledWith(
      'Zoey',
      expect.objectContaining({firstChunk: 'clause'}),
    );
  });

  it('stops through Speech', async () => {
    await new PhononEngine().stop();
    expect(Speech.stop).toHaveBeenCalledTimes(1);
  });

  describe('deleteModel()', () => {
    it('removes the whole Phonon folder', async () => {
      await new PhononEngine().deleteModel();
      expect(RNFS.unlink).toHaveBeenCalledWith(ANDROID_DIR);
    });

    it('removes the whole Phonon folder on iOS, manifest included', async () => {
      setPlatform('ios');
      await new PhononEngine().deleteModel();
      expect(RNFS.unlink).toHaveBeenCalledWith(IOS_DIR);
    });

    it('does nothing when the folder is already gone', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValue(false);
      await new PhononEngine().deleteModel();
      expect(RNFS.unlink).not.toHaveBeenCalled();
    });

    it('swallows an unlink failure', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      (RNFS.unlink as jest.Mock).mockRejectedValueOnce(new Error('EBUSY'));
      await expect(new PhononEngine().deleteModel()).resolves.toBeUndefined();
      warn.mockRestore();
    });
  });

  it('deletes the folder when the iOS manifest download fails', async () => {
    setPlatform('ios');
    serveFiles(iosPins());
    (RNFS.downloadFile as jest.Mock).mockImplementationOnce(() => ({
      jobId: 1,
      promise: Promise.resolve({statusCode: 503, bytesWritten: 0}),
    }));

    await expect(new PhononEngine().downloadModel()).rejects.toThrow(
      /manifest: HTTP 503/,
    );
    expect(RNFS.downloadFile).toHaveBeenCalledTimes(1);
    expect(RNFS.unlink).toHaveBeenCalledWith(IOS_DIR);
    expect(RNFS.writeFile).not.toHaveBeenCalled();
  });

  it('reports byte progress within a file, rising and capped by its pinned size', async () => {
    serveFiles(androidPins());
    const first = PHONON_ANDROID_FILES[0]!;
    (RNFS.downloadFile as jest.Mock).mockImplementationOnce(opts => {
      opts.progress({bytesWritten: Math.floor(first.size / 2)});
      opts.progress({bytesWritten: first.size * 10});
      return {
        jobId: 1,
        promise: Promise.resolve({statusCode: 200, bytesWritten: first.size}),
      };
    });
    const total =
      PHONON_ANDROID_FILES.reduce((s, f) => s + f.size, 0) +
      PHONON_VOICE_PINS.length * PHONON_VOICE_FILE_SIZE;
    const progress: number[] = [];

    await new PhononEngine().downloadModel(p => progress.push(p));

    expect(progress[0]).toBeCloseTo(Math.floor(first.size / 2) / total, 9);
    expect(progress[1]).toBeCloseTo(first.size / total, 9);
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1]!);
    }
  });
});
