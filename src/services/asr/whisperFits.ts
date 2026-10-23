import {ASR_ANDROID_RAM_SHARE, ASR_IOS_CEILING_SHARE} from './constants';

/**
 * The memory figure each platform budgets against. Android's free-memory
 * figure can be far off (#982), so Android budgets against total RAM. iOS
 * doesn't count mmap'd chat weights against the app, so iOS budgets against
 * a share of what it reported free before any chat model loaded (0 when not
 * yet known).
 */
export type DeviceMemory =
  | {os: 'ios'; ceilingBytes: number}
  | {os: 'android'; totalBytes: number};

/** What Android lets the chat model and the speech models use together. */
export const androidMemoryBudget = (totalBytes: number): number =>
  totalBytes * ASR_ANDROID_RAM_SHARE;

/** The bytes the chat model and the speech models may use together. */
export const memoryBudget = (memory: DeviceMemory): number =>
  memory.os === 'ios'
    ? memory.ceilingBytes * ASR_IOS_CEILING_SHARE
    : androidMemoryBudget(memory.totalBytes);

/** Whether whisper fits next to the loaded chat model; an unknown iOS ceiling fits. */
export const whisperFits = (
  memory: DeviceMemory,
  chatBytes: number,
  whisperBytes: number,
): boolean =>
  (memory.os === 'ios' && memory.ceilingBytes === 0) ||
  chatBytes + whisperBytes <= memoryBudget(memory);
