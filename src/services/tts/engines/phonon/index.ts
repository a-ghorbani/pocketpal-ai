import {Platform} from 'react-native';

import * as RNFS from '@dr.pogodin/react-native-fs';
import Speech from '@pocketpalai/react-native-speech';
import {
  PHONON,
  PhononEngine as PhononAddonEngine,
} from '@pocketpalai/react-native-speech-phonon';

import {
  PHONON_ANDROID_FILES,
  PHONON_ANDROID_REPO,
  PHONON_ANDROID_REVISION,
  PHONON_HF_BASE_URL,
  PHONON_IOS_BUNDLE_NAME,
  PHONON_IOS_MANIFEST_FILENAME,
  PHONON_IOS_MANIFEST_PATH,
  PHONON_IOS_MANIFEST_SHA256,
  PHONON_IOS_MODEL_BYTES,
  PHONON_IOS_REPO,
  PHONON_IOS_REVISION,
  PHONON_MODEL_SUBDIR,
  PHONON_MODEL_VERSION,
  PHONON_VERSION_SENTINEL_FILENAME,
  PHONON_VOICE_FILE_SIZE,
  PHONON_VOICE_PINS,
  PHONON_VOICES_JSONL_FILENAME,
  PHONON_VOICES_REPO,
  PHONON_VOICES_REVISION,
  TTS_PARENT_SUBDIR,
} from '../../constants';
import type {PhononPinnedFile} from '../../constants';
import {ttsRuntime} from '../../runtime';
import {createEngineStreamingHandle} from '../../streamingHandle';
import type {
  NeuralEngine,
  StreamOptions,
  StreamingHandle,
  Voice,
} from '../../types';
import {parseManifest} from './manifest';
import {PHONON_VOICES} from './voices';

Speech.registerEngine(new PhononAddonEngine());

/** The add-on's device probe: never throws, never loads a model. */
export const getPhononSupport = () => Speech.getEngineSupport(PHONON);

export type PhononProgressCallback = (progress: number) => void;

interface DownloadItem {
  url: string;
  dest: string;
  size: number;
  sha256: string;
}

const encodePath = (path: string): string =>
  path.split('/').map(encodeURIComponent).join('/');

const hfUrl = (repo: string, revision: string, path: string): string =>
  `${PHONON_HF_BASE_URL}/${repo}/resolve/${revision}/${encodePath(path)}`;

const dirname = (path: string): string => path.slice(0, path.lastIndexOf('/'));

const curatedVoicesJsonl = (): string =>
  PHONON_VOICE_PINS.map(v =>
    JSON.stringify({
      filename: `voices/${v.name}.safetensors`,
      name: v.name,
      voice_id: v.voiceId,
      language: 'en',
      locale: v.locale,
      gender: v.gender,
      description: v.description,
    }),
  ).join('\n') + '\n';

const currentSentinel = (): Record<string, string | number> =>
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

/**
 * Phonon neural TTS (Gradium Phonon 31m, English), run by the
 * `@pocketpalai/react-native-speech-phonon` add-on: CPU on Android, Core ML
 * on iOS. The add-on downloads nothing, so the pinned file lists here are the
 * only catalog. Every file is checked against its pinned size and sha256; any
 * failure deletes `tts/phonon/` so a retry starts clean.
 */
export class PhononEngine implements NeuralEngine {
  readonly id = 'phonon' as const;

  private getRoot(): string {
    return Platform.OS === 'ios'
      ? `${RNFS.LibraryDirectoryPath}/Application Support`
      : RNFS.DocumentDirectoryPath;
  }

  getModelPath(): string {
    return `${this.getRoot()}/${PHONON_MODEL_SUBDIR}`;
  }

  /** The folder the add-on loads: the inner Core ML bundle folder on iOS. */
  getLoadPath(): string {
    return Platform.OS === 'ios'
      ? `${this.getModelPath()}/${PHONON_IOS_BUNDLE_NAME}`
      : this.getModelPath();
  }

  private getFilePath(name: string): string {
    return `${this.getModelPath()}/${name}`;
  }

