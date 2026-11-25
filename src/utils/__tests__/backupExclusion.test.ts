import {Platform} from 'react-native';
import * as RNFS from '@dr.pogodin/react-native-fs';

import {excludeModelsFromBackup} from '../backupExclusion';

describe('excludeModelsFromBackup', () => {
  const originalOS = Platform.OS;
  const modelsDir = `${RNFS.DocumentDirectoryPath}/models`;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    Platform.OS = originalOS;
    warn.mockRestore();
  });

  it('flags only the models folder on iOS', async () => {
    Platform.OS = 'ios';

    await excludeModelsFromBackup();

    expect(RNFS.mkdir).toHaveBeenCalledTimes(1);
    expect(RNFS.mkdir).toHaveBeenCalledWith(modelsDir, {
      NSURLIsExcludedFromBackupKey: true,
    });
  });

  it('logs a failed flag write instead of rejecting', async () => {
    Platform.OS = 'ios';
    const error = new Error('setResourceValue failed');
    (RNFS.mkdir as jest.Mock).mockRejectedValueOnce(error);

    await expect(excludeModelsFromBackup()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.any(String), error);
  });

  it('does nothing on Android', async () => {
    Platform.OS = 'android';

    await excludeModelsFromBackup();

    expect(RNFS.mkdir).not.toHaveBeenCalled();
  });
});
