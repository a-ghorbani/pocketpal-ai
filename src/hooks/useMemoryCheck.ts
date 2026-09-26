import React, {useEffect, useState} from 'react';
import DeviceInfo from 'react-native-device-info';
import {L10nContext, formatBytes} from '../utils';
import {t} from '../locales';
import {Model, ContextInitParams} from '../utils/types';
import {isHighEndDevice} from '../utils/deviceCapabilities';
import {getModelMemoryRequirement} from '../utils/memoryEstimator';
import NativeHardwareInfo from '../specs/NativeHardwareInfo';
// Note: This creates a circular dependency with ModelStore (which imports hasEnoughMemory).
// This is intentional and runtime-safe because:
// 1. modelStore is instantiated after class definition
// 2. hasEnoughMemory is only called at runtime, not during module initialization
import {modelStore} from '../store';
import {MemoryFitStatus} from '../utils/memoryDisplay';

/**
 * Resolve how much RAM a model load may use right now.
 *
 * Free RAM is point-in-time data: the persisted calibration
 * (largestSuccessfulLoad / availableMemoryCeiling) must never raise the
 * ceiling above what is actually free, or warnings silently disappear as the
 * stored maximum ratchets up. Prefer a live reading; fall back to history,
 * then to a static heuristic.
 */
export async function getAvailableMemoryCeiling(): Promise<number> {
  const historicalBase = Math.max(
    modelStore.largestSuccessfulLoad ?? 0,
    modelStore.availableMemoryCeiling ?? 0,
  );

  try {
    const liveFreeBytes = await NativeHardwareInfo.getAvailableMemory();
    if (liveFreeBytes > 0) {
      return historicalBase > 0
        ? Math.min(liveFreeBytes, historicalBase)
        : liveFreeBytes;
    }
  } catch {
    // Native call failed (e.g. missing module) — use stored calibration.
  }

  if (historicalBase > 0) {
    return historicalBase;
  }

  const totalMemory = await DeviceInfo.getTotalMemory();
  return Math.max(Math.min(totalMemory * 0.6, totalMemory - 1.2 * 1e9), 0);
}

/**
 * Check if there's enough memory to load a model.
 *
 * Uses calibrated ceiling from ModelStore (max of largestSuccessfulLoad, availableMemoryCeiling).
 *
 * @param model - The model to check
 * @param projectionModel - Optional mmproj model for multimodal
 * @param draftModel - Optional speculative draft model loaded alongside the target
 * @returns true if device has enough memory
 */
export const hasEnoughMemory = async (
  model: Model,
  projectionModel?: Model,
  draftModel?: Model,
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
  const ceiling = await getAvailableMemoryCeiling();

  const memoryRequirement = getModelMemoryRequirement(
    modelForCalc,
    projectionModel,
    modelStore.contextInitParams,
    draftModel,
  );

  return memoryRequirement <= ceiling;
};

/**
 * Get memory fit status with details
 */
async function getMemoryFitDetails(
  model: Model,
  projectionModel: Model | undefined,
  contextInitParams: ContextInitParams,
  draftModel?: Model,
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
    draftModel,
  );

  // Get device total memory
  const totalMemory = await DeviceInfo.getTotalMemory();

  const availableBytes = await getAvailableMemoryCeiling();

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
 * @param draftModel - Optional speculative draft model loaded alongside the target
 */
export const useMemoryCheck = (
  model: Model | {size: number; supportsMultimodal?: boolean},
  projectionModel?: Model,
  draftModel?: Model,
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
            draftModel,
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
  }, [
    model,
    projectionModel,
    draftModel,
    l10n,
    calibrationCeiling,
    contextInitParams,
  ]);

  return {memoryWarning, shortMemoryWarning, multimodalWarning, fitStatus};
};
