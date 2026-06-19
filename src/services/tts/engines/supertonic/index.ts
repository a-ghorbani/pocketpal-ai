import {Platform} from 'react-native';

import * as RNFS from '@dr.pogodin/react-native-fs';
import Speech, {
  TTSEngine,
  type SupertonicLanguage,
} from '@pocketpalai/react-native-speech';

import {
  SUPERTONIC_MODEL_BASE_URL,
  SUPERTONIC_MODEL_FILES,
  SUPERTONIC_MODEL_SUBDIR,
  SUPERTONIC_MODEL_VERSION,
  SUPERTONIC_VERSION_SENTINEL_FILENAME,
  SUPERTONIC_VOICES_BASE_URL,
  SUPERTONIC_VOICES_MANIFEST_FILENAME,
  TTS_PARENT_SUBDIR,
} from '../../constants';
import {ttsRuntime} from '../../runtime';
import {createEngineStreamingHandle} from '../../streamingHandle';
import type {
  Engine,
  StreamingHandle,
  SupertonicSteps,
  Voice,
} from '../../types';
import {SUPERTONIC_VOICES} from './voices';

export type SupertonicProgressCallback = (progress: number) => void;

/**
 * Engine-level fallback language, used only if a caller omits `language`.
 * The app always passes `ttsStore.supertonicLanguage` explicitly, so this
 * default never governs in practice; it matches the store default (`na`,
 * language-agnostic "Auto") to avoid two competing defaults.
 */
const DEFAULT_SUPERTONIC_LANGUAGE: SupertonicLanguage = 'na';

/**
 * Supertonic neural TTS engine (v3, 31 languages + trained `na`).
 *
 * The 4-model ONNX pipeline (plus `unicode_indexer.json`) is downloaded on
 * demand from HuggingFace (Supertone/supertonic-3), stored under
 * `Library/Application Support/tts/supertonic/` on iOS (with
 * `NSURLIsExcludedFromBackupKey` set on the parent `tts/` directory at
 * mkdir time) and `files/tts/supertonic/` on Android (excluded via backup
 * rules XML).
 *
 * v3 keeps the v2 filenames, so a version sentinel written as the final
 * download step distinguishes a fresh v3 install from a stale v2 one;
 * `isInstalled()` requires the sentinel at `SUPERTONIC_MODEL_VERSION`,
 * forcing legacy v2 users through one clean re-download.
 *
 * Once installed, `play()` and `playStreaming()` delegate to
 * `@pocketpalai/react-native-speech`. The engine lazily calls
 * `Speech.initialize()` on first play; subsequent plays reuse the
 * initialized engine.
 */
export class SupertonicEngine implements Engine {
  readonly id = 'supertonic' as const;

  /** Root directory: parent of the Supertonic model directory. Used for the iOS backup-exclusion mkdir. */
  private getParentDir(): string {
    const root =
      Platform.OS === 'ios'
        ? `${RNFS.LibraryDirectoryPath}/Application Support`
        : RNFS.DocumentDirectoryPath;
    return `${root}/${TTS_PARENT_SUBDIR}`;
  }

  /** Returns the directory where the Supertonic model bundle lives. */
  getModelPath(): string {
    const root =
      Platform.OS === 'ios'
        ? `${RNFS.LibraryDirectoryPath}/Application Support`
        : RNFS.DocumentDirectoryPath;
    return `${root}/${SUPERTONIC_MODEL_SUBDIR}`;
  }

  private getFilePath(filename: string): string {
    return `${this.getModelPath()}/${filename}`;
  }

  async isInstalled(): Promise<boolean> {
    try {
      for (const file of SUPERTONIC_MODEL_FILES) {
        if (!(await RNFS.exists(this.getFilePath(file.name)))) {
          return false;
        }
      }
      if (
        !(await RNFS.exists(
          this.getFilePath(SUPERTONIC_VOICES_MANIFEST_FILENAME),
        ))
      ) {
        return false;
      }
      // v3 gate: the model filenames are identical to v2, so a stale v2
      // install passes every file check above. Require a version sentinel at
      // the current version to tell v3 from v2. Missing, unparseable, or
      // older-version sentinel → not installed → forced re-download.
      return this.isSentinelAtCurrentVersion();
    } catch (err) {
      console.warn('[SupertonicEngine] isInstalled check failed:', err);
      return false;
    }
  }