  private androidPinnedFiles(): DownloadItem[] {
    return [
      ...PHONON_ANDROID_FILES.map(f => ({
        url: hfUrl(PHONON_ANDROID_REPO, PHONON_ANDROID_REVISION, f.name),
        dest: this.getFilePath(f.name),
        size: f.size,
        sha256: f.sha256,
      })),
      ...PHONON_VOICE_PINS.map(v => ({
        url: hfUrl(
          PHONON_VOICES_REPO,
          PHONON_VOICES_REVISION,
          `voices/${v.voiceId}.safetensors`,
        ),
        dest: this.getFilePath(`voices/${v.name}.safetensors`),
        size: PHONON_VOICE_FILE_SIZE,
        sha256: v.sha256,
      })),
    ];
  }

  private iosBundleFiles(manifest: PhononPinnedFile[]): DownloadItem[] {
    return manifest.map(f => ({
      url: hfUrl(
        PHONON_IOS_REPO,
        PHONON_IOS_REVISION,
        `${PHONON_IOS_BUNDLE_NAME}/${f.name}`,
      ),
      dest: `${this.getLoadPath()}/${f.name}`,
      size: f.size,
      sha256: f.sha256,
    }));
  }

  private async readSavedManifest(): Promise<PhononPinnedFile[]> {
    return parseManifest(
      await RNFS.readFile(this.getFilePath(PHONON_IOS_MANIFEST_FILENAME)),
    );
  }

  async isInstalled(): Promise<boolean> {
    try {
      if (
        Platform.OS === 'ios' &&
        !(await RNFS.exists(this.getFilePath(PHONON_IOS_MANIFEST_FILENAME)))
      ) {
        return false;
      }
      const required =
        Platform.OS === 'ios'
          ? this.iosBundleFiles(await this.readSavedManifest()).map(f => f.dest)
          : [
              ...this.androidPinnedFiles().map(f => f.dest),
              this.getFilePath(PHONON_VOICES_JSONL_FILENAME),
            ];
      for (const path of required) {
        if (!(await RNFS.exists(path))) {
          return false;
        }
      }
      return this.isSentinelCurrent();
    } catch (err) {
      console.warn('[PhononEngine] isInstalled check failed:', err);
      return false;
    }
  }

  private async isSentinelCurrent(): Promise<boolean> {
    try {
      const sentinelPath = this.getFilePath(PHONON_VERSION_SENTINEL_FILENAME);
      if (!(await RNFS.exists(sentinelPath))) {
        return false;
      }
      const parsed = JSON.parse(await RNFS.readFile(sentinelPath)) as Record<
        string,
        unknown
      >;
      return Object.entries(currentSentinel()).every(
        ([key, value]) => parsed[key] === value,
      );
    } catch (err) {
      console.warn('[PhononEngine] sentinel check failed:', err);
      return false;
    }
  }

  async reclaimLegacySpace(): Promise<void> {
    if (await this.isSentinelCurrent()) {
      return;
    }
    const modelDir = this.getModelPath();
    if (await RNFS.exists(modelDir)) {
      await RNFS.unlink(modelDir).catch(() => {});
    }
  }

  async getVoices(): Promise<Voice[]> {
    return PHONON_VOICES;
  }

  async downloadModel(onProgress?: PhononProgressCallback): Promise<void> {
    const modelDir = this.getModelPath();
    await RNFS.mkdir(`${this.getRoot()}/${TTS_PARENT_SUBDIR}`, {
      NSURLIsExcludedFromBackupKey: true,
    });
    await RNFS.mkdir(modelDir, {NSURLIsExcludedFromBackupKey: true});

    try {
      const files =
        Platform.OS === 'ios'
          ? this.iosBundleFiles(await this.downloadIosManifest())
          : this.androidPinnedFiles();

      const totalBytes = files.reduce((sum, f) => sum + f.size, 0) || 1;
      let doneBytes = 0;
      const report = (inFlight: number) =>
        onProgress?.(Math.min(1, (doneBytes + inFlight) / totalBytes));

      for (const dir of new Set(files.map(f => dirname(f.dest)))) {
        await RNFS.mkdir(dir, {NSURLIsExcludedFromBackupKey: true});
      }
      for (const file of files) {
        await this.downloadVerified(file, bytes =>
          report(Math.min(bytes, file.size)),
        );
        doneBytes += file.size;
        report(0);
      }

      if (Platform.OS === 'android') {
        await RNFS.writeFile(
          this.getFilePath(PHONON_VOICES_JSONL_FILENAME),
          curatedVoicesJsonl(),
          'utf8',
        );
      }
      await RNFS.writeFile(
        this.getFilePath(PHONON_VERSION_SENTINEL_FILENAME),
        JSON.stringify(currentSentinel()),
      );
      onProgress?.(1);
    } catch (err) {
      try {
        if (await RNFS.exists(modelDir)) {
          await RNFS.unlink(modelDir);
        }
      } catch (cleanupErr) {
        console.warn(
          '[PhononEngine] partial-download cleanup failed:',
          cleanupErr,
        );
      }
      throw err;
    }
  }

