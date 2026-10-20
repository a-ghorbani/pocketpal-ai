import {Platform} from 'react-native';

import DeviceInfo from 'react-native-device-info';

import NativeHardwareInfo from '../../specs/NativeHardwareInfo';

import type {DeviceMemory} from './whisperFits';

/** The memory figure this platform budgets against, or null if unreadable. */
export async function readDeviceMemory(): Promise<DeviceMemory | null> {
  try {
    return Platform.OS === 'ios'
      ? {
          os: 'ios',
          availableBytes: await NativeHardwareInfo.getAvailableMemory(),
        }
      : {os: 'android', totalBytes: await DeviceInfo.getTotalMemory()};
  } catch (err) {
    console.warn('[asr] memory read failed:', err);
    return null;
  }
}
