import {Platform} from 'react-native';
import * as RNFS from '@dr.pogodin/react-native-fs';

export const excludeModelsFromBackup = async (): Promise<void> => {
  if (Platform.OS !== 'ios') {
    return;
  }
  try {
    await RNFS.mkdir(`${RNFS.DocumentDirectoryPath}/models`, {
      NSURLIsExcludedFromBackupKey: true,
    });
  } catch (error) {
    console.warn('[backup] Could not exclude models from backup:', error);
  }
};