  /**
   * True only when the version sentinel exists, parses, and records the
   * model version this app expects. Any failure returns false.
   */
  private async isSentinelAtCurrentVersion(): Promise<boolean> {
    try {
      const sentinelPath = this.getFilePath(
        SUPERTONIC_VERSION_SENTINEL_FILENAME,
      );
      if (!(await RNFS.exists(sentinelPath))) {
        return false;
      }
      const raw = await RNFS.readFile(sentinelPath);
      const parsed = JSON.parse(raw) as {version?: unknown};
      return parsed.version === SUPERTONIC_MODEL_VERSION;
    } catch (err) {
      console.warn('[SupertonicEngine] sentinel check failed:', err);
      return false;
    }
  }

  /**
   * Delete the whole stale model directory before a (re)download. v2 and v3
   * share filenames, so per-file reclaim is impossible — the entire dir is
   * stale when the sentinel doesn't match. Invoked by the store before the
   * disk-space preflight so reclaimed space counts toward the threshold.
   * Idempotent; safe when the dir is absent or already at the current version.
   */
  async reclaimLegacySpace(): Promise<void> {
    if (await this.isSentinelAtCurrentVersion()) {
      return;
    }
    const modelDir = this.getModelPath();
    if (await RNFS.exists(modelDir)) {
      await RNFS.unlink(modelDir).catch(() => {});
    }
  }

  async getVoices(): Promise<Voice[]> {
    return SUPERTONIC_VOICES;
  }

