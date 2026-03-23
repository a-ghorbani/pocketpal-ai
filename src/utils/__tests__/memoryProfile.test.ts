import NativeHardwareInfo from '../../specs/NativeHardwareInfo';
import {
  exists,
  unlink,
  readFile,
  DocumentDirectoryPath,
} from '@dr.pogodin/react-native-fs';

import {
  takeMemorySnapshot,
  clearMemorySnapshots,
  readMemorySnapshots,
} from '../memoryProfile';

describe('memoryProfile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('takeMemorySnapshot', () => {
    it('calls NativeHardwareInfo.writeMemorySnapshot with the label', async () => {
      await takeMemorySnapshot('app_launch');

      expect(NativeHardwareInfo.writeMemorySnapshot).toHaveBeenCalledWith(
        'app_launch',
      );
      expect(NativeHardwareInfo.writeMemorySnapshot).toHaveBeenCalledTimes(1);
    });

    it('propagates errors from the native module', async () => {
      (
        NativeHardwareInfo.writeMemorySnapshot as jest.Mock
      ).mockRejectedValueOnce(new Error('Native write failed'));

      await expect(takeMemorySnapshot('fail_label')).rejects.toThrow(
        'Native write failed',
      );
    });

    it('passes different labels correctly', async () => {
      await takeMemorySnapshot('model_loaded');
      await takeMemorySnapshot('chat_active');

      expect(NativeHardwareInfo.writeMemorySnapshot).toHaveBeenNthCalledWith(
        1,
        'model_loaded',
      );
      expect(NativeHardwareInfo.writeMemorySnapshot).toHaveBeenNthCalledWith(
        2,
        'chat_active',
      );
    });
  });

  describe('clearMemorySnapshots', () => {
    it('deletes the snapshot file when it exists', async () => {
      (exists as jest.Mock).mockResolvedValueOnce(true);

      await clearMemorySnapshots();

      const expectedPath = `${DocumentDirectoryPath}/memory-snapshots.json`;
      expect(exists).toHaveBeenCalledWith(expectedPath);
      expect(unlink).toHaveBeenCalledWith(expectedPath);
    });

    it('does not call unlink when the snapshot file does not exist', async () => {
      (exists as jest.Mock).mockResolvedValueOnce(false);

      await clearMemorySnapshots();

      expect(exists).toHaveBeenCalled();
      expect(unlink).not.toHaveBeenCalled();
    });

    it('propagates errors from RNFS.exists', async () => {
      (exists as jest.Mock).mockRejectedValueOnce(
        new Error('FS check failed'),
      );

      await expect(clearMemorySnapshots()).rejects.toThrow('FS check failed');
    });

    it('propagates errors from RNFS.unlink', async () => {
      (exists as jest.Mock).mockResolvedValueOnce(true);
      (unlink as jest.Mock).mockRejectedValueOnce(
        new Error('FS unlink failed'),
      );

      await expect(clearMemorySnapshots()).rejects.toThrow('FS unlink failed');
    });
  });

  describe('readMemorySnapshots', () => {
    it('reads the snapshot file when it exists', async () => {
      (exists as jest.Mock).mockResolvedValueOnce(true);
      (readFile as jest.Mock).mockResolvedValueOnce('[{"label":"test"}]');

      const result = await readMemorySnapshots();

      const expectedPath = `${DocumentDirectoryPath}/memory-snapshots.json`;
      expect(exists).toHaveBeenCalledWith(expectedPath);
      expect(readFile).toHaveBeenCalledWith(expectedPath, 'utf8');
      expect(result).toBe('[{"label":"test"}]');
    });

    it('returns empty array JSON when file does not exist', async () => {
      (exists as jest.Mock).mockResolvedValueOnce(false);

      const result = await readMemorySnapshots();

      expect(result).toBe('[]');
      expect(readFile).not.toHaveBeenCalled();
    });
  });
});
