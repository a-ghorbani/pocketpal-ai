import React, {useEffect, useState} from 'react';
import DeviceInfo from 'react-native-device-info';
import {L10nContext, formatBytes} from '../utils';
import {Model} from '../utils/types';
import {isHighEndDevice} from '../utils/deviceCapabilities';
import {getModelMemoryRequirement} from '../utils/memoryEstimator';
// Note: This creates a circular dependency with ModelStore (which imports hasEnoughMemory).
// This is intentional and runtime-safe because:
// 1. modelStore is instantiated after class definition
// 2. hasEnoughMemory is only called at runtime, not during module initialization
import {modelStore} from '../store';
import {MemoryFitStatus} from '../utils/memoryDisplay';

/**
 * Check if there's enough memory to load a model.
 *
 * Uses calibrated ceiling from ModelStore (max of largestSuccessfulLoad, availableMemoryCeiling).
 *
 * @param model - The model to check
 * @param projectionModel - Optional mmproj model for multimodal
 * @returns true if device has enough memory
 */
export const hasEnoughMemory = async (
  model: Model,
  projectionModel?: Model,
): Promise<boolean> => {
  // Try to fetch GGUF metadata if not available but model is downloaded
  // After fetching, get the updated model from store (if it exists there)
  let modelForCalc = model;
  if (!model.ggufMetadata && model.isDownloaded) {
    try {
      await modelStore.fetchAndPersistGGUFMetadata(model);
      // Get updated model from store (metadata is persisted there)
      const updatedModel = modelStore.models.find(m => m.id === model.id);
      if (updatedModel) {
        modelForCalc = updatedModel;
      }
    } catch {
      // Continue with fallback estimation
    }
  }

  // Get calibration data from ModelStore
  const {largestSuccessfulLoad, availableMemoryCeiling} = modelStore;

  // Calculate ceiling from calibration data
  let ceiling: number;
  if (
    largestSuccessfulLoad !== undefined ||
    availableMemoryCeiling !== undefined
  ) {
    // Use the maximum of both calibration signals
    ceiling = Math.max(largestSuccessfulLoad ?? 0, availableMemoryCeiling ?? 0);
  } else {
    // Cold start: no calibration data yet, use conservative fallback
    const totalMemory = await DeviceInfo.getTotalMemory();
    // Use heuristic: min(60% of RAM, RAM - 1.2GB)
    ceiling = Math.max(
      Math.min(totalMemory * 0.6, totalMemory - 1.2 * 1e9),
      0, // Ensure non-negative
    );
  }

  const memoryRequirement = getModelMemoryRequirement(
    modelForCalc,
    projectionModel,
    modelStore.contextInitParams,
  );

  return memoryRequirement <= ceiling;
};

/**
 * Get memory fit status with details
 */
async function getMemoryFitDetails(
  model: Model,
  projectionModel?: Model,
): Promise<{
  status: MemoryFitStatus;
  requiredBytes: number;
  availableBytes: number;
}> {
  // Get memory requirement
  const requiredBytes = getModelMemoryRequirement(
    model,
    projectionModel,
    modelStore.contextInitParams,
  );

  // Get device total memory
  const totalMemory = await DeviceInfo.getTotalMemory();

  // Get learned available ceiling (already includes fallback from ModelStore.initializeStore)
  const availableBytes = Math.max(
    modelStore.largestSuccessfulLoad ?? 0,
    modelStore.availableMemoryCeiling ?? 0,
  );

  // Determine status
  let status: MemoryFitStatus;
  if (requiredBytes <= availableBytes) {
    status = 'fits';
  } else if (requiredBytes <= totalMemory) {
    status = 'tight';
  } else {
    status = 'wont_fit';
  }

  return {status, requiredBytes, availableBytes};
}

/**
 * Hook for checking memory availability for a model.
 *
 * @param model - The model to check (or a partial model with at least size)
 * @param projectionModel - Optional mmproj model for multimodal
 */
export const useMemoryCheck = (
  model: Model | {size: number; supportsMultimodal?: boolean},
  projectionModel?: Model,
) => {
  const l10n = React.useContext(L10nContext);
  const [memoryWarning, setMemoryWarning] = useState('');
  const [shortMemoryWarning, setShortMemoryWarning] = useState('');
  const [multimodalWarning, setMultimodalWarning] = useState('');
  const [fitStatus, setFitStatus] = useState<MemoryFitStatus>('fits');

  // Read MobX observables during render so changes trigger re-render in observer components
  // This also creates a stable dependency for useEffect
  const calibrationCeiling = Math.max(
    modelStore.largestSuccessfulLoad ?? 0,
    modelStore.availableMemoryCeiling ?? 0,
  );

  useEffect(() => {
    const checkMemory = async () => {
      // Reset warnings first
      setMemoryWarning('');
      setShortMemoryWarning('');
      setMultimodalWarning('');
      setFitStatus('fits');

      try {
        const {status, requiredBytes, availableBytes} =
          await getMemoryFitDetails(model as Model, projectionModel);

        setFitStatus(status);

        if (status === 'tight') {
          // Concise badge text
          setShortMemoryWarning(l10n.memory.memoryTight);
          // Detailed message with numbers
          const neededText = formatBytes(requiredBytes, 1);
          const availableText = formatBytes(availableBytes, 1);
          setMemoryWarning(
            l10n.memory.memoryDetailMessage
              .replace('{needed}', neededText)
              .replace('{available}', availableText),
          );
        } else if (status === 'wont_fit') {
          // Concise badge text
          setShortMemoryWarning(l10n.memory.lowMemory);
          // Detailed message with numbers
          const neededText = formatBytes(requiredBytes, 1);
          const availableText = formatBytes(availableBytes, 1);
          setMemoryWarning(
            l10n.memory.memoryDetailMessage
              .replace('{needed}', neededText)
              .replace('{available}', availableText),
          );
        }

        // Additional check for multimodal capability
        const isMultimodal =
          'supportsMultimodal' in model && model.supportsMultimodal;
        if (isMultimodal) {
          const isCapable = await isHighEndDevice();
          if (!isCapable) {
            setMultimodalWarning(l10n.memory.multimodalWarning);
          }
        }
      } catch (error) {
        // Clear all warnings when there's an error
        setMemoryWarning('');
        setShortMemoryWarning('');
        setMultimodalWarning('');
        setFitStatus('fits');
        console.error('Memory check failed:', error);
      }
    };

    checkMemory();
  }, [model, projectionModel, l10n, calibrationCeiling]);

  return {memoryWarning, shortMemoryWarning, multimodalWarning, fitStatus};
};