  /**
   * Download the 5-file model bundle and synthesize the local voices
   * manifest. `onProgress` receives a 0..1 overall progress number based
   * on byte counts summed across files.
   *
   * On iOS the parent `tts/` directory is created with
   * `NSURLIsExcludedFromBackupKey=true` so neither `tts/` nor its child
   * `supertonic/` are uploaded to iCloud / device-transfer snapshots.
   * On Android the exclusion is configured statically via
   * `android/app/src/main/res/xml/backup_rules_*.xml`.
   *
   * Partial downloads on error are cleaned up by deleting the model
   * directory; the caller can simply re-invoke `downloadModel()` to retry.
   */
  async downloadModel(onProgress?: SupertonicProgressCallback): Promise<void> {
    const parentDir = this.getParentDir();
    const modelDir = this.getModelPath();

    // Create parent `tts/` with iOS backup exclusion, then the child
    // `supertonic/` directory. RNFS ignores `NSURLIsExcludedFromBackupKey`
    // on Android; the Android exclusion lives in backup_rules XML.
    await RNFS.mkdir(parentDir, {NSURLIsExcludedFromBackupKey: true});
    await RNFS.mkdir(modelDir, {NSURLIsExcludedFromBackupKey: true});

    // Phase 1: core ONNX model files — all-or-nothing.
    const corePhaseWeight = 0.7;
    const corePerFile = new Array(SUPERTONIC_MODEL_FILES.length).fill(0);
    const reportCore = () => {
      if (!onProgress) {
        return;
      }
      const sum = corePerFile.reduce((a, b) => a + b, 0);
      onProgress(
        Math.min(1, (sum / SUPERTONIC_MODEL_FILES.length) * corePhaseWeight),
      );
    };

    try {
      for (let i = 0; i < SUPERTONIC_MODEL_FILES.length; i++) {
        const file = SUPERTONIC_MODEL_FILES[i]!;
        const target = this.getFilePath(file.name);
        const result = await RNFS.downloadFile({
          fromUrl: `${SUPERTONIC_MODEL_BASE_URL}/${file.urlPath}`,
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

      // Phase 2: per-voice style JSON files — best-effort; partial OK.
      // Without these the StyleLoader would fetch them lazily on first
      // play, causing a confusing delay after the user picks a voice.
      const voicePhaseBase = corePhaseWeight;
      const voicePhaseWeight = 1 - corePhaseWeight;
      let voicesDone = 0;
      for (const voice of SUPERTONIC_VOICES) {
        const target = this.getFilePath(`${voice.id}.json`);
        try {
          const result = await RNFS.downloadFile({
            fromUrl: `${SUPERTONIC_VOICES_BASE_URL}/${voice.id}.json`,
            toFile: target,
            background: false,
            discretionary: false,
            cacheable: false,
            progressInterval: 1000,
          }).promise;
          if (result.statusCode !== 200) {
            console.warn(
              `[SupertonicEngine] voice ${voice.id} download failed: HTTP ${result.statusCode}`,
            );
          }
        } catch (voiceErr) {
          console.warn(
            `[SupertonicEngine] voice ${voice.id} download failed:`,
            voiceErr,
          );
        }
        voicesDone++;
        if (onProgress) {
          onProgress(
            Math.min(
              1,
              voicePhaseBase +
                (voicesDone / SUPERTONIC_VOICES.length) * voicePhaseWeight,
            ),
          );
        }
      }

      // Manifest WITH baseUrl — if any voice files failed to download
      // (flaky network), the fork's StyleLoader can lazy-fetch them from
      // this URL on first play. Matches Kokoro's pattern.
      const manifest = {
        baseUrl: SUPERTONIC_VOICES_BASE_URL,
        voices: SUPERTONIC_VOICES.map(v => v.id),
      };
      await RNFS.writeFile(
        this.getFilePath(SUPERTONIC_VOICES_MANIFEST_FILENAME),
        JSON.stringify(manifest, null, 2),
      );

      // Version sentinel is the FINAL disk write (I-M2): if the process is
      // killed before this, isInstalled() reports false and the download is
      // cleanly redone — an interrupted v3 never looks installed.
      await RNFS.writeFile(
        this.getFilePath(SUPERTONIC_VERSION_SENTINEL_FILENAME),
        JSON.stringify({version: SUPERTONIC_MODEL_VERSION}),
      );

      if (onProgress) {
        onProgress(1);
      }
    } catch (err) {
      // Partial cleanup — next retry starts from scratch.
      try {
        if (await RNFS.exists(modelDir)) {
          await RNFS.unlink(modelDir);
        }
      } catch (cleanupErr) {
        console.warn(
          '[SupertonicEngine] partial-download cleanup failed:',
          cleanupErr,
        );
      }
      throw err;
    }
  }

  async deleteModel(): Promise<void> {
    try {
      if (await RNFS.exists(this.getModelPath())) {
        await RNFS.unlink(this.getModelPath());
      }
    } catch (err) {
      console.warn('[SupertonicEngine] deleteModel failed:', err);
    }
  }

  async loadInto(): Promise<void> {
    const modelDir = this.getModelPath();
    await Speech.initialize({
      engine: TTSEngine.SUPERTONIC,
      durationPredictorPath: `file://${modelDir}/duration_predictor.onnx`,
      textEncoderPath: `file://${modelDir}/text_encoder.onnx`,
      vectorEstimatorPath: `file://${modelDir}/vector_estimator.onnx`,
      vocoderPath: `file://${modelDir}/vocoder.onnx`,
      unicodeIndexerPath: `file://${modelDir}/unicode_indexer.json`,
      voicesPath: `file://${modelDir}/${SUPERTONIC_VOICES_MANIFEST_FILENAME}`,
      silentMode: 'obey',
      ducking: true,
      maxChunkSize: 200,
      executionProviders: ['cpu'],
    });
  }

  async play(
    text: string,
    voice: Voice,
    opts?: {language?: SupertonicLanguage; inferenceSteps?: SupertonicSteps},
  ): Promise<void> {
    if (!(await this.isInstalled())) {
      throw new Error('Supertonic model is not installed');
    }
    await ttsRuntime.acquire(this, () =>
      Speech.speak(text, voice.id, {
        language: opts?.language ?? DEFAULT_SUPERTONIC_LANGUAGE,
        ...(opts?.inferenceSteps ? {inferenceSteps: opts.inferenceSteps} : {}),
      }),
    );
  }

  playStreaming(
    voice: Voice,
    waitFor?: Promise<void>,
    opts?: {language?: SupertonicLanguage; inferenceSteps?: SupertonicSteps},
  ): StreamingHandle {
    return createEngineStreamingHandle(
      this,
      voice.id,
      {
        language: opts?.language ?? DEFAULT_SUPERTONIC_LANGUAGE,
        ...(opts?.inferenceSteps ? {inferenceSteps: opts.inferenceSteps} : {}),
      },
      waitFor,
    );
  }

  async stop(): Promise<void> {
    await Speech.stop();
  }
}
