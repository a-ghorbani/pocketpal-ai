import {Platform} from 'react-native';

import * as RNFS from '@dr.pogodin/react-native-fs';
import Speech, {TTSEngine} from '@pocketpalai/react-native-speech';

import {
  KOKORO_MODEL_BASE_URL,
  KOKORO_MODEL_FILES,
  KOKORO_MODEL_SUBDIR,
  KOKORO_VOICES_BASE_URL,
  KOKORO_VOICES_MANIFEST_FILENAME,
  TTS_DICT_FILENAME,
  TTS_DICT_URL,
  TTS_PARENT_SUBDIR,
} from '../../constants';
import {ttsRuntime} from '../../runtime';
import {createEngineStreamingHandle} from '../../streamingHandle';
import type {Engine, StreamingHandle, Voice} from '../../types';
import {KOKORO_VOICES} from './voices';

export type KokoroProgressCallback = (progress: number) => void;

/**
 * Kokoro neural TTS engine (82M FP32 ONNX port).
 *
 * Installation is two-phase:
 *   1. Core files (`model_fp32.onnx`, `tokenizer.json`, IPA dict) — all-or-nothing;
 *      any failure cleans up the whole `tts/kokoro/` dir.
 *   2. Per-voice `.bin` embedding files — best-effort; partial success is
 *      accepted (engine usable with whichever voices did land). The voices
 *      manifest is (re)written at the end to point at the full voice
 *      catalog.
 *
 * CPU-only execution is forced (`executionProviders: ['cpu']`) across all
 * three neural engines for consistent battery/thermal behavior and easier
 * QA. The library default on iOS would otherwise include CoreML; we keep
 * it bare CPU for now.
 */
export class KokoroEngine implements Engine {
  readonly id = 'kokoro' as const;

  private getParentDir(): string {
    const root =
      Platform.OS === 'ios'
        ? `${RNFS.LibraryDirectoryPath}/Application Support`
        : RNFS.DocumentDirectoryPath;
    return `${root}/${TTS_PARENT_SUBDIR}`;
  }

  getModelPath(): string {
    const root =
      Platform.OS === 'ios'
        ? `${RNFS.LibraryDirectoryPath}/Application Support`
        : RNFS.DocumentDirectoryPath;
    return `${root}/${KOKORO_MODEL_SUBDIR}`;
  }

  private getFilePath(filename: string): string {
    return `${this.getModelPath()}/${filename}`;
  }

  async isInstalled(): Promise<boolean> {
    try {
      for (const file of KOKORO_MODEL_FILES) {
        if (!(await RNFS.exists(this.getFilePath(file.name)))) {
          return false;
        }
      }
      if (!(await RNFS.exists(this.getFilePath(TTS_DICT_FILENAME)))) {
        return false;
      }
      return RNFS.exists(this.getFilePath(KOKORO_VOICES_MANIFEST_FILENAME));
    } catch (err) {
      console.warn('[KokoroEngine] isInstalled check failed:', err);
      return false;
    }
  }

  async getVoices(): Promise<Voice[]> {
    return KOKORO_VOICES;
  }

  // Reclaim FP16 weights from previous installs (saved as `model.onnx`)
  // before the disk-space gate runs. isInstalled() reports false for legacy
  // users because the new local name is `model_fp32.onnx`, so the bundled
  // FP32 file does not double-count — but the orphan ~163 MB sits on disk
  // and can push a borderline device below the install threshold. Run this
  // BEFORE the store's disk preflight so reclaimable space counts.
  async reclaimLegacySpace(): Promise<void> {
    const legacyModelPath = this.getFilePath('model.onnx');
    if (await RNFS.exists(legacyModelPath)) {
      await RNFS.unlink(legacyModelPath).catch(() => {});
    }
  }