  private async downloadIosManifest(): Promise<PhononPinnedFile[]> {
    const dest = this.getFilePath(PHONON_IOS_MANIFEST_FILENAME);
    const result = await RNFS.downloadFile({
      fromUrl: hfUrl(
        PHONON_IOS_REPO,
        PHONON_IOS_REVISION,
        PHONON_IOS_MANIFEST_PATH,
      ),
      toFile: dest,
      background: false,
      discretionary: false,
      cacheable: false,
    }).promise;
    if (result.statusCode !== 200) {
      throw new Error(
        `Failed to download the Phonon manifest: HTTP ${result.statusCode}`,
      );
    }
    const sha256 = (await RNFS.hash(dest, 'sha256')).toLowerCase();
    if (sha256 !== PHONON_IOS_MANIFEST_SHA256) {
      throw new Error(`Phonon manifest sha256 mismatch: ${sha256}`);
    }
    const manifest = await this.readSavedManifest();
    const totalBytes = manifest.reduce((sum, f) => sum + f.size, 0);
    if (totalBytes !== PHONON_IOS_MODEL_BYTES) {
      throw new Error(
        `Phonon manifest lists ${totalBytes} bytes, expected ${PHONON_IOS_MODEL_BYTES}`,
      );
    }
    return manifest;
  }

  private async downloadVerified(
    file: DownloadItem,
    onBytes: (bytesWritten: number) => void,
  ): Promise<void> {
    const result = await RNFS.downloadFile({
      fromUrl: file.url,
      toFile: file.dest,
      background: false,
      discretionary: false,
      cacheable: false,
      progressInterval: 500,
      progress: res => onBytes(res.bytesWritten),
    }).promise;
    if (result.statusCode !== 200) {
      throw new Error(
        `Failed to download ${file.dest}: HTTP ${result.statusCode}`,
      );
    }
    const size = Number((await RNFS.stat(file.dest)).size);
    if (size !== file.size) {
      throw new Error(`${file.dest}: expected ${file.size} bytes, got ${size}`);
    }
    const sha256 = (await RNFS.hash(file.dest, 'sha256')).toLowerCase();
    if (sha256 !== file.sha256) {
      throw new Error(`${file.dest}: sha256 mismatch`);
    }
  }

  async deleteModel(): Promise<void> {
    try {
      if (await RNFS.exists(this.getModelPath())) {
        await RNFS.unlink(this.getModelPath());
      }
    } catch (err) {
      console.warn('[PhononEngine] deleteModel failed:', err);
    }
  }

  async loadInto(): Promise<void> {
    await Speech.initialize({
      engine: PHONON,
      modelPath: this.getLoadPath(),
      language: 'en',
      ...(Platform.OS === 'android'
        ? {voicesMetadataPath: this.getFilePath(PHONON_VOICES_JSONL_FILENAME)}
        : {}),
      silentMode: 'obey',
      ducking: true,
    });
  }

  async play(text: string, voice: Voice): Promise<void> {
    if (!(await this.isInstalled())) {
      throw new Error('Phonon model is not installed');
    }
    await ttsRuntime.acquire(this, () => Speech.speak(text, voice.id));
  }

  playStreaming(
    voice: Voice,
    waitFor?: Promise<void>,
    streamOpts?: StreamOptions,
  ): StreamingHandle {
    return createEngineStreamingHandle(this, voice.id, streamOpts, waitFor);
  }

  async stop(): Promise<void> {
    await Speech.stop();
  }
}
