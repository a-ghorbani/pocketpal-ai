import React, {useEffect, useState} from 'react';
import DeviceInfo from 'react-native-device-info';
import {L10nContext} from '../utils';
import {isHighEndDevice} from '../utils/deviceCapabilities';
import {modelStore} from '../store';

/**
 * Check if there's enough memory to load a model
 * Uses calibrated ceiling from ModelStore (largestSuccessfulLoad + availableMemoryCeiling)
 * with 10% safety margin
 */
export const hasEnoughMemory = async (
  modelSize: number,
  isMultimodal = false,
): Promise<boolean> => {
  // Get calibration data from ModelStore
  const {largestSuccessfulLoad, availableMemoryCeiling} = modelStore;

  // Calculate ceiling from calibration data
  let ceiling: number;
  if (
    largestSuccessfulLoad !== undefined &&
    availableMemoryCeiling !== undefined
  ) {
    // Use the maximum of both calibration signals
    ceiling = Math.max(largestSuccessfulLoad, availableMemoryCeiling);
  } else if (largestSuccessfulLoad !== undefined) {
    ceiling = largestSuccessfulLoad;
  } else if (availableMemoryCeiling !== undefined) {
    ceiling = availableMemoryCeiling;
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

  // Apply 10% safety margin
  const safeCeiling = ceiling * 0.9;

  // Simple model requirement estimation
  // This is a fallback when GGUF metadata is not available
  // For more accurate estimation, use getModelMemoryRequirement() with GGUF metadata
  const baseRequirement = 0.43 + (0.92 * modelSize) / 1e9;
  const mmProjOverhead = isMultimodal ? 1.8 : 0; // Rough estimate
  const memoryRequirement = (baseRequirement + mmProjOverhead) * 1e9;

  if (__DEV__) {
    console.log('[MemoryCheck] Ceiling:', (ceiling / 1e9).toFixed(2), 'GB');
    console.log(
      '[MemoryCheck] Safe ceiling (90%):',
      (safeCeiling / 1e9).toFixed(2),
      'GB',
    );
    console.log(
      '[MemoryCheck] Model requirement:',
      (memoryRequirement / 1e9).toFixed(2),
      'GB',
    );
  }

  return memoryRequirement <= safeCeiling;
};

export const useMemoryCheck = (modelSize: number, isMultimodal = false) => {
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
        const hasMemory = await hasEnoughMemory(modelSize, isMultimodal);

        if (!hasMemory) {
          setShortMemoryWarning(l10n.memory.shortWarning);
          setMemoryWarning(l10n.memory.warning);
        }

        // Additional check for multimodal capability
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
  }, [modelSize, isMultimodal, l10n]);

  return {memoryWarning, shortMemoryWarning, multimodalWarning};
};