  async downloadModel(onProgress?: KokoroProgressCallback): Promise<void> {
    const parentDir = this.getParentDir();
    const modelDir = this.getModelPath();
    const voicesDir = `${modelDir}/voices`;

    await RNFS.mkdir(parentDir, {NSURLIsExcludedFromBackupKey: true});
    await RNFS.mkdir(modelDir, {NSURLIsExcludedFromBackupKey: true});
    await RNFS.mkdir(voicesDir, {NSURLIsExcludedFromBackupKey: true});

    // Defensive: ensure legacy FP16 file is gone even if the store skipped
    // `reclaimLegacySpace()`. Idempotent.
    await this.reclaimLegacySpace();

    // Phase 1: core files (model + tokenizer + dict) — all-or-nothing.
    const corePhaseWeight = 0.6;
    const coreFiles = [
      ...KOKORO_MODEL_FILES,
      {name: TTS_DICT_FILENAME, url: TTS_DICT_URL},
    ];
    const corePerFile = new Array(coreFiles.length).fill(0);
    const reportCore = () => {
      if (!onProgress) {
        return;
      }
      const sum = corePerFile.reduce((a, b) => a + b, 0);
      onProgress(Math.min(1, (sum / coreFiles.length) * corePhaseWeight));
    };

    try {
      for (let i = 0; i < coreFiles.length; i++) {
        const file = coreFiles[i]!;
        const target = this.getFilePath(file.name);
        const fromUrl =
          'url' in file ? file.url : `${KOKORO_MODEL_BASE_URL}/${file.urlPath}`;
        const result = await RNFS.downloadFile({
          fromUrl,
          toFile: target,
          background: false,
          discretionary: false,
          cacheable: false,
          progressInterval: 500,
          progress: res => {
            const contentLength = res.contentLength || 1;
            corePerFile[i] = Math.min(1, res.bytesWritten / contentLength);
            reportCore();
          },
        }).promise;

        if (result.statusCode !== 200) {
          throw new Error(
            `Failed to download ${file.name}: HTTP ${result.statusCode}`,
          );
        }
        corePerFile[i] = 1;
        reportCore();
      }
    } catch (err) {
      try {
        if (await RNFS.exists(modelDir)) {
          await RNFS.unlink(modelDir);
        }
      } catch (cleanupErr) {
        console.warn(
          '[KokoroEngine] partial-download cleanup failed:',
          cleanupErr,
        );
      }
      throw err;
    }

    // Phase 2: per-voice `.bin` embedding files — best-effort; partial OK.
    const voicePhaseBase = corePhaseWeight;
    const voicePhaseWeight = 1 - corePhaseWeight;
    let voicesDone = 0;
    for (const voice of KOKORO_VOICES) {
      const target = `${voicesDir}/${voice.id}.bin`;
      try {
        const result = await RNFS.downloadFile({
          fromUrl: `${KOKORO_VOICES_BASE_URL}/${voice.id}.bin`,
          toFile: target,
          background: false,
          discretionary: false,
          cacheable: false,
          progressInterval: 1000,
        }).promise;
        if (result.statusCode !== 200) {
          console.warn(
            `[KokoroEngine] voice ${voice.id} download failed: HTTP ${result.statusCode}`,
          );
        }
      } catch (voiceErr) {
        console.warn(
          `[KokoroEngine] voice ${voice.id} download failed:`,
          voiceErr,
        );
      }
      voicesDone++;
      if (onProgress) {
        onProgress(
          Math.min(
            1,
            voicePhaseBase +
              (voicesDone / KOKORO_VOICES.length) * voicePhaseWeight,
          ),
        );
      }
    }

    // Write voices manifest pointing at the voices/ directory.
    const manifest = {
      baseUrl: KOKORO_VOICES_BASE_URL,
      voices: KOKORO_VOICES.map(v => v.id),
    };
    await RNFS.writeFile(
      this.getFilePath(KOKORO_VOICES_MANIFEST_FILENAME),
      JSON.stringify(manifest, null, 2),
    );

    if (onProgress) {
      onProgress(1);
    }
  }

  async deleteModel(): Promise<void> {
    try {
      if (await RNFS.exists(this.getModelPath())) {
        await RNFS.unlink(this.getModelPath());
      }
    } catch (err) {
      console.warn('[KokoroEngine] deleteModel failed:', err);
    }
  }

  async loadInto(): Promise<void> {
    const modelDir = this.getModelPath();
    await Speech.initialize({
      engine: TTSEngine.KOKORO,
      modelPath: `file://${modelDir}/model_fp32.onnx`,
      tokenizerPath: `file://${modelDir}/tokenizer.json`,
      voicesPath: `file://${modelDir}/${KOKORO_VOICES_MANIFEST_FILENAME}`,
      dictPath: `file://${modelDir}/${TTS_DICT_FILENAME}`,
      executionProviders: ['cpu'],
      maxChunkSize: 200,
      silentMode: 'obey',
      ducking: true,
    });
  }

  async play(text: string, voice: Voice): Promise<void> {
    if (!(await this.isInstalled())) {
      throw new Error('Kokoro model is not installed');
    }
    await ttsRuntime.acquire(this, () => Speech.speak(text, voice.id));
  }

  playStreaming(voice: Voice, waitFor?: Promise<void>): StreamingHandle {
    return createEngineStreamingHandle(this, voice.id, undefined, waitFor);
  }

  async stop(): Promise<void> {
    await Speech.stop();
  }
}
