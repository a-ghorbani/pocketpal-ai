/**
 * Context initialization parameters version constants and migration utilities
 *
 * When adding new parameters:
 * 1. Add the parameter to the createContextInitParams function
 * 2. Increment CURRENT_CONTEXT_INIT_PARAMS_VERSION
 * 3. Add a migration step in migrateContextInitParams to handle the new parameter
 */

import {ContextParams} from 'llama.rn';
import {ContextInitParams, LegacyContextInitParams} from './types';
import {Platform} from 'react-native';

// Current version of the context init params schema
// Increment this when adding new parameters or changing existing ones
export const CURRENT_CONTEXT_INIT_PARAMS_VERSION = '2.0';

/**
 * Creates properly versioned ContextInitParams from ContextParams (excluding model)
 * @param params The context parameters without the model field
 * @returns ContextInitParams with proper version
 */
export const createContextInitParams = (
  params: Omit<ContextParams, 'model'>,
): ContextInitParams => {
  // Convert boolean use_mmap to string format
  const use_mmap =
    params.use_mmap === true
      ? 'true'
      : params.use_mmap === false
        ? 'false'
        : (params.use_mmap ?? (Platform.OS === 'android' ? 'smart' : 'true'));

  // Handle flash_attn_type (new) vs flash_attn (old)
  const flash_attn_type =
    (params as any).flash_attn_type ?? (Platform.OS === 'ios' ? 'auto' : 'off');

  return {
    ...params,
    use_mmap,
    version: CURRENT_CONTEXT_INIT_PARAMS_VERSION,
    // Ensure all required fields have values (with fallbacks for safety)
    n_ctx: params.n_ctx ?? 2048, // Increased default from 1024
    n_batch: params.n_batch ?? 512,
    n_ubatch: params.n_ubatch ?? 512,
    n_threads: params.n_threads ?? 4,
    cache_type_k: params.cache_type_k ?? 'f16',
    cache_type_v: params.cache_type_v ?? 'f16',
    n_gpu_layers: params.n_gpu_layers ?? 99, // Changed default from 0 to 99
    use_mlock: params.use_mlock ?? false,

    // New parameters (v2.0+)
    flash_attn_type,
    devices: (params as any).devices,
    kv_unified: (params as any).kv_unified ?? true, // CRITICAL default
    n_parallel: (params as any).n_parallel ?? 1, // Blocking completion only
  };
};

/**
 * Migrates context initialization parameters from older versions to the current version
 * @param params The parameters object to migrate (can be any version)
 * @returns The migrated parameters object
 */
