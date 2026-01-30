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
