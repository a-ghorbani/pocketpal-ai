import * as RNFS from '@dr.pogodin/react-native-fs';
import {Platform} from 'react-native';

/**
 * Utility functions for managing KV cache files used for inference optimization
 *
 */

/**
 * Get the session cache directory path
 * This matches the Swift implementation in LlamaInferenceEngine.swift
 *
 * @returns The absolute path to the session cache directory
 */
export const getSessionCacheDirectory = (): string => {
  // On iOS, use CachesDirectory (matches Swift implementation)
  // On Android, use CacheDirectory (for future implementation)
  if (Platform.OS === 'ios') {
    return `${RNFS.CachesDirectoryPath}/session-cache`;
  } else {
    // Android implementation (future)
    return `${RNFS.CachesDirectoryPath}/session-cache`;
  }
};

/**
 * Check if the session cache directory exists
 *
 * @returns Promise that resolves to true if directory exists
 */
export const sessionCacheDirectoryExists = async (): Promise<boolean> => {
  try {
    const cacheDir = getSessionCacheDirectory();
    return await RNFS.exists(cacheDir);
  } catch (error) {
    console.error('Error checking session cache directory:', error);
    return false;
  }
};

/**
 * Get information about cached sessions
 *
 * @returns Promise that resolves to cache info (file count and total size in bytes)
 */
export const getSessionCacheInfo = async (): Promise<{
  fileCount: number;
  totalSizeBytes: number;
}> => {
  try {
    const cacheDir = getSessionCacheDirectory();
    const exists = await RNFS.exists(cacheDir);

    if (!exists) {
      return {fileCount: 0, totalSizeBytes: 0};
    }

    const files = await RNFS.readDir(cacheDir);
    let totalSize = 0;

    for (const file of files) {
      if (file.isFile()) {
        totalSize += file.size;
      }
    }

    return {
      fileCount: files.length,
      totalSizeBytes: totalSize,
    };
  } catch (error) {
    console.error('Error getting session cache info:', error);
    return {fileCount: 0, totalSizeBytes: 0};
  }
};

/**
 * Clear all session cache files
 * This removes all .session and _metadata.json files from the cache directory
 *
 * @returns Promise that resolves to the number of files deleted
 */
export const clearAllSessionCaches = async (): Promise<number> => {
  try {
    const cacheDir = getSessionCacheDirectory();
    const exists = await RNFS.exists(cacheDir);

    if (!exists) {
      console.log(
        '[CacheUtils] Session cache directory does not exist, nothing to clear',
      );
      return 0;
    }

    const files = await RNFS.readDir(cacheDir);
    let deletedCount = 0;

    for (const file of files) {
      if (file.isFile()) {
        try {
          await RNFS.unlink(file.path);
          deletedCount++;
          console.log('[CacheUtils] Deleted cache file:', file.name);
        } catch (error) {
          console.error(
            '[CacheUtils] Failed to delete cache file:',
            file.name,
            error,
          );
        }
      }
    }

    console.log(`[CacheUtils] Cleared ${deletedCount} session cache files`);
    return deletedCount;
  } catch (error) {
    console.error('[CacheUtils] Error clearing session caches:', error);
    throw error;
  }
};

/**
 * Clear session cache for a specific pal
 * This removes both the .session file and _metadata.json file for the given pal ID
 *
 * @param palId - The ID of the pal whose cache should be cleared
 * @returns Promise that resolves to true if files were deleted, false if they didn't exist
 */
export const clearSessionCacheForPal = async (
  palId: string,
): Promise<boolean> => {
  try {
    const cacheDir = getSessionCacheDirectory();
    const sessionFile = `${cacheDir}/${palId}.session`;
    const metadataFile = `${cacheDir}/${palId}_metadata.json`;

    let deletedAny = false;

    // Try to delete session file
    const sessionExists = await RNFS.exists(sessionFile);
    if (sessionExists) {
      await RNFS.unlink(sessionFile);
      console.log('[CacheUtils] Deleted session file for pal:', palId);
      deletedAny = true;
    }

    // Try to delete metadata file
    const metadataExists = await RNFS.exists(metadataFile);
    if (metadataExists) {
      await RNFS.unlink(metadataFile);
      console.log('[CacheUtils] Deleted metadata file for pal:', palId);
      deletedAny = true;
    }

    return deletedAny;
  } catch (error) {
    console.error(
      '[CacheUtils] Error clearing session cache for pal:',
      palId,
      error,
    );
    throw error;
  }
};
