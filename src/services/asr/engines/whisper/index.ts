import {Platform} from 'react-native';

import * as RNFS from '@dr.pogodin/react-native-fs';
import {initWhisper, type WhisperContext} from 'whisper.rn';

import {
  ASR_MODEL_VERSION,
  ASR_PARENT_SUBDIR,
  ASR_TIERS,
  ASR_VERSION_SENTINEL_FILENAME,
} from '../../constants';
import type {AsrEngine, AsrProgressCallback, AsrTier} from '../../types';

/**
 * Whisper ASR engine (whisper.rn / whisper.cpp GGML models).
 *
 * Each tier (`base`/`small`/`large-turbo`) is an independent on-disk install
 * under `asr/<tier>/`, with its own version sentinel written as the final
 * download step so an interrupted download never reports installed. Install
 * truth lives on disk; no store flag mirrors it.
 *
 * Transcription runs entirely on-device: `initWhisper` loads the local GGML
 * model and `transcribeData` decodes a captured PCM buffer. The only network
 * call in this engine is the HuggingFace model download in `downloadModel`.
 */
export class WhisperAsrEngine implements AsrEngine {
  private context: WhisperContext | null = null;
  private loadedTier: AsrTier | null = null;

  private getRoot(): string {
    return Platform.OS === 'ios'
      ? `${RNFS.LibraryDirectoryPath}/Application Support`
      : RNFS.DocumentDirectoryPath;
  }

  private getParentDir(): string {
    return `${this.getRoot()}/${ASR_PARENT_SUBDIR}`;
  }

  private getTierDir(tier: AsrTier): string {
    return `${this.getParentDir()}/${tier}`;
  }

  private getModelPath(tier: AsrTier): string {
    return `${this.getTierDir(tier)}/${ASR_TIERS[tier].modelFilename}`;
  }

  private getSentinelPath(tier: AsrTier): string {
    return `${this.getTierDir(tier)}/${ASR_VERSION_SENTINEL_FILENAME}`;
  }

  async isInstalled(tier: AsrTier): Promise<boolean> {
    try {
      if (!(await RNFS.exists(this.getModelPath(tier)))) {
        return false;
      }
      return this.isSentinelAtCurrentVersion(tier);
    } catch (err) {
      console.warn('[WhisperAsrEngine] isInstalled check failed:', err);
      return false;
    }
  }

  private async isSentinelAtCurrentVersion(tier: AsrTier): Promise<boolean> {
    try {
      const sentinelPath = this.getSentinelPath(tier);
      if (!(await RNFS.exists(sentinelPath))) {
        return false;
      }
      const raw = await RNFS.readFile(sentinelPath);
      const parsed = JSON.parse(raw) as {version?: unknown};
      return parsed.version === ASR_MODEL_VERSION;
    } catch (err) {
      console.warn('[WhisperAsrEngine] sentinel check failed:', err);
      return false;
    }
  }

  async reclaimLegacySpace(tier: AsrTier): Promise<void> {
    if (await this.isSentinelAtCurrentVersion(tier)) {
      return;
    }
    const tierDir = this.getTierDir(tier);
    if (await RNFS.exists(tierDir)) {
      await RNFS.unlink(tierDir).catch(() => {});
    }
  }

  async downloadModel(
    tier: AsrTier,
    onProgress?: AsrProgressCallback,
  ): Promise<void> {
    const manifest = ASR_TIERS[tier];
    const parentDir = this.getParentDir();
    const tierDir = this.getTierDir(tier);

    // Create parent `asr/` with iOS backup exclusion, then the tier dir.
    // RNFS ignores NSURLIsExcludedFromBackupKey on Android; the Android
    // exclusion lives in backup_rules XML.
    await RNFS.mkdir(parentDir, {NSURLIsExcludedFromBackupKey: true});
    await RNFS.mkdir(tierDir, {NSURLIsExcludedFromBackupKey: true});

    try {
      const result = await RNFS.downloadFile({
        fromUrl: manifest.modelUrl,
        toFile: this.getModelPath(tier),
        background: false,
        discretionary: false,
        cacheable: false,
        progressInterval: 500,
        progress: res => {
          if (!onProgress) {
            return;
          }
          const contentLength = res.contentLength || manifest.estimatedBytes;
          onProgress(Math.min(1, res.bytesWritten / contentLength));
        },
      }).promise;

      if (result.statusCode !== 200) {
        throw new Error(
          `Failed to download ${manifest.modelFilename}: HTTP ${result.statusCode}`,
        );
      }

      // Version sentinel is the FINAL disk write: if the process is killed
      // before this, isInstalled() reports false and the download is cleanly
      // redone — an interrupted install never looks installed.
      await RNFS.writeFile(
        this.getSentinelPath(tier),
        JSON.stringify({version: ASR_MODEL_VERSION}),
      );

      onProgress?.(1);
    } catch (err) {
      try {
        if (await RNFS.exists(tierDir)) {
          await RNFS.unlink(tierDir);
        }
      } catch (cleanupErr) {
        console.warn(
          '[WhisperAsrEngine] partial-download cleanup failed:',
          cleanupErr,
        );
      }
      throw err;
    }
  }

  async deleteModel(tier: AsrTier): Promise<void> {
    try {
      if (this.loadedTier === tier) {
        await this.release();
      }
      const tierDir = this.getTierDir(tier);
      if (await RNFS.exists(tierDir)) {
        await RNFS.unlink(tierDir);
      }
    } catch (err) {
      console.warn('[WhisperAsrEngine] deleteModel failed:', err);
    }
  }

  private async ensureContext(tier: AsrTier): Promise<WhisperContext> {
    if (this.context && this.loadedTier === tier) {
      return this.context;
    }
    if (this.context) {
      await this.release();
    }
    const context = await initWhisper({
      filePath: this.getModelPath(tier),
      // CoreML sidecar is an optional accelerator; absence degrades to the
      // GGUF CPU path. Falling back to CPU never blocks transcription.
      useCoreMLIos: Platform.OS === 'ios',
    });
    this.context = context;
    this.loadedTier = tier;
    return context;
  }

  async transcribe(
    pcmBase64Float32: string,
    opts?: {tier: AsrTier; language?: string},
  ): Promise<string> {
    const tier = opts?.tier ?? 'small';
    if (!(await this.isInstalled(tier))) {
      throw new Error(`ASR model not installed for tier ${tier}`);
    }
    const context = await this.ensureContext(tier);
    // transcribeData consumes base64-encoded float32 PCM (16 kHz mono).
    const {promise} = context.transcribeData(pcmBase64Float32, {
      language: opts?.language ?? 'auto',
    });
    const result = await promise;
    return result.result.trim();
  }

  async release(): Promise<void> {
    if (this.context) {
      try {
        await this.context.release();
      } catch (err) {
        console.warn('[WhisperAsrEngine] release failed:', err);
      }
      this.context = null;
      this.loadedTier = null;
    }
  }
}

export const whisperAsrEngine = new WhisperAsrEngine();
