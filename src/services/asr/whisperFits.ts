import {
  ASR_ANDROID_RAM_SHARE,
  ASR_IOS_MEMORY_HEADROOM_FACTOR,
} from './constants';

/**
 * The memory figure each platform budgets against. Android's free-memory
 * figure can be far off (#982), so Android budgets against total RAM; iOS
 * reports the app's own remaining limit, which is reliable.
 */
export type DeviceMemory =
  | {os: 'ios'; availableBytes: number}
  | {os: 'android'; totalBytes: number};

/** Whether whisper fits next to the loaded chat model. */
export const whisperFits = (
  memory: DeviceMemory,
  chatBytes: number,
  whisperBytes: number,
): boolean =>
  memory.os === 'ios'
    ? memory.availableBytes >= whisperBytes * ASR_IOS_MEMORY_HEADROOM_FACTOR
    : chatBytes + whisperBytes <= memory.totalBytes * ASR_ANDROID_RAM_SHARE;
