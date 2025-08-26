import {Platform} from 'react-native';
import {loadLlamaModelInfo} from '@pocketpalai/llama.rn';

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
      // Smart mode: only available on Android
      if (Platform.OS !== 'android') {
        return true; // Default to true on non-Android platforms
      }

      if (!modelPath) {
        console.log('No model path provided, defaulting to use_mmap=true');
        return true; // Default to true if no model path provided
      }

      // For Android: use mmap=false for repackable quants, true otherwise
      const isRepackable = await isRepackableQuantization(modelPath);
      return !isRepackable;
    default:
      return true;
  }
}
