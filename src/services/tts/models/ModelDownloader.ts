/**
 * Neural TTS Model Downloader
 * Handles downloading and managing neural TTS model files
 * Supports multiple engines (Kokoro, Piper, etc.)
 */

import * as RNFS from '@dr.pogodin/react-native-fs';
import type {KokoroModelInfo, ModelDownloadState} from '../../../types/tts';
import type {KokoroModelCatalogEntry} from './kokoroModelCatalog';

/**
 * Get base directory for TTS models
 */
export function getModelsDirectory(): string {
  return `${RNFS.DocumentDirectoryPath}/tts-models`;
}

/**
 * Get directory for Kokoro models
 */
export function getKokoroModelsDirectory(): string {
  return `${getModelsDirectory()}/kokoro`;
}

/**
 * Get directory for a specific Kokoro model variant
 */
export function getKokoroModelDirectory(variant: string): string {
  return `${getKokoroModelsDirectory()}/${variant}`;
}

/**
 * Check if Kokoro model is downloaded
 */
export async function isKokoroModelDownloaded(
  variant: string,
): Promise<boolean> {
  const modelDir = getKokoroModelDirectory(variant);

  try {
    const exists = await RNFS.exists(modelDir);
    if (!exists) {
      return false;
    }

    // Check if all required files exist
    const files = ['model.onnx', 'vocab.json', 'merges.txt', 'voices.bin'];
    const checks = await Promise.all(
      files.map(file => RNFS.exists(`${modelDir}/${file}`)),
    );

    return checks.every(fileExists => fileExists);
  } catch (error) {
    console.error('Error checking model download status:', error);
    return false;
  }
}

/**
 * Download a Kokoro model
 */
export async function downloadKokoroModel(
  catalogEntry: KokoroModelCatalogEntry,
  onProgress?: (state: ModelDownloadState) => void,
): Promise<KokoroModelInfo> {
  const modelDir = getKokoroModelDirectory(catalogEntry.variant);

  try {
    // Create directory
    await RNFS.mkdir(modelDir);

    const files = [
      {url: catalogEntry.downloadUrls.model, filename: 'model.onnx'},
      {url: catalogEntry.downloadUrls.vocab, filename: 'vocab.json'},
      {url: catalogEntry.downloadUrls.merges, filename: 'merges.txt'},
      {url: catalogEntry.downloadUrls.voices, filename: 'voices.bin'},
    ];

    let totalDownloaded = 0;
    const totalSize = catalogEntry.size;

    // Download each file
    for (const file of files) {
      const destPath = `${modelDir}/${file.filename}`;

      await RNFS.downloadFile({
        fromUrl: file.url,
        toFile: destPath,
        progress: res => {
          const overallProgress =
            ((totalDownloaded + res.bytesWritten) / totalSize) * 100;

          onProgress?.({
            isDownloading: true,
            progress: Math.min(overallProgress, 100),
            bytesDownloaded: totalDownloaded + res.bytesWritten,
            totalBytes: totalSize,
          });
        },
      }).promise;

      // Update total downloaded (approximate, since we don't know exact file sizes)
      totalDownloaded += totalSize / files.length;
    }

    // Create model info
    const modelInfo: KokoroModelInfo = {
      version: catalogEntry.version,
      variant: catalogEntry.variant,
      size: catalogEntry.size,
      isDownloaded: true,
      modelPath: `${modelDir}/model.onnx`,
      vocabPath: `${modelDir}/vocab.json`,
      mergesPath: `${modelDir}/merges.txt`,
      voicesPath: `${modelDir}/voices.bin`,
    };

    onProgress?.({
      isDownloading: false,
      progress: 100,
      bytesDownloaded: totalSize,
      totalBytes: totalSize,
    });

    return modelInfo;
  } catch (error) {
    console.error('Error downloading Kokoro model:', error);

    onProgress?.({
      isDownloading: false,
      progress: 0,
      error: error instanceof Error ? error.message : 'Download failed',
    });

    throw error;
  }
}

/**
 * Delete a Kokoro model
 */
export async function deleteKokoroModel(variant: string): Promise<void> {
  const modelDir = getKokoroModelDirectory(variant);

  try {
    const exists = await RNFS.exists(modelDir);
    if (exists) {
      await RNFS.unlink(modelDir);
    }
  } catch (error) {
    console.error('Error deleting Kokoro model:', error);
    throw error;
  }
}