export function migrateContextInitParams(
  params: ContextInitParams | LegacyContextInitParams | any,
): ContextInitParams {
  // Clone the params to avoid modifying the original
  const migratedParams = {...params};

  // If no version is specified, assume it's legacy (pre-versioning)
  if (migratedParams.version === undefined) {
    migratedParams.version = '0.0';
  }

  // Apply migrations sequentially
  if (migratedParams.version === '0.0' || !migratedParams.version) {
    // Migration from legacy (no version) to 1.0

    // Handle n_context -> n_ctx migration (legacy property name change)
    if ('n_context' in migratedParams && !('n_ctx' in migratedParams)) {
      migratedParams.n_ctx = migratedParams.n_context;
      delete migratedParams.n_context;
    }

    // Ensure all required fields have default values if missing
    if (migratedParams.use_mlock === undefined) {
      migratedParams.use_mlock = false;
    }

    if (migratedParams.use_mmap === undefined) {
      migratedParams.use_mmap = Platform.OS === 'android' ? 'smart' : 'true';
    } else if (typeof migratedParams.use_mmap === 'boolean') {
      // Convert boolean to string format
      migratedParams.use_mmap = migratedParams.use_mmap ? 'true' : 'false';
    }

    if (migratedParams.no_gpu_devices === undefined) {
      migratedParams.no_gpu_devices = false;
    }

    migratedParams.version = '1.0';
  }

  // Migration from 1.0 to 2.0: no_gpu_devices → devices, flash_attn → flash_attn_type
  if (migratedParams.version === '1.0') {
    // Migrate no_gpu_devices to devices
    if ('no_gpu_devices' in migratedParams) {
      if (migratedParams.no_gpu_devices === true) {
        // GPU was disabled → set n_gpu_layers to 0, devices undefined (will use CPU)
        migratedParams.n_gpu_layers = 0;
        migratedParams.devices = undefined;
      } else {
        // GPU was enabled → use auto-select
        migratedParams.devices = undefined;
        // Keep existing n_gpu_layers value (or default to 99 if not set)
        if (
          migratedParams.n_gpu_layers === undefined ||
          migratedParams.n_gpu_layers === 0
        ) {
          migratedParams.n_gpu_layers = 99;
        }
      }

      // Keep no_gpu_devices for now (marked deprecated, will be removed in future version)
      // delete migratedParams.no_gpu_devices;
    }

    // Migrate flash_attn boolean to flash_attn_type string
    if (
      'flash_attn' in migratedParams &&
      typeof migratedParams.flash_attn === 'boolean'
    ) {
      if (migratedParams.flash_attn) {
        // Flash attention was enabled
        migratedParams.flash_attn_type = Platform.OS === 'ios' ? 'auto' : 'off';
      } else {
        // Flash attention was disabled
        migratedParams.flash_attn_type = 'off';
      }

      // Keep flash_attn for now (marked deprecated, will be removed in future version)
      // delete migratedParams.flash_attn;
    } else if (!migratedParams.flash_attn_type) {
      // No flash_attn or flash_attn_type, set platform-specific default
      migratedParams.flash_attn_type = Platform.OS === 'ios' ? 'auto' : 'off';
    }

    // Add new required parameters with defaults
    if (migratedParams.kv_unified === undefined) {
      migratedParams.kv_unified = true;
    }

    if (migratedParams.n_parallel === undefined) {
      migratedParams.n_parallel = 1; // App only uses blocking completion()
    }

    // Increase default context size if it was the old default
    if (migratedParams.n_ctx === 1024) {
      migratedParams.n_ctx = 2048; // Increase to new recommended default
    }

    migratedParams.version = '2.0';
  }

  // Ensure the final version is set correctly
  migratedParams.version = CURRENT_CONTEXT_INIT_PARAMS_VERSION;

  return migratedParams as ContextInitParams;
}

/**
 * Validates that an object has all required fields for ContextInitParams
 * @param params The parameters to validate
 * @returns true if valid, false otherwise
 */
export function validateContextInitParams(
  params: any,
): params is ContextInitParams {
  const requiredFields = [
    'version',
    'n_ctx',
    'n_batch',
    'n_ubatch',
    'n_threads',
    'cache_type_k',
    'cache_type_v',
    'n_gpu_layers',
    'use_mlock',
    'use_mmap',
  ];

  // Check required fields
  const hasRequiredFields = requiredFields.every(field => field in params);

  // For v2.0+, also check for new optional fields (but don't require them)
  // kv_unified, n_parallel, devices, flash_attn_type

  return hasRequiredFields;
}

/**
 * Creates default ContextInitParams with sensible defaults
 * Used as fallback when parameters are corrupted or missing
 */
export function createDefaultContextInitParams(): ContextInitParams {
  return {
    version: CURRENT_CONTEXT_INIT_PARAMS_VERSION,
    n_ctx: 2048,
    n_batch: 512,
    n_ubatch: 512,
    n_threads: 4,
    cache_type_k: 'f16',
    cache_type_v: 'f16',
    n_gpu_layers: 99, // All layers
    use_mlock: false,
    use_mmap: Platform.OS === 'android' ? 'smart' : 'true',

    // New v2.0 parameters
    devices: undefined, // Auto-select
    flash_attn_type: Platform.OS === 'ios' ? 'auto' : 'off',
    kv_unified: true, // CRITICAL: saves ~7GB memory
    n_parallel: 1, // App only uses blocking completion()
  };
}
