import {Platform} from 'react-native';

import * as RNFS from '@dr.pogodin/react-native-fs';
import Speech, {TTSEngine} from '@pocketpalai/react-native-speech';

import {
  KITTEN_MODEL_BASE_URL,
  KITTEN_MODEL_FILES,
  KITTEN_MODEL_SUBDIR,
  TTS_DICT_FILENAME,
  TTS_DICT_URL,
  TTS_PARENT_SUBDIR,
} from '../../constants';
import {ttsRuntime} from '../../runtime';
import type {Engine, StreamingHandle, Voice} from '../../types';
import {KITTEN_VOICES} from './voices';

export type KittenProgressCallback = (progress: number) => void;

/**
 * Kitten neural TTS engine (15M StyleTTS2, English only).
 *
 * Installation is a single-phase, all-or-nothing download: the ONNX model,
 * the voices manifest, and the IPA dict. On any failure the entire
 * `tts/kitten/` directory is removed so a retry starts clean.
 *
 * CPU-only execution is forced to match the other neural engines.
 */
export class KittenEngine implements Engine {
  readonly id = 'kitten' as const;

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
    return `${root}/${KITTEN_MODEL_SUBDIR}`;
  }

  private getFilePath(filename: string): string {
    return `${this.getModelPath()}/${filename}`;
  }

  async isInstalled(): Promise<boolean> {
    try {
      for (const file of KITTEN_MODEL_FILES) {
        if (!(await RNFS.exists(this.getFilePath(file.name)))) {
          return false;
        }
      }
      return RNFS.exists(this.getFilePath(TTS_DICT_FILENAME));
    } catch (err) {
      console.warn('[KittenEngine] isInstalled check failed:', err);
      return false;
    }
  }

  async getVoices(): Promise<Voice[]> {
    return KITTEN_VOICES;
  }

  async downloadModel(onProgress?: KittenProgressCallback): Promise<void> {
    const parentDir = this.getParentDir();
    const modelDir = this.getModelPath();

    await RNFS.mkdir(parentDir, {NSURLIsExcludedFromBackupKey: true});
    await RNFS.mkdir(modelDir, {NSURLIsExcludedFromBackupKey: true});

    const allFiles = [
      ...KITTEN_MODEL_FILES.map(f => ({
        name: f.name,
        url: `${KITTEN_MODEL_BASE_URL}/${f.urlPath}`,
      })),
      {name: TTS_DICT_FILENAME, url: TTS_DICT_URL},
    ];
    const perFileProgress = new Array(allFiles.length).fill(0);
    const reportOverall = () => {
      if (!onProgress) {
        return;
      }
      const sum = perFileProgress.reduce((a, b) => a + b, 0);
      onProgress(Math.min(1, sum / allFiles.length));
    };

    try {
      for (let i = 0; i < allFiles.length; i++) {
        const file = allFiles[i]!;
        const target = this.getFilePath(file.name);
        const result = await RNFS.downloadFile({
          fromUrl: file.url,
          toFile: target,
          background: false,
          discretionary: false,
          cacheable: false,
          progressInterval: 500,
          progress: res => {
            const contentLength = res.contentLength || 1;
            perFileProgress[i] = Math.min(1, res.bytesWritten / contentLength);
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

      if (onProgress) {
        onProgress(1);
      }
    } catch (err) {
      try {
        if (await RNFS.exists(modelDir)) {
          await RNFS.unlink(modelDir);
        }
      } catch (cleanupErr) {
        console.warn(
          '[KittenEngine] partial-download cleanup failed:',
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
      console.warn('[KittenEngine] deleteModel failed:', err);
    }
  }

  async loadInto(): Promise<void> {
    const modelDir = this.getModelPath();
    await Speech.initialize({
      engine: TTSEngine.KITTEN,
      modelPath: `file://${modelDir}/kitten.onnx`,
      voicesPath: `file://${modelDir}/voices-manifest.json`,
      dictPath: `file://${modelDir}/${TTS_DICT_FILENAME}`,
      executionProviders: 'cpu',
      maxChunkSize: 200,
      silentMode: 'obey',
      ducking: true,
    });
  }

  async play(text: string, voice: Voice): Promise<void> {
    if (!(await this.isInstalled())) {
      throw new Error('Kitten model is not installed');
    }
    await ttsRuntime.acquire(this, () => Speech.speak(text, voice.id));
  }

  playStreaming(voice: Voice): StreamingHandle {
    let buffer = '';
    const queue: string[] = [];
    let speaking = false;
    let dead = false;
    let finalized = false;
    let finalizeResolve: (() => void) | null = null;
    let finalizeReject: ((err: Error) => void) | null = null;

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
        await ttsRuntime.acquire(this, () => Speech.speak(next, voice.id));
      } catch (err) {
        console.warn('[KittenEngine] streaming speak failed:', err);
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
      speakNext().catch(() => {});
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
          speakNext().catch(() => {});
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
          speakNext().catch(() => {});
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
        await ttsRuntime.stop();
      },
    };
  }

  async stop(): Promise<void> {
    await ttsRuntime.stop();
  }
}
