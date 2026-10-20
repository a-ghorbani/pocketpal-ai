import {Platform} from 'react-native';

import DeviceInfo from 'react-native-device-info';

import type {DeviceMemory} from './whisperFits';

/** The chat model's load history, which sets the iOS ceiling. */
export interface ChatLoadHistory {
  largestSuccessfulLoad?: number;
  availableMemoryCeiling?: number;
}

/** The memory figure this platform budgets against, or null if unreadable. */
export async function readDeviceMemory(
  chat: ChatLoadHistory,
): Promise<DeviceMemory | null> {
  if (Platform.OS === 'ios') {
    return {
      os: 'ios',
      ceilingBytes: Math.max(
        chat.largestSuccessfulLoad ?? 0,
        chat.availableMemoryCeiling ?? 0,
      ),
    };
  }
  try {
    return {os: 'android', totalBytes: await DeviceInfo.getTotalMemory()};
  } catch (err) {
    console.warn('[asr] memory read failed:', err);
    return null;
  }
}
