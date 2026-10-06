import {Platform} from 'react-native';
import * as RNFS from '@dr.pogodin/react-native-fs';
import NativeHardwareInfo from '../../specs/NativeHardwareInfo';
import {
  isRepackableQuantization,
  resolveUseMmap,
  enforceMmapForLargeFile,
} from '../memorySettings';
import {loadLlamaModelInfo} from 'llama.rn';

// Mock Platform
jest.mock('react-native', () => ({
  Platform: {
    OS: 'android',
  },
}));

const mockLoadLlamaModelInfo = loadLlamaModelInfo as jest.MockedFunction<
  typeof loadLlamaModelInfo
>;

describe('memorySettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isRepackableQuantization', () => {
    it('should return true for Q4_0 quantization', async () => {
      mockLoadLlamaModelInfo.mockResolvedValue({
        'general.file_type': 'Q4_0',
      });

      const result = await isRepackableQuantization('/path/to/model.gguf');
      expect(result).toBe(true);
    });

    it('should return true for IQ4_NL quantization', async () => {
      mockLoadLlamaModelInfo.mockResolvedValue({
        'general.file_type': 'IQ4_NL',
      });

      const result = await isRepackableQuantization('/path/to/model.gguf');
      expect(result).toBe(true);
    });

    it('should return false for non-repackable quantization', async () => {
      mockLoadLlamaModelInfo.mockResolvedValue({
        'general.file_type': 'Q8_0',
      });

      const result = await isRepackableQuantization('/path/to/model.gguf');
      expect(result).toBe(false);
    });

    it('should return false when general.file_type is missing', async () => {
      mockLoadLlamaModelInfo.mockResolvedValue({
        'other.field': 'value',
      });

      const result = await isRepackableQuantization('/path/to/model.gguf');
      expect(result).toBe(false);
    });

    it('should return false when loadLlamaModelInfo throws error', async () => {
      mockLoadLlamaModelInfo.mockRejectedValue(
        new Error('Failed to load model info'),
      );

      const result = await isRepackableQuantization('/path/to/model.gguf');
      expect(result).toBe(false);
    });

    it('should handle case-insensitive matching', async () => {
      mockLoadLlamaModelInfo.mockResolvedValue({
        'general.file_type': 'q4_0',
      });

      const result = await isRepackableQuantization('/path/to/model.gguf');
      expect(result).toBe(true);
    });
  });

  describe('resolveUseMmap', () => {
    it('should return true for "true" setting', async () => {
      const result = await resolveUseMmap('true', '/path/to/model.gguf');
      expect(result).toBe(true);
    });

    it('should return false for "false" setting', async () => {
      const result = await resolveUseMmap('false', '/path/to/model.gguf');
      expect(result).toBe(false);
    });

    it('should return true for "smart" setting on non-Android platforms', async () => {
      (Platform as any).OS = 'ios';
      const result = await resolveUseMmap('smart', '/path/to/model.gguf');
      expect(result).toBe(true);
    });

    it('should return true for "smart" with a big file on Android (OOM safety)', async () => {
      (Platform as any).OS = 'android';
      (RNFS.stat as jest.Mock).mockResolvedValueOnce({size: 2 * 10 ** 9});
      const result = await resolveUseMmap('smart', '/path/to/big.gguf');
      expect(result).toBe(true);
    });

    it('should return false for "smart" with a small file on Android (repack path)', async () => {
      (Platform as any).OS = 'android';
      (RNFS.stat as jest.Mock).mockResolvedValueOnce({size: 100 * 10 ** 6});
      const result = await resolveUseMmap('smart', '/path/to/small.gguf');
      expect(result).toBe(false);
    });

    it('should return false for "smart" on Android when stat fails', async () => {
      (Platform as any).OS = 'android';
      (RNFS.stat as jest.Mock).mockRejectedValueOnce(new Error('no file'));
      const result = await resolveUseMmap('smart', '/missing.gguf');
      expect(result).toBe(false);
    });
  });

  describe('enforceMmapForLargeFile', () => {
    it('keeps true untouched', async () => {
      expect(await enforceMmapForLargeFile(true, 'true', '/big.gguf')).toBe(
        true,
      );
    });

    it('respects explicit false for small files', async () => {
      (RNFS.stat as jest.Mock).mockResolvedValueOnce({size: 100 * 10 ** 6});
      expect(await enforceMmapForLargeFile(false, 'false', '/small.gguf')).toBe(
        false,
      );
    });

    it('forces mmap when a big file does not fit live memory', async () => {
      // 5GB file × 1.2 = 6GB > 3GB live (global mock) → force on
      (RNFS.stat as jest.Mock).mockResolvedValueOnce({size: 5 * 10 ** 9});
      expect(await enforceMmapForLargeFile(false, 'false', '/big.gguf')).toBe(
        true,
      );
    });

    it('keeps explicit false when a big file fits live memory', async () => {
      // 2GB file × 1.2 = 2.4GB <= 3GB live (global mock) → respect choice
      (RNFS.stat as jest.Mock).mockResolvedValueOnce({size: 2 * 10 ** 9});
      expect(await enforceMmapForLargeFile(false, 'false', '/big.gguf')).toBe(
        false,
      );
    });

    it('forces mmap when live memory cannot be read', async () => {
      (RNFS.stat as jest.Mock).mockResolvedValueOnce({size: 5 * 10 ** 9});
      (
        NativeHardwareInfo.getAvailableMemory as jest.Mock
      ).mockRejectedValueOnce(new Error('native unavailable'));
      expect(await enforceMmapForLargeFile(false, 'false', '/big.gguf')).toBe(
        true,
      );
    });
  });
});
