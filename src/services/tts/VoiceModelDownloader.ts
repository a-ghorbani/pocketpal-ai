import * as RNFS from '@dr.pogodin/react-native-fs';
import Speech from '@mhpdev/react-native-speech';
import type {NeuralVoiceModel, VoiceModelCatalogEntry} from '../../types/tts';
import {ttsStore} from '../../store/TTSStore';
import {getVoiceById} from './voiceModelCatalog';

const TAG = '[VoiceModelDownloader]';

/**
 * Get the base directory for TTS voice models
 */
export function getVoiceModelsDirectory(): string {
  return `${RNFS.DocumentDirectoryPath}/tts-voices`;
}

/**
 * Get the directory for a specific voice model
 */
export function getVoiceDirectory(identifier: string): string {
  return `${getVoiceModelsDirectory()}/${identifier}`;
}

/**
 * Check if a voice model is downloaded
 */
export async function isVoiceDownloaded(identifier: string): Promise<boolean> {
  const voiceDir = getVoiceDirectory(identifier);
  const catalogEntry = getVoiceById(identifier);

  if (!catalogEntry) {
    return false;
  }

  try {
    // Check if all required files exist
    const modelPath = `${voiceDir}/${catalogEntry.files.model}`;
    const tokensPath = `${voiceDir}/${catalogEntry.files.tokens}`;
    const dataPath = `${voiceDir}/${catalogEntry.files.data}`;

    const [modelExists, tokensExists, dataExists] = await Promise.all([
      RNFS.exists(modelPath),
      RNFS.exists(tokensPath),
      RNFS.exists(dataPath),
    ]);

    return modelExists && tokensExists && dataExists;
  } catch (error) {
    console.error(`${TAG} Error checking if voice is downloaded:`, error);
    return false;
  }
}

/**
 * Download a voice model
 */
export async function downloadVoiceModel(
  catalogEntry: VoiceModelCatalogEntry,
  onProgress?: (progress: number) => void,
): Promise<NeuralVoiceModel> {
  const {identifier, downloadUrl} = catalogEntry;
  const voiceDir = getVoiceDirectory(identifier);
  const tempFile = `${voiceDir}.tar.gz`;

  console.log(`${TAG} Starting download for voice: ${identifier}`);

  try {
    // Create voice directory
    if (!(await RNFS.exists(voiceDir))) {
      await RNFS.mkdir(voiceDir);
    }

    // Update download state
    ttsStore.setDownloadState(identifier, {
      isDownloading: true,
      progress: 0,
    });

    // Download the tar.gz file
    const downloadResult = RNFS.downloadFile({
      fromUrl: downloadUrl,
      toFile: tempFile,
      progressInterval: 500,
      begin: res => {
        console.log(`${TAG} Download started:`, {
          statusCode: res.statusCode,
          contentLength: res.contentLength,
        });
      },
      progress: res => {
        const progress = (res.bytesWritten / res.contentLength) * 100;
        onProgress?.(progress);
        ttsStore.setDownloadState(identifier, {
          isDownloading: true,
          progress,
        });
      },
    });

    const result = await downloadResult.promise;

    if (result.statusCode !== 200) {
      throw new Error(`Download failed with status code: ${result.statusCode}`);
    }

    console.log(`${TAG} Download completed, extracting...`);

    // Extract the tar.gz file
    // Note: react-native-fs doesn't have built-in tar extraction
    // We'll need to use a different approach or library
    // For now, we'll assume the files are extracted manually or use a different format

    // TODO: Implement tar.gz extraction
    // Options:
    // 1. Use react-native-zip-archive (supports tar.gz on some platforms)
    // 2. Download individual files instead of tar.gz
    // 3. Use native modules for extraction

    // For MVP, we'll download individual files instead
    throw new Error(
      'Tar.gz extraction not yet implemented. Please download individual files.',
    );
  } catch (error) {
    console.error(`${TAG} Download failed:`, error);

    // Clean up on error
    try {
      if (await RNFS.exists(tempFile)) {
        await RNFS.unlink(tempFile);
      }
    } catch (cleanupError) {
      console.error(`${TAG} Cleanup failed:`, cleanupError);
    }

    ttsStore.setDownloadState(identifier, {
      isDownloading: false,
      progress: 0,
      error: error instanceof Error ? error : new Error(String(error)),
    });

    throw error;
  }
}

