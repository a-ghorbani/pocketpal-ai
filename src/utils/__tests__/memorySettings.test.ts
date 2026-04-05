import {Platform} from 'react-native';
import {resolveUseMmap} from '../memorySettings';

// Mock Platform
jest.mock('react-native', () => ({
  Platform: {
    OS: 'android',
  },
}));

describe('memorySettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
  });
});
