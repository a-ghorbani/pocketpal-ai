import * as RNFS from '@dr.pogodin/react-native-fs';

import {isSafePathSegment} from './pathGuard';

/**
 * Utility functions for downloading and managing pal thumbnail images
 */

const PAL_IMAGES_DIR = `${RNFS.DocumentDirectoryPath}/pal-images`;

/**
 * Check if a thumbnail URL is a local filename (not a remote URL)
 */
export const isLocalThumbnailPath = (thumbnailUrl: string): boolean => {
  return (
    !thumbnailUrl.startsWith('http://') && !thumbnailUrl.startsWith('https://')
  );
};

/**
 * Check if a thumbnail URL is a remote HTTP/HTTPS URL
 */
export const isRemoteThumbnailUrl = (thumbnailUrl: string): boolean => {
  return (
    thumbnailUrl.startsWith('http://') || thumbnailUrl.startsWith('https://')
  );
};

/**
 * Convert a thumbnail filename to a full file:// URI for React Native Image component
 * @param filename - Filename like "palId_thumbnail.jpg"
 * @returns Full file:// URI like "file:///path/to/documents/pal-images/palId_thumbnail.jpg",
 *   the remote URL unchanged, or undefined when the filename is not a plain file name
 */
export const getFullThumbnailUri = (filename: string): string | undefined => {
  if (isRemoteThumbnailUrl(filename)) {
    return filename;
  }
  const absolutePath = getAbsoluteThumbnailPath(filename);
  return absolutePath ? `file://${absolutePath}` : undefined;
};

/**
 * Get the absolute file system path from a thumbnail filename (for file operations)
 * @param filename - Filename like "palId_thumbnail.jpg"
 * @returns Absolute file system path, or null when the filename is not a plain file name
 */
export const getAbsoluteThumbnailPath = (filename: string): string | null =>
  isSafePathSegment(filename) ? `${PAL_IMAGES_DIR}/${filename}` : null;

/**
 * Ensure the pal images directory exists
 */
const ensurePalImagesDirectory = async (): Promise<void> => {
  try {
    const exists = await RNFS.exists(PAL_IMAGES_DIR);
    if (!exists) {
      await RNFS.mkdir(PAL_IMAGES_DIR);
      console.log('Created pal images directory:', PAL_IMAGES_DIR);
    }
  } catch (error) {
    console.error('Failed to create pal images directory:', error);
    throw error;
  }
};

/**
 * Extract file extension from URL, default to jpg if not found
 */
const getFileExtension = (url: string): string => {
  const urlParts = url.split('.');
  return urlParts.length > 1 ? urlParts.pop()?.split('?')[0] || 'jpg' : 'jpg';
};

/**
 * Generate thumbnail filename for a pal
 */
const generateThumbnailFilename = (
  palId: string,
  originalUrl: string,
): string => {
  const extension = getFileExtension(originalUrl);
  return `${palId}_thumbnail.${extension}`;
};

/**
 * Download a thumbnail image from a URL and save it locally
 * @param palId - The ID of the pal
 * @param imageUrl - The remote URL of the image
 * @returns Promise<string> - The filename of the downloaded image (for storage)
 */
export const downloadPalThumbnail = async (
  palId: string,
  imageUrl: string,
): Promise<string> => {
  try {
    const filename = generateThumbnailFilename(palId, imageUrl);
    const absolutePath = getAbsoluteThumbnailPath(filename);
    if (!absolutePath) {
      throw new Error(`Invalid thumbnail filename: ${filename}`);
    }

    await ensurePalImagesDirectory();

    // Check if file already exists
    const exists = await RNFS.exists(absolutePath);
    if (exists) {
      console.log('Thumbnail already exists locally:', absolutePath);
      return filename; // Return filename for storage
    }

    console.log('Downloading thumbnail:', imageUrl, 'to:', absolutePath);

    // Download the image
    const downloadResult = await RNFS.downloadFile({
      fromUrl: imageUrl,
      toFile: absolutePath,
      background: false,
      discretionary: false,
      progressInterval: 1000,
    }).promise;

    if (downloadResult.statusCode === 200) {
      console.log('Successfully downloaded thumbnail:', absolutePath);
      return filename; // Return filename for storage
    } else {
      throw new Error(
        `Download failed with status: ${downloadResult.statusCode}`,
      );
    }
  } catch (error) {
    console.error('Failed to download pal thumbnail:', error);
    throw error;
  }
};

/**
 * Delete a local thumbnail image
 * @param filename - The thumbnail filename like "palId_thumbnail.jpg"
 */
export const deletePalThumbnail = async (filename: string): Promise<void> => {
  try {
    const absolutePath = getAbsoluteThumbnailPath(filename);
    if (!absolutePath) {
      console.warn('Skipped deleting invalid thumbnail filename:', filename);
      return;
    }

    const exists = await RNFS.exists(absolutePath);
    if (exists) {
      await RNFS.unlink(absolutePath);
      console.log('Deleted local thumbnail:', absolutePath);
    }
  } catch (error) {
    console.error('Failed to delete local thumbnail:', error);
    // Don't throw error for cleanup operations
  }
};

/**
 * Check if a local thumbnail exists
 * @param filename - The thumbnail filename like "palId_thumbnail.jpg"
 * @returns Promise<boolean> - Whether the file exists
 */
export const localThumbnailExists = async (
  filename: string,
): Promise<boolean> => {
  try {
    const absolutePath = getAbsoluteThumbnailPath(filename);
    return absolutePath ? await RNFS.exists(absolutePath) : false;
  } catch (error) {
    console.error('Failed to check if local thumbnail exists:', error);
    return false;
  }
};

/**
 * Get the local thumbnail filename for a pal if it exists
 * @param palId - The ID of the pal
 * @param originalUrl - The original remote URL (used to determine file extension)
 * @returns Promise<string | null> - The filename if it exists, null otherwise
 */
export const getLocalThumbnailPath = async (
  palId: string,
  originalUrl: string,
): Promise<string | null> => {
  try {
    const filename = generateThumbnailFilename(palId, originalUrl);
    const exists = await localThumbnailExists(filename);
    return exists ? filename : null;
  } catch (error) {
    console.error('Failed to get local thumbnail path:', error);
    return null;
  }
};

/**
 * Clean up all orphaned thumbnail images (images without corresponding pals)
 * @param activePalIds - Array of currently active pal IDs
 */
export const cleanupOrphanedThumbnails = async (
  activePalIds: string[],
): Promise<void> => {
  try {
    const exists = await RNFS.exists(PAL_IMAGES_DIR);
    if (!exists) {
      return;
    }

    const files = await RNFS.readDir(PAL_IMAGES_DIR);
    const activeIdSet = new Set(activePalIds);

    for (const file of files) {
      if (file.isFile() && file.name.includes('_thumbnail.')) {
        // Extract pal ID from filename (format: palId_thumbnail.ext)
        const palId = file.name.split('_thumbnail.')[0];

        if (!activeIdSet.has(palId)) {
          console.log('Cleaning up orphaned thumbnail:', file.path);
          await RNFS.unlink(file.path);
        }
      }
    }
  } catch (error) {
    console.error('Failed to cleanup orphaned thumbnails:', error);
    // Don't throw error for cleanup operations
  }
};
