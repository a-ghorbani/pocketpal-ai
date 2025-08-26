import {Platform} from 'react-native';
import {isRepackableQuantization, resolveUseMmap} from '../memorySettings';
import {loadLlamaModelInfo} from '@pocketpalai/llama.rn';

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

    it('should return true for "smart" setting without model path', async () => {
      (Platform as any).OS = 'android';
      const result = await resolveUseMmap('smart', '');
      expect(result).toBe(true);
    });

    it('should return false for "smart" setting with repackable quantization on Android', async () => {
      (Platform as any).OS = 'android';
      mockLoadLlamaModelInfo.mockResolvedValue({
        'general.file_type': 'Q4_0',
      });

      const result = await resolveUseMmap('smart', '/path/to/model.gguf');
      expect(result).toBe(false);
    });

    it('should return true for "smart" setting with non-repackable quantization on Android', async () => {
      (Platform as any).OS = 'android';
      mockLoadLlamaModelInfo.mockResolvedValue({
        'general.file_type': 'Q8_0',
      });

      const result = await resolveUseMmap('smart', '/path/to/model.gguf');
      expect(result).toBe(true);
    });
  });
});
