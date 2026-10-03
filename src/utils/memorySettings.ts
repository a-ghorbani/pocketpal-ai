import {Platform} from 'react-native';
import * as RNFS from '@dr.pogodin/react-native-fs';
import {loadLlamaModelInfo} from 'llama.rn';
import NativeHardwareInfo from '../specs/NativeHardwareInfo';

/**
 * Files at or above this size always load with mmap on Android, regardless of
 * the repack fast path: malloc'ing the whole file is what OOM-kills the app
 * on 2GB+ models. Below it the legacy repack-optimal behavior is kept.
 */
export const SMART_MMAP_MIN_FILE_SIZE = 1 * 1024 ** 3; // 1GB

/**
 * Quantization types that are repackable and should use use_mmap=false
 */
const REPACKABLE_QUANTS = ['Q4_0', 'IQ4_NL'];

/**
 * LlamaFileType enum values for repackable quantizations
 * Based on the LlamaFileType enum from llama.cpp
 */
const REPACKABLE_FILE_TYPES = {
  MOSTLY_Q4_0: 2, // Q4_0 quantization
  MOSTLY_IQ4_NL: 25, // IQ4_NL quantization
};

/**
 * Detects if a model uses repackable quantization types (Q4_0 or IQ4_NL)
 */
export async function isRepackableQuantization(
  modelPath: string,
): Promise<boolean> {
  try {
    const modelInfo = await loadLlamaModelInfo(modelPath);

    // Check if model info is valid and contains file_type
    if (
      !modelInfo ||
      typeof modelInfo !== 'object' ||
      !('general.file_type' in modelInfo)
    ) {
      return false;
    }

    const fileType = (modelInfo as any)['general.file_type'];

    // Ensure fileType exists
    if (fileType === undefined || fileType === null) {
      return false;
    }

    if (typeof fileType === 'string') {
      const numericValue = parseInt(fileType, 10);
      if (!isNaN(numericValue)) {
        const isRepackable = Object.values(REPACKABLE_FILE_TYPES).includes(
          numericValue,
        );
        if (isRepackable) {
          console.log(
            'Detected repackable quantization:',
            fileType,
            '(enum value:',
            numericValue,
            ')',
          );
        }
        return isRepackable;
      }

      const isRepackable = REPACKABLE_QUANTS.some(quant =>
        fileType.toUpperCase().includes(quant.toUpperCase()),
      );
      if (isRepackable) {
        console.log('Detected repackable quantization from string:', fileType);
      }
      return isRepackable;
    }

    // Handle numeric fileType (just in case)
    if (typeof fileType === 'number') {
      const isRepackable = Object.values(REPACKABLE_FILE_TYPES).includes(
        fileType,
      );
      if (isRepackable) {
        console.log('Detected repackable quantization from number:', fileType);
      }
      return isRepackable;
    }

    return false;
  } catch (error) {
    console.warn(
      'Failed to detect quantization type, defaulting to false:',
      error,
    );
    return false;
  }
}

/**
 * Resolves the effective use_mmap value based on the setting and model characteristics
 *
 * @param setting - The user's mmap setting ('true', 'false', or 'smart')
 * @param modelPath - Path to the model file (used for smart detection)
 * @returns Promise<boolean> - The resolved use_mmap value
 */
export async function resolveUseMmap(
  setting: 'true' | 'false' | 'smart',
  modelPath: string,
): Promise<boolean> {
  switch (setting) {
    case 'true':
      return true;
    case 'false':
      return false;
    case 'smart':
      // On non-Android platforms mmap is always fine.
      if (Platform.OS !== 'android') {
        return true;
      }
      // On Android, files too big to malloc get mmap. Just below, the
      // repack-optimal path (mmap OFF) is kept for small files.
      try {
        const stat = await RNFS.stat(modelPath);
        const size = Number(stat?.size || 0);
        if (size >= SMART_MMAP_MIN_FILE_SIZE) {
          return true;
        }
      } catch {
        // Stat failed (file missing?) — fail closed is wrong here; fall
        // through to the legacy default below.
      }
      return false;
    default:
      return true;
  }
}

/**
 * Safety clamp applied after normal mmap resolution: malloc'ing a 1GB+ file
 * is what OOM-kills Android on 2GB+ models, so mmap is forced back on when
 * the file is big and the malloc path provably doesn't fit (or free RAM
 * can't even be read). Explicit user choice is respected for small files.
 */
export async function enforceMmapForLargeFile(
  resolved: boolean,
  setting: 'true' | 'false' | 'smart',
  modelPath?: string,
): Promise<boolean> {
  if (resolved || !modelPath) {
    return resolved;
  }

  try {
    const fileSize = Number((await RNFS.stat(modelPath))?.size || 0);
    if (fileSize < SMART_MMAP_MIN_FILE_SIZE) {
      return resolved;
    }
    const liveFree = await NativeHardwareInfo.getAvailableMemory().catch(
      () => 0,
    );
    if (!liveFree || fileSize * 1.2 > liveFree) {
      console.warn(
        `[mmap] Forcing use_mmap=ON for ${(fileSize / 1e9).toFixed(1)}GB ` +
          `model (setting was '${setting}'): malloc path would OOM.`,
      );
      return true;
    }
  } catch {
    // Stat failed — keep the resolved value.
  }
  return resolved;
}
