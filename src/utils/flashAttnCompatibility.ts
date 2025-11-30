/**
 * Flash Attention compatibility validation utilities
 * Based on llama.cpp backend and cache type compatibility matrix
 */

import {Platform} from 'react-native';
import {CacheType} from './types';

export type FlashAttnType = 'auto' | 'on' | 'off';
export type BackendType = 'metal' | 'opencl' | 'hexagon' | 'cpu' | 'blas';

/**
 * Determines the likely backend type based on platform and device selection
 */
export function inferBackendType(
  nGpuLayers: number,
  devices?: string[],
): BackendType {
  if (Platform.OS === 'ios') {
    // iOS uses Metal if GPU is enabled
    return nGpuLayers > 0 ? 'metal' : 'cpu';
  }

  // Android backend inference
  if (nGpuLayers === 0) {
    return 'cpu';
  }

  // Check for Hexagon NPU
  if (devices && devices.length > 0 && devices[0].startsWith('HTP')) {
    return 'hexagon';
  }

  // Check for GPU (OpenCL on Android)
  if (devices && devices.length > 0) {
    return 'opencl';
  }

  // Auto-select: likely OpenCL if GPU layers > 0
  return nGpuLayers > 0 ? 'opencl' : 'cpu';
}

/**
 * Check if a cache type is quantized (not F16/F32)
 */
function isQuantizedCacheType(cacheType: CacheType | string): boolean {
  // F16 and F32 are non-quantized, everything else is quantized
  return (
    cacheType !== CacheType.F16 &&
    cacheType !== CacheType.F32 &&
    cacheType !== 'f16' &&
    cacheType !== 'f32'
  );
}

/**
 * Validates if cache_type_v is safe with the given flash attention configuration
 */
export function isCacheTypeVSafe(
  cacheTypeV: CacheType | string,
  flashAttnType: FlashAttnType,
  backend: BackendType,
): {safe: boolean; reason?: string} {
  // Check if this is a quantized cache type
  const isQuantizedV = isQuantizedCacheType(cacheTypeV);

  if (!isQuantizedV) {
    // F16 and F32 are always safe regardless of flash attention or backend
    return {safe: true};
  }

  // Quantized V cache REQUIRES flash attention to be enabled
  if (flashAttnType === 'off') {
    return {
      safe: false,
      reason: 'Quantized V cache requires flash attention to be enabled',
    };
  }

  // flash_attn: 'on' + quantized V = ✅ Safe (if backend supports FA)
  if (flashAttnType === 'on') {
    // OpenCL doesn't support flash attention at all
    if (backend === 'opencl') {
      return {
        safe: false,
        reason:
          'OpenCL does not support flash attention (required for quantized V cache)',
      };
    }
    // Hexagon support is device-dependent but 'on' should work if supported
    if (backend === 'hexagon') {
      return {
        safe: false,
        reason:
          'Hexagon flash attention support varies by device (use "off" with F16/F32 for safety)',
      };
    }
    // Metal, CPU, BLAS: safe with 'on'
    return {safe: true};
  }

  // flashAttnType === 'auto'
  // flash_attn: 'auto' + quantized V = ⚠️ Risky

  // OpenCL + 'auto' + quantized V = ❌ ERROR
  // (auto-disables FA, then quantized V check fails)
  if (backend === 'opencl') {
    return {
      safe: false,
      reason:
        'OpenCL auto-disables flash attention, quantized V cache will fail at runtime',
    };
  }

  // Hexagon + 'auto' + quantized V = ⚠️ Risky
  // (depends on device FA support; will error if not supported)
  if (backend === 'hexagon') {
    return {
      safe: false,
      reason:
        'Hexagon flash attention support varies by device; quantized V cache may fail at runtime',
    };
  }

  // Metal, CPU, BLAS + 'auto' + quantized V = ✅ Safe
  // These backends reliably support flash attention with 'auto'
  return {safe: true};
}

/**
 * Validates if cache_type_k is safe with the given flash attention configuration
 */
export function isCacheTypeKSafe(
  _cacheTypeK: CacheType | string,
  _flashAttnType: FlashAttnType,
  _backend: BackendType,
): {safe: boolean; reason?: string} {
  // Cache type K is generally safe with all flash attention modes
  // Only potential issue is block size alignment, which is model-specific
  // and not something we can validate at settings time

  // For safety, we allow all combinations for K
  return {safe: true};
}

/**
 * Get allowed cache type V options based on current configuration
 */
export function getAllowedCacheTypeVOptions(
  flashAttnType: FlashAttnType,
  backend: BackendType,
): Array<{
  value: CacheType;
  label: string;
  disabled: boolean;
  reason?: string;
}> {
  const allOptions = [
    {value: CacheType.F16, label: 'F16 (Default)'},
    {value: CacheType.F32, label: 'F32'},
    {value: CacheType.Q8_0, label: 'Q8_0'},
    {value: CacheType.Q5_1, label: 'Q5_1'},
    {value: CacheType.Q5_0, label: 'Q5_0'},
    {value: CacheType.Q4_1, label: 'Q4_1'},
    {value: CacheType.Q4_0, label: 'Q4_0'},
    {value: CacheType.IQ4_NL, label: 'IQ4_NL'},
  ];

  return allOptions.map(option => {
    const validation = isCacheTypeVSafe(option.value, flashAttnType, backend);
    return {
      ...option,
      disabled: !validation.safe,
      reason: validation.reason,
    };
  });
}

/**
 * Get allowed cache type K options based on current configuration
 */
export function getAllowedCacheTypeKOptions(
  flashAttnType: FlashAttnType,
  backend: BackendType,
): Array<{
  value: CacheType;
  label: string;
  disabled: boolean;
  reason?: string;
}> {
  const allOptions = [
    {value: CacheType.F16, label: 'F16 (Default)'},
    {value: CacheType.F32, label: 'F32'},
    {value: CacheType.Q8_0, label: 'Q8_0'},
    {value: CacheType.Q5_1, label: 'Q5_1'},
    {value: CacheType.Q5_0, label: 'Q5_0'},
    {value: CacheType.Q4_1, label: 'Q4_1'},
    {value: CacheType.Q4_0, label: 'Q4_0'},
    {value: CacheType.IQ4_NL, label: 'IQ4_NL'},
  ];

  return allOptions.map(option => {
    const validation = isCacheTypeKSafe(option.value, flashAttnType, backend);
    return {
      ...option,
      disabled: !validation.safe,
      reason: validation.reason,
    };
  });
}
