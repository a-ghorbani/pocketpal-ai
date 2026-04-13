import {Platform} from 'react-native';

import * as RNFS from '@dr.pogodin/react-native-fs';
import Speech, {TTSEngine} from '@mhpdev/react-native-speech';

import {
  SUPERTONIC_MODEL_BASE_URL,
  SUPERTONIC_MODEL_FILES,
  SUPERTONIC_MODEL_SUBDIR,
  SUPERTONIC_VOICES_BASE_URL,
  SUPERTONIC_VOICES_MANIFEST_FILENAME,
  TTS_PARENT_SUBDIR,
} from '../../constants';
import type {Engine, StreamingHandle, Voice} from '../../types';
import {SUPERTONIC_VOICES} from './voices';

export type SupertonicProgressCallback = (progress: number) => void;

/**
 * Supertonic neural TTS engine.
 *
 * v1.2 flips Supertonic from a stub to a functional engine: the 4-model
 * ONNX pipeline (plus `unicode_indexer.json`) is downloaded on demand from
 * HuggingFace (URL traced from the upstream fork example at pinned SHA
 * `3ae0094b094d7c3d4e17378e53199813384e88f9`), stored under
 * `Library/Application Support/tts/supertonic/` on iOS (with
 * `NSURLIsExcludedFromBackupKey` set on the parent `tts/` directory at
 * mkdir time) and `files/tts/supertonic/` on Android (excluded via backup
 * rules XML).
 *
 * Once installed, `play()` and `playStreaming()` delegate to
 * `@mhpdev/react-native-speech`. The engine lazily calls
 * `Speech.initialize()` on first play; subsequent plays reuse the
 * initialized engine.
 */
export class SupertonicEngine implements Engine {
  readonly id = 'supertonic' as const;

  private initializationPromise: Promise<void> | null = null;
  private initialized = false;

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
      return RNFS.exists(this.getFilePath(SUPERTONIC_VOICES_MANIFEST_FILENAME));
    } catch (err) {
      console.warn('[SupertonicEngine] isInstalled check failed:', err);
      return false;
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

    // Per-file progress is in bytes; weight each file equally by summing
    // the fractional per-file progress and dividing by file count.
    const perFileProgress = new Array(SUPERTONIC_MODEL_FILES.length).fill(0);
    const reportOverall = () => {
      if (!onProgress) {
        return;
      }
      const sum = perFileProgress.reduce((a, b) => a + b, 0);
      onProgress(Math.min(1, sum / SUPERTONIC_MODEL_FILES.length));
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
            perFileProgress[i] = Math.min(
              1,
              res.bytesWritten / contentLength,
            );
            reportOverall();
          },
        }).promise;

        if (result.statusCode !== 200) {
          throw new Error(
            `Failed to download ${file.name}: HTTP ${result.statusCode}`,
          );
        }
        perFileProgress[i] = 1;
        reportOverall();
      }

      // Synthesize the local voices manifest so the fork's `StyleLoader`
      // can fetch per-voice style embeddings on first synthesis.
      const manifest = {
        baseUrl: SUPERTONIC_VOICES_BASE_URL,
        voices: SUPERTONIC_VOICES.map(v => v.id),
      };
      await RNFS.writeFile(
        this.getFilePath(SUPERTONIC_VOICES_MANIFEST_FILENAME),
        JSON.stringify(manifest, null, 2),
      );

      if (onProgress) {
        onProgress(1);
      }
    } catch (err) {
      // Partial cleanup — next retry starts from scratch. The fork
      // example uses the same strategy.
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
    this.initialized = false;
    this.initializationPromise = null;
  }

  /**
   * Lazy engine initialization — called on first `play` / `playStreaming`.
   * Idempotent: the `initializationPromise` guard coalesces concurrent
   * play requests onto a single init call.
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }
    if (!this.initializationPromise) {
      this.initializationPromise = this.doInitialize();
    }
    try {
      await this.initializationPromise;
    } catch (err) {
      this.initializationPromise = null;
      throw err;
    }
  }

  private async doInitialize(): Promise<void> {
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
    });
    this.initialized = true;
  }

  async play(text: string, voice: Voice): Promise<void> {
    if (!(await this.isInstalled())) {
      throw new Error('Supertonic model is not installed');
    }
    await this.ensureInitialized();
    await Speech.speak(text, voice.id);
  }

  /**
   * Streaming handle — buffers incoming chunks and flushes at sentence
   * boundaries (matching the System engine's breakpoint strategy). The
   * fork's Supertonic engine supports chunked synthesis via repeated
   * `speak` calls; `onFinish` events chain the queue.
   */
  playStreaming(voice: Voice): StreamingHandle {
    let buffer = '';
    const queue: string[] = [];
    let speaking = false;
    let dead = false;
    let finalized = false;
    let finalizeResolve: (() => void) | null = null;
    let finalizeReject: ((err: Error) => void) | null = null;

    // Match the SystemEngine sentence terminator. Supertonic handles
    // longer chunks more efficiently but we use the same boundary to
    // keep time-to-first-speech low.
    const SENTENCE_END = /^[\s\S]*?[.!?。！？](?=\s|$)/;

    const speakNext = async () => {
      if (dead) {
        return;
      }
      const next = queue.shift();
      if (next === undefined) {
        speaking = false;
        if (finalized && finalizeResolve) {
          finalizeResolve();
          finalizeResolve = null;
        }
        return;
      }
      speaking = true;
      try {
        await this.ensureInitialized();
        await Speech.speak(next, voice.id);
      } catch (err) {
        console.warn('[SupertonicEngine] streaming speak failed:', err);
        speaking = false;
        if (finalizeReject) {
          finalizeReject(err instanceof Error ? err : new Error(String(err)));
          finalizeReject = null;
          finalizeResolve = null;
        }
      }
    };

    const subscription = Speech.onFinish(() => {
      if (dead) {
        return;
      }
      void speakNext();
    });

    const drainBuffer = () => {
      while (true) {
        const match = buffer.match(SENTENCE_END);
        if (!match) {
          break;
        }
        const sentence = match[0].trim();
        buffer = buffer.slice(match[0].length);
        if (sentence.length > 0) {
          queue.push(sentence);
        }
      }
    };

    return {
      appendText: (chunk: string) => {
        if (dead || finalized) {
          return;
        }
        buffer += chunk;
        drainBuffer();
        if (!speaking) {
          void speakNext();
        }
      },
      finalize: async () => {
        if (dead || finalized) {
          return;
        }
        finalized = true;
        drainBuffer();
        const tail = buffer.trim();
        buffer = '';
        if (tail.length > 0) {
          queue.push(tail);
        }
        if (!speaking) {
          void speakNext();
        }
        if (queue.length === 0 && !speaking) {
          subscription.remove();
          return;
        }
        await new Promise<void>((resolve, reject) => {
          finalizeResolve = () => {
            subscription.remove();
            resolve();
          };
          finalizeReject = err => {
            subscription.remove();
            reject(err);
          };
        });
      },
      cancel: async () => {
        if (dead) {
          return;
        }
        dead = true;
        queue.length = 0;
        buffer = '';
        subscription.remove();
        if (finalizeResolve) {
          finalizeResolve();
          finalizeResolve = null;
          finalizeReject = null;
        }
        try {
          await Speech.stop();
        } catch (err) {
          console.warn('[SupertonicEngine] stop failed:', err);
        }
      },
    };
  }

  async stop(): Promise<void> {
    try {
      await Speech.stop();
    } catch (err) {
      console.warn('[SupertonicEngine] stop failed:', err);
    }
  }
}
