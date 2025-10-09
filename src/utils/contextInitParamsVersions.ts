/**
 * Context initialization parameters version constants and migration utilities
 *
 * When adding new parameters:
 * 1. Add the parameter to the createContextInitParams function
 * 2. Increment CURRENT_CONTEXT_INIT_PARAMS_VERSION
 * 3. Add a migration step in migrateContextInitParams to handle the new parameter
 */

import {ContextParams} from '@pocketpalai/llama.rn';
import {ContextInitParams, LegacyContextInitParams} from './types';
import {Platform} from 'react-native';

// Current version of the context init params schema
// Increment this when adding new parameters or changing existing ones
export const CURRENT_CONTEXT_INIT_PARAMS_VERSION = '1.0';

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
      : params.use_mmap ?? (Platform.OS === 'android' ? 'smart' : 'true');

  return {
    ...params,
    use_mmap,
    version: CURRENT_CONTEXT_INIT_PARAMS_VERSION,
    // Ensure all required fields have values (with fallbacks for safety)
    n_ctx: params.n_ctx ?? 1024,
    n_batch: params.n_batch ?? 512,
    n_ubatch: params.n_ubatch ?? 512,
    n_threads: params.n_threads ?? 4,
    flash_attn: params.flash_attn ?? false,
    cache_type_k: params.cache_type_k ?? 'f16',
    cache_type_v: params.cache_type_v ?? 'f16',
    n_gpu_layers: params.n_gpu_layers ?? 0,
    no_gpu_devices: params.no_gpu_devices ?? true,
    use_mlock: params.use_mlock ?? false,
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

  // Add future migrations here as needed
  // if (migratedParams.version < '2.0') {
  //   // Migration to version 2.0
  //   migratedParams.new_field = defaultValue;
  //   migratedParams.version = '2.0';
  // }

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
    'flash_attn',
    'cache_type_k',
    'cache_type_v',
    'n_gpu_layers',
    'no_gpu_devices',
    'use_mlock',
    'use_mmap',
  ];

  return requiredFields.every(field => field in params);
}

/**
 * Creates default ContextInitParams with sensible defaults
 * Used as fallback when parameters are corrupted or missing
 */
export function createDefaultContextInitParams(): ContextInitParams {
  const defaultParams = createContextInitParams({
    n_ctx: 1024,
    n_batch: 512,
    n_ubatch: 512,
    n_threads: 4,
    flash_attn: false,
    cache_type_k: 'f16',
    cache_type_v: 'f16',
    n_gpu_layers: 0,
    no_gpu_devices: true,
    use_mlock: false,
    // use_mmap will be set below
  });

  // Set the platform-specific default for use_mmap
  return {
    ...defaultParams,
    use_mmap: Platform.OS === 'android' ? 'smart' : 'true',
  };
}
