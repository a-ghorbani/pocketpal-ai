import DeviceInfo from 'react-native-device-info';

import {Model} from './types';
import {getModelMemoryRequirement} from './memoryEstimator';
import {modelStore} from '../store';

export type MemoryFitStatus = 'fits' | 'tight' | 'wont_fit';

/**
 * Determine if a model will fit in device memory
 *
 * @param model - The model to check
 * @param projectionModel - Optional mmproj model for vision models
 * @returns Status: 'fits', 'tight', or 'wont_fit'
 */
export async function getMemoryFitStatus(
  model: Model,
  projectionModel?: Model,
): Promise<MemoryFitStatus> {
  // Get memory requirement
  const requiredMemory = getModelMemoryRequirement(
    model,
    projectionModel,
    modelStore.contextInitParams,
  );

  // Get device total memory
  const totalMemory = await DeviceInfo.getTotalMemory();

  // Get learned available ceiling
  const availableCeiling = Math.max(
    modelStore.largestSuccessfulLoad ?? 0,
    modelStore.availableMemoryCeiling ?? 0,
  );

  // Determine status
  if (requiredMemory <= availableCeiling) {
    return 'fits';
  } else if (requiredMemory <= totalMemory) {
    return 'tight';
  } else {
    return 'wont_fit';
  }
}

/**
 * Get device memory information for display
 *
 * @returns Object with availableBytes, totalBytes for formatting
 */
export async function getDeviceMemoryInfo(): Promise<{
  availableBytes: number;
  totalBytes: number;
}> {
  const totalBytes = await DeviceInfo.getTotalMemory();

  // Get learned available ceiling
  const availableCeiling = Math.max(
    modelStore.largestSuccessfulLoad ?? 0,
    modelStore.availableMemoryCeiling ?? 0,
  );

  // If no calibration data, use fallback
  let availableBytes = availableCeiling;
  if (availableCeiling === 0) {
    availableBytes = Math.min(totalBytes * 0.6, totalBytes - 1.2 * 1e9);
  }

  return {
    availableBytes,
    totalBytes,
  };
}

// NOTE: Use formatBytes from src/utils/formatters.ts for display:
// formatBytes(bytes, 1) → "3.2 GB"
// formatBytes(bytes, 0) → "8 GB"
