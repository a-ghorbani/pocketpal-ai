import {Model, GGUFMetadata, ContextInitParams} from './types';

/**
 * Get bytes per element for KV cache based on quantization type
 * Reference: llama.cpp cache type sizes
 */
export function getKVCacheTypeBytes(cacheType: string): number {
  const typeMap: Record<string, number> = {
    f32: 4.0,
    f16: 2.0,
    bf16: 2.0,
    q8_0: 1.0625, // 34/32
    q4_0: 0.5625, // 18/32
    q4_1: 0.625, // 20/32
    q5_0: 0.6875, // 22/32
    q5_1: 0.75, // 24/32
  };
  return typeMap[cacheType.toLowerCase()] || 2.0; // Default to f16
}

/**
 * Calculate KV cache memory requirement using GGUF metadata and context settings
 */
function calculateKVCacheMemory(
  metadata: GGUFMetadata,
  contextSettings: ContextInitParams,
): number {
  const {n_layers, n_embd_head_k, n_embd_head_v, n_head_kv, sliding_window} =
    metadata;

  const {n_ctx, cache_type_k, cache_type_v} = contextSettings;

  // For SWA (Sliding Window Attention) models like Gemma
  const effectiveCtx = sliding_window ? Math.min(n_ctx, sliding_window) : n_ctx;

  // Calculate key and value cache separately (may have different quantization)
  const bytesPerK = getKVCacheTypeBytes(cache_type_k || 'f16');
  const bytesPerV = getKVCacheTypeBytes(cache_type_v || 'f16');

  const keyCacheSize =
    n_layers * effectiveCtx * n_embd_head_k * n_head_kv * bytesPerK;
  const valueCacheSize =
    n_layers * effectiveCtx * n_embd_head_v * n_head_kv * bytesPerV;

  return keyCacheSize + valueCacheSize;
}

/**
 * Calculate compute buffer memory requirement
 */
function calculateComputeBuffer(
  metadata: GGUFMetadata,
  contextSettings: ContextInitParams,
): number {
  const {n_vocab, n_embd} = metadata;
  const {n_ubatch} = contextSettings;

  // Compute buffer: (n_vocab + n_embd) × n_ubatch × 4 bytes
  return (n_vocab + n_embd) * n_ubatch * 4;
}

/**
 * Get model memory requirement estimate in bytes
 *
 * This is the single source of truth for model memory estimation.
 * Used for both:
 * - Checking if a model fits before loading
 * - Tracking largestSuccessfulLoad after successful load
 *
 * When GGUF metadata is available:
 *   Uses accurate formula: (Weights + KV Cache + Compute Buffer) × 1.1
 *
 * When GGUF metadata is NOT available:
 *   Uses fallback: (modelSize + mmProjSize) × 1.1
 *
 * @param model - The model to estimate memory for
 * @param projectionModel - Optional mmproj model for multimodal
 * @param contextSettings - Optional context settings (n_ctx, cache types, etc.)
 * @returns Estimated memory requirement in bytes
 */
export function getModelMemoryRequirement(
  model: Model,
  projectionModel?: Model,
  contextSettings?: ContextInitParams,
): number {
  const mmProjSize = projectionModel?.size || 0;

  // If GGUF metadata is available, use accurate formula
  if (model.ggufMetadata && contextSettings) {
    const metadata = model.ggufMetadata;

    // Weights: already quantized in GGUF file
    const weightsSize = model.size;

    // KV Cache: depends on context length, architecture, and cache quantization
    const kvCacheSize = calculateKVCacheMemory(metadata, contextSettings);

    // Compute Buffer: temporary buffers for inference
    const computeBuffer = calculateComputeBuffer(metadata, contextSettings);

    // Total: (Weights + KV Cache + Compute) × 1.1 overhead + mmproj
    const baseMemory = weightsSize + kvCacheSize + computeBuffer;
    const totalMemory = baseMemory * 1.1 + mmProjSize * 1.1;

    if (__DEV__) {
      console.log('[MemoryEstimator] Using GGUF-based calculation:');
      console.log('  Weights:', (weightsSize / 1e9).toFixed(2), 'GB');
      console.log('  KV Cache:', (kvCacheSize / 1e9).toFixed(2), 'GB');
      console.log('  Compute Buffer:', (computeBuffer / 1e9).toFixed(2), 'GB');
      console.log('  mmproj:', (mmProjSize / 1e9).toFixed(2), 'GB');
      console.log(
        '  Total (with 10% overhead):',
        (totalMemory / 1e9).toFixed(2),
        'GB',
      );
    }

    return totalMemory;
  }

  // Fallback: simple size-based estimation
  const totalSize = model.size + mmProjSize;
  const estimated = totalSize * 1.1; // 10% overhead

  if (__DEV__) {
    console.log('[MemoryEstimator] Using fallback calculation:');
    console.log('  Model size:', (model.size / 1e9).toFixed(2), 'GB');
    console.log('  mmproj size:', (mmProjSize / 1e9).toFixed(2), 'GB');
    console.log(
      '  Total (with 10% overhead):',
      (estimated / 1e9).toFixed(2),
      'GB',
    );
  }

  return estimated;
}
