import {Platform} from 'react-native';

import DeviceInfo from 'react-native-device-info';

import type {DeviceMemory} from './whisperFits';

/** What iOS reported free before any chat model loaded (0 or unset: unknown). */
export interface ChatLoadHistory {
  availableMemoryCeiling?: number;
}

/** The memory figure this platform budgets against, or null if unreadable. */
export async function readDeviceMemory(
  chat: ChatLoadHistory,
): Promise<DeviceMemory | null> {
  if (Platform.OS === 'ios') {
    return {
      os: 'ios',
      ceilingBytes: chat.availableMemoryCeiling ?? 0,
    };
  }
  try {
    return {os: 'android', totalBytes: await DeviceInfo.getTotalMemory()};
  } catch (err) {
    console.warn('[asr] memory read failed:', err);
    return null;
  }
}