/**
 * Register a downloaded voice model with the Speech library
 */
export async function registerVoiceModel(
  voice: NeuralVoiceModel,
): Promise<void> {
  if (
    !voice.isDownloaded ||
    !voice.modelPath ||
    !voice.tokensPath ||
    !voice.dataPath
  ) {
    throw new Error('Voice model is not fully downloaded');
  }

  try {
    await Speech.addNeuralVoice({
      identifier: voice.identifier,
      name: voice.name,
      language: voice.language,
      model: {
        modelPath: voice.modelPath,
        tokensPath: voice.tokensPath,
        dataPath: voice.dataPath,
      },
      numSpeakers: voice.numSpeakers,
      sampleRate: voice.sampleRate,
    });

    console.log(`${TAG} Voice model registered: ${voice.identifier}`);
  } catch (error) {
    console.error(`${TAG} Failed to register voice model:`, error);
    throw error;
  }
}

/**
 * Unregister a voice model from the Speech library
 */
export async function unregisterVoiceModel(identifier: string): Promise<void> {
  try {
    await Speech.removeNeuralVoice(identifier);
    console.log(`${TAG} Voice model unregistered: ${identifier}`);
  } catch (error) {
    console.error(`${TAG} Failed to unregister voice model:`, error);
    throw error;
  }
}

/**
 * Delete a downloaded voice model
 */
export async function deleteVoiceModel(identifier: string): Promise<void> {
  const voiceDir = getVoiceDirectory(identifier);

  try {
    // Unregister from Speech library first
    try {
      await unregisterVoiceModel(identifier);
    } catch (error) {
      // Continue even if unregister fails (voice might not be registered)
      console.warn(
        `${TAG} Failed to unregister voice (continuing with deletion):`,
        error,
      );
    }

    // Delete the voice directory
    if (await RNFS.exists(voiceDir)) {
      await RNFS.unlink(voiceDir);
      console.log(`${TAG} Voice model deleted: ${identifier}`);
    }

    // Update store
    ttsStore.removeNeuralVoiceModel(identifier);
    ttsStore.clearDownloadState(identifier);
  } catch (error) {
    console.error(`${TAG} Failed to delete voice model:`, error);
    throw error;
  }
}

/**
 * Initialize voice models on app startup
 * Scans the voice directory and registers downloaded voices
 */
export async function initializeVoiceModels(): Promise<void> {
  console.log(`${TAG} Initializing voice models...`);

  try {
    const voicesDir = getVoiceModelsDirectory();

    // Create voices directory if it doesn't exist
    if (!(await RNFS.exists(voicesDir))) {
      await RNFS.mkdir(voicesDir);
      console.log(`${TAG} Created voices directory`);
      return;
    }

    // Scan for downloaded voices
    const items = await RNFS.readDir(voicesDir);

    for (const item of items) {
      if (item.isDirectory()) {
        const identifier = item.name;
        const catalogEntry = getVoiceById(identifier);

        if (catalogEntry) {
          const isDownloaded = await isVoiceDownloaded(identifier);

          if (isDownloaded) {
            const voiceDir = getVoiceDirectory(identifier);
            const voice: NeuralVoiceModel = {
              ...catalogEntry,
              isDownloaded: true,
              modelPath: `${voiceDir}/${catalogEntry.files.model}`,
              tokensPath: `${voiceDir}/${catalogEntry.files.tokens}`,
              dataPath: `${voiceDir}/${catalogEntry.files.data}`,
            };

            // Add to store
            ttsStore.addNeuralVoiceModel(voice);

            // Register with Speech library
            try {
              await registerVoiceModel(voice);
            } catch (error) {
              console.error(
                `${TAG} Failed to register voice ${identifier}:`,
                error,
              );
            }
          }
        }
      }
    }

    console.log(`${TAG} Voice models initialized`);
  } catch (error) {
    console.error(`${TAG} Failed to initialize voice models:`, error);
  }
}
