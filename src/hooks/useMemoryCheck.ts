import React, {useEffect, useState} from 'react';
import DeviceInfo from 'react-native-device-info';
import {L10nContext, formatBytes} from '../utils';
import {t} from '../locales';
import {Model, ContextInitParams} from '../utils/types';
import {isHighEndDevice} from '../utils/deviceCapabilities';
import {getModelMemoryRequirement} from '../utils/memoryEstimator';
// Note: This creates a circular dependency with ModelStore (which imports hasEnoughMemory).
// This is intentional and runtime-safe because:
// 1. modelStore is instantiated after class definition
// 2. hasEnoughMemory is only called at runtime, not during module initialization
import {modelStore} from '../store';
import {MemoryFitStatus} from '../utils/memoryDisplay';

/** Cold-start fallback when no calibration is available: min(60% of
 *  RAM, RAM − 1.2GB), clamped non-negative. */
const coldStartCeiling = async (): Promise<number> => {
  const totalMemory = await DeviceInfo.getTotalMemory();
  return Math.max(Math.min(totalMemory * 0.6, totalMemory - 1.2 * 1e9), 0);
};

/** Hydrate the model's GGUF metadata (if missing) and compute the
 *  available-memory ceiling from calibration data, with cold-start
 *  fallback. Shared by both hasEnoughMemory variants. */
const fetchModelAndCeiling = async (
  model: Model,
): Promise<{modelForCalc: Model; ceiling: number}> => {
  let modelForCalc = model;
  if (!model.ggufMetadata && model.isDownloaded) {
    try {
      await modelStore.fetchAndPersistGGUFMetadata(model);
      const updated = modelStore.models.find(m => m.id === model.id);
      if (updated) {
        modelForCalc = updated;
      }
    } catch {
      // Continue with fallback estimation
    }
  }
  const {largestSuccessfulLoad, availableMemoryCeiling} = modelStore;
  const ceiling =
    largestSuccessfulLoad !== undefined || availableMemoryCeiling !== undefined
      ? Math.max(largestSuccessfulLoad ?? 0, availableMemoryCeiling ?? 0)
      : await coldStartCeiling();
  return {modelForCalc, ceiling};
};

/** Does the device fit `model` at the currently configured n_ctx? */
export const hasEnoughMemory = async (
  model: Model,
  projectionModel?: Model,
): Promise<boolean> => {
  const {modelForCalc, ceiling} = await fetchModelAndCeiling(model);
  return (
    getModelMemoryRequirement(
      modelForCalc,
      projectionModel,
      modelStore.contextInitParams,
    ) <= ceiling
  );
};

/** Does the device fit `model` at a hypothetical `nCtx`? Used by the
 *  tier picker without mutating modelStore.contextInitParams. */
export const hasEnoughMemoryWithNCtx = async (
  model: Model,
  nCtx: number,
  projectionModel?: Model,
): Promise<boolean> => {
  const {modelForCalc, ceiling} = await fetchModelAndCeiling(model);
  return (
    getModelMemoryRequirement(modelForCalc, projectionModel, {
      ...modelStore.contextInitParams,
      n_ctx: nCtx,
    }) <= ceiling
  );
};

/**
 * Get memory fit status with details
 */
async function getMemoryFitDetails(
  model: Model,
  projectionModel: Model | undefined,
  contextInitParams: ContextInitParams,
): Promise<{
  status: MemoryFitStatus;
  requiredBytes: number;
  availableBytes: number;
}> {
  // Get memory requirement
  const requiredBytes = getModelMemoryRequirement(
    model,
    projectionModel,
    contextInitParams,
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

  // Read context settings that affect memory estimation
  // This ensures the hook re-runs when user changes context size, cache types, etc.
  const contextInitParams = modelStore.contextInitParams;

  useEffect(() => {
    const checkMemory = async () => {
      // Reset warnings first
      setMemoryWarning('');
      setShortMemoryWarning('');
      setMultimodalWarning('');
      setFitStatus('fits');

      try {
        const {status, requiredBytes, availableBytes} =
          await getMemoryFitDetails(
            model as Model,
            projectionModel,
            contextInitParams,
          );

        setFitStatus(status);

        if (status === 'tight') {
          // Concise badge text
          setShortMemoryWarning(l10n.memory.memoryTight);
          // Detailed message with numbers
          const neededText = formatBytes(requiredBytes, 1);
          const availableText = formatBytes(availableBytes, 1);
          setMemoryWarning(
            t(l10n.memory.memoryDetailMessage, {
              needed: neededText,
              available: availableText,
            }),
          );
        } else if (status === 'wont_fit') {
          // Concise badge text
          setShortMemoryWarning(l10n.memory.lowMemory);
          // Detailed message with numbers
          const neededText = formatBytes(requiredBytes, 1);
          const availableText = formatBytes(availableBytes, 1);
          setMemoryWarning(
            t(l10n.memory.memoryDetailMessage, {
              needed: neededText,
              available: availableText,
            }),
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
  }, [model, projectionModel, l10n, calibrationCeiling, contextInitParams]);

  return {memoryWarning, shortMemoryWarning, multimodalWarning, fitStatus};
};
