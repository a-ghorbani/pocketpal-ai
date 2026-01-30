import React, {useEffect, useState} from 'react';
import DeviceInfo from 'react-native-device-info';
import {L10nContext} from '../utils';
import {Model} from '../utils/types';
import {isHighEndDevice} from '../utils/deviceCapabilities';
import {getModelMemoryRequirement} from '../utils/memoryEstimator';
import {modelStore} from '../store';

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
    } catch (error) {
      if (__DEV__) {
        console.log('[MemoryCheck] Could not fetch GGUF metadata:', error);
      }
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
    ceiling = totalMemory * 0.5; // Conservative 50% of total RAM
    if (__DEV__) {
      console.log(
        '[MemoryCheck] Cold start: using 50% of total RAM as ceiling:',
        (ceiling / 1e9).toFixed(2),
        'GB',
      );
    }
  }

  const memoryRequirement = getModelMemoryRequirement(
    modelForCalc,
    projectionModel,
    modelStore.contextInitParams,
  );

  if (__DEV__) {
    console.log('[MemoryCheck] Ceiling:', (ceiling / 1e9).toFixed(2), 'GB');
    console.log(
      '[MemoryCheck] Model requirement:',
      (memoryRequirement / 1e9).toFixed(2),
      'GB',
    );
    console.log(
      '[MemoryCheck] Result:',
      memoryRequirement <= ceiling ? 'PASS' : 'FAIL',
    );
  }

  return memoryRequirement <= ceiling;
};

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

  useEffect(() => {
    const checkMemory = async () => {
      // Reset warnings first
      setMemoryWarning('');
      setShortMemoryWarning('');
      setMultimodalWarning('');

      try {
        const hasMemory = await hasEnoughMemory(
          model as Model,
          projectionModel,
        );

        if (!hasMemory) {
          setShortMemoryWarning(l10n.memory.shortWarning);
          setMemoryWarning(l10n.memory.warning);
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
        console.error('Memory check failed:', error);
      }
    };

    checkMemory();
  }, [
    model,
    projectionModel,
    l10n,
    modelStore.availableMemoryCeiling,
    modelStore.largestSuccessfulLoad,
  ]);

  return {memoryWarning, shortMemoryWarning, multimodalWarning};
};
