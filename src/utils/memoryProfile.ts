import {Platform} from 'react-native';

import NativeHardwareInfo from '../specs/NativeHardwareInfo';

/**
 * Trigger a memory snapshot. The native module collects metrics and
 * appends to Documents/memory-snapshots.json (iOS) or
 * externalFilesDir/memory-snapshots.json (Android).
 */
export async function takeMemorySnapshot(label: string): Promise<void> {
  await NativeHardwareInfo.writeMemorySnapshot(label);
}

/**
 * Clear accumulated snapshots (call at start of profiling session).
 */
export async function clearMemorySnapshots(): Promise<void> {
  const RNFS = require('@dr.pogodin/react-native-fs');
  const baseDir =
    Platform.OS === 'android'
      ? RNFS.ExternalDirectoryPath
      : RNFS.DocumentDirectoryPath;
  const filePath = `${baseDir}/memory-snapshots.json`;
  if (await RNFS.exists(filePath)) {
    await RNFS.unlink(filePath);
  }
}

/**
 * Read accumulated snapshots as JSON string.
 * Used by MemorySnapshotTrigger to expose data to E2E via the read:: command.
 */
export async function readMemorySnapshots(): Promise<string> {
  const RNFS = require('@dr.pogodin/react-native-fs');
  const baseDir =
    Platform.OS === 'android'
      ? RNFS.ExternalDirectoryPath
      : RNFS.DocumentDirectoryPath;
  const filePath = `${baseDir}/memory-snapshots.json`;
  if (await RNFS.exists(filePath)) {
    return await RNFS.readFile(filePath, 'utf8');
  }
  return '[]';
}
