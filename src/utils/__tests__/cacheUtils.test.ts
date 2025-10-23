// Mock RNFS
const mockCachesDirectoryPath = '/mock/caches';
jest.mock('@dr.pogodin/react-native-fs', () => ({
  exists: jest.fn(),
  readDir: jest.fn(),
  unlink: jest.fn(),
  CachesDirectoryPath: '/mock/caches',
}));

import * as RNFS from '@dr.pogodin/react-native-fs';
import {
  getSessionCacheDirectory,
  sessionCacheDirectoryExists,
  getSessionCacheInfo,
  clearAllSessionCaches,
  clearSessionCacheForPal,
} from '../cacheUtils';

const mockRNFS = RNFS as jest.Mocked<typeof RNFS>;

describe('cacheUtils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getSessionCacheDirectory', () => {
    it('should return the correct cache directory path', () => {
      const result = getSessionCacheDirectory();
      expect(result).toBe(`${mockCachesDirectoryPath}/session-cache`);
    });
  });

  describe('sessionCacheDirectoryExists', () => {
    it('should return true when directory exists', async () => {
      mockRNFS.exists.mockResolvedValue(true);

      const result = await sessionCacheDirectoryExists();

      expect(result).toBe(true);
      expect(mockRNFS.exists).toHaveBeenCalledWith(
        `${mockCachesDirectoryPath}/session-cache`,
      );
    });

    it('should return false when directory does not exist', async () => {
      mockRNFS.exists.mockResolvedValue(false);

      const result = await sessionCacheDirectoryExists();

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      mockRNFS.exists.mockRejectedValue(new Error('File system error'));

      const result = await sessionCacheDirectoryExists();

      expect(result).toBe(false);
    });
  });

  describe('getSessionCacheInfo', () => {
    it('should return zero counts when directory does not exist', async () => {
      mockRNFS.exists.mockResolvedValue(false);

      const result = await getSessionCacheInfo();

      expect(result).toEqual({
        fileCount: 0,
        totalSizeBytes: 0,
      });
    });

    it('should calculate file count and total size correctly', async () => {
      mockRNFS.exists.mockResolvedValue(true);
      mockRNFS.readDir.mockResolvedValue([
        {name: 'pal1.session', isFile: () => true, size: 1024},
        {name: 'pal1_metadata.json', isFile: () => true, size: 256},
        {name: 'pal2.session', isFile: () => true, size: 2048},
        {name: 'pal2_metadata.json', isFile: () => true, size: 512},
      ] as any);

      const result = await getSessionCacheInfo();

      expect(result).toEqual({
        fileCount: 4,
        totalSizeBytes: 3840, // 1024 + 256 + 2048 + 512
      });
    });

    it('should handle errors gracefully', async () => {
      mockRNFS.exists.mockResolvedValue(true);
      mockRNFS.readDir.mockRejectedValue(new Error('Read error'));

      const result = await getSessionCacheInfo();

      expect(result).toEqual({
        fileCount: 0,
        totalSizeBytes: 0,
      });
    });
  });

  describe('clearAllSessionCaches', () => {
    it('should return 0 when directory does not exist', async () => {
      mockRNFS.exists.mockResolvedValue(false);

      const result = await clearAllSessionCaches();

      expect(result).toBe(0);
      expect(mockRNFS.unlink).not.toHaveBeenCalled();
    });

    it('should delete all cache files', async () => {
      mockRNFS.exists.mockResolvedValue(true);
      mockRNFS.readDir.mockResolvedValue([
        {
          name: 'pal1.session',
          path: '/mock/caches/session-cache/pal1.session',
          isFile: () => true,
        },
        {
          name: 'pal1_metadata.json',
          path: '/mock/caches/session-cache/pal1_metadata.json',
          isFile: () => true,
        },
        {
          name: 'pal2.session',
          path: '/mock/caches/session-cache/pal2.session',
          isFile: () => true,
        },
      ] as any);
      mockRNFS.unlink.mockResolvedValue(undefined);

      const result = await clearAllSessionCaches();

      expect(result).toBe(3);
      expect(mockRNFS.unlink).toHaveBeenCalledTimes(3);
      expect(mockRNFS.unlink).toHaveBeenCalledWith(
        '/mock/caches/session-cache/pal1.session',
      );
      expect(mockRNFS.unlink).toHaveBeenCalledWith(
        '/mock/caches/session-cache/pal1_metadata.json',
      );
      expect(mockRNFS.unlink).toHaveBeenCalledWith(
        '/mock/caches/session-cache/pal2.session',
      );
    });

    it('should continue deleting even if some files fail', async () => {
      mockRNFS.exists.mockResolvedValue(true);
      mockRNFS.readDir.mockResolvedValue([
        {
          name: 'pal1.session',
          path: '/mock/caches/session-cache/pal1.session',
          isFile: () => true,
        },
        {
          name: 'pal2.session',
          path: '/mock/caches/session-cache/pal2.session',
          isFile: () => true,
        },
      ] as any);
      mockRNFS.unlink
        .mockRejectedValueOnce(new Error('Delete failed'))
        .mockResolvedValueOnce(undefined);

      const result = await clearAllSessionCaches();

      expect(result).toBe(1); // Only one successful deletion
      expect(mockRNFS.unlink).toHaveBeenCalledTimes(2);
    });
  });

  describe('clearSessionCacheForPal', () => {
    it('should delete both session and metadata files when they exist', async () => {
      mockRNFS.exists.mockResolvedValue(true);
      mockRNFS.unlink.mockResolvedValue(undefined);

      const result = await clearSessionCacheForPal('test-pal-id');

      expect(result).toBe(true);
      expect(mockRNFS.exists).toHaveBeenCalledTimes(2);
      expect(mockRNFS.exists).toHaveBeenCalledWith(
        '/mock/caches/session-cache/test-pal-id.session',
      );
      expect(mockRNFS.exists).toHaveBeenCalledWith(
        '/mock/caches/session-cache/test-pal-id_metadata.json',
      );
      expect(mockRNFS.unlink).toHaveBeenCalledTimes(2);
    });

    it('should return false when no files exist', async () => {
      mockRNFS.exists.mockResolvedValue(false);

      const result = await clearSessionCacheForPal('test-pal-id');

      expect(result).toBe(false);
      expect(mockRNFS.unlink).not.toHaveBeenCalled();
    });

    it('should delete only existing files', async () => {
      mockRNFS.exists
        .mockResolvedValueOnce(true) // session file exists
        .mockResolvedValueOnce(false); // metadata file does not exist
      mockRNFS.unlink.mockResolvedValue(undefined);

      const result = await clearSessionCacheForPal('test-pal-id');

      expect(result).toBe(true);
      expect(mockRNFS.unlink).toHaveBeenCalledTimes(1);
      expect(mockRNFS.unlink).toHaveBeenCalledWith(
        '/mock/caches/session-cache/test-pal-id.session',
      );
    });

    it('should throw error on deletion failure', async () => {
      mockRNFS.exists.mockResolvedValue(true);
      mockRNFS.unlink.mockRejectedValue(new Error('Delete failed'));

      await expect(clearSessionCacheForPal('test-pal-id')).rejects.toThrow(
        'Delete failed',
      );
    });
  });
});
