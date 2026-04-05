import {Platform} from 'react-native';

/**
 * Resolves the effective use_mmap value based on the setting and model characteristics
 *
 * @param setting - The user's mmap setting ('true', 'false', or 'smart')
 * @param modelPath - Path to the model file (used for smart detection)
 * @returns Promise<boolean> - The resolved use_mmap value
 */
export async function resolveUseMmap(
  setting: 'true' | 'false' | 'smart',
  _modelPath: string,
): Promise<boolean> {
  switch (setting) {
    case 'true':
      return true;
    case 'false':
      return false;
    case 'smart':
      // Legacy: 'smart' is now treated as 'false' on Android (mmap OFF + repack ON is optimal)
      // On other platforms, default to true
      return Platform.OS !== 'android';
    default:
      return true;
  }
}
