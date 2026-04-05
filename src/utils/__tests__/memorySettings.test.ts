import {Platform} from 'react-native';
import {isRepackableQuantization, resolveUseMmap} from '../memorySettings';
import {loadLlamaModelInfo} from 'llama.rn';
import * as RNFS from '@dr.pogodin/react-native-fs';

// Mock Platform
jest.mock('react-native', () => ({
  Platform: {
    OS: 'android',
  },
}));

const mockLoadLlamaModelInfo = loadLlamaModelInfo as jest.MockedFunction<
  typeof loadLlamaModelInfo
>;
const mockRNFSRead = RNFS.read as jest.MockedFunction<typeof RNFS.read>;

// Valid GGUF magic bytes as base64
const VALID_GGUF_HEADER = btoa(String.fromCharCode(0x47, 0x47, 0x55, 0x46));

describe('memorySettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: GGUF header validation passes
    mockRNFSRead.mockResolvedValue(VALID_GGUF_HEADER);
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

    it('should return false when GGUF header is invalid (unsupported file)', async () => {
      mockRNFSRead.mockResolvedValue(btoa('\x00\x00\x00\x00'));

      const result = await isRepackableQuantization('/path/to/bad.gguf');
      expect(result).toBe(false);
      expect(mockLoadLlamaModelInfo).not.toHaveBeenCalled();
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

    it('should return false for legacy "smart" setting on Android (treated as mmap OFF)', async () => {
      (Platform as any).OS = 'android';
      const result = await resolveUseMmap('smart', '');
      expect(result).toBe(false);
    });

    it('should return false for legacy "smart" setting with any quantization on Android', async () => {
      (Platform as any).OS = 'android';
      mockLoadLlamaModelInfo.mockResolvedValue({
        'general.file_type': 'Q8_0',
      });

      const result = await resolveUseMmap('smart', '/path/to/model.gguf');
      expect(result).toBe(false);
    });
  });
});
