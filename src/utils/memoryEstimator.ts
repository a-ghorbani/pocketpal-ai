import {Model, GGUFMetadata, ContextInitParams, CacheType} from './types';

// Guards against corrupted metadata persisted by older app versions.
function isValidGGUFMetadata(metadata: GGUFMetadata): boolean {
  const requiredFields = [
    metadata.n_layers,
    metadata.n_embd,
    metadata.n_head,
    metadata.n_head_kv,
    metadata.n_vocab,
    metadata.n_embd_head_k,
    metadata.n_embd_head_v,
  ];

  return requiredFields.every(
    value => typeof value === 'number' && !isNaN(value) && value > 0,
  );
}

// Sizes mirror llama.cpp's cache types.
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

function calculateKVCacheMemory(
  metadata: GGUFMetadata,
  contextSettings: ContextInitParams,
): number {
  // Defensive: Convert to numbers in case metadata was persisted as strings
  const n_layers = Number(metadata.n_layers);
  const n_embd_head_k = Number(metadata.n_embd_head_k);
  const n_embd_head_v = Number(metadata.n_embd_head_v);
  const n_head_kv = Number(metadata.n_head_kv);
  const sliding_window = metadata.sliding_window
    ? Number(metadata.sliding_window)
    : undefined;

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

function calculateComputeBuffer(
  metadata: GGUFMetadata,
  contextSettings: ContextInitParams,
): number {
  // Defensive: Convert to numbers in case metadata was persisted as strings
  const n_vocab = Number(metadata.n_vocab);
  const n_embd = Number(metadata.n_embd);
  const {n_ubatch} = contextSettings;

  return (n_vocab + n_embd) * n_ubatch * 4;
}

const RUNTIME_OVERHEAD = 1.1;
const RUNTIME_OVERHEAD_WITHOUT_METADATA = 1.2;

export function getModelMemoryRequirement(
  model: Model,
  projectionModel?: Model,
  contextSettings?: ContextInitParams,
  draftModel?: Model,
): number {
  const mmProjSize = projectionModel?.size || 0;
  const draftSize = draftModel?.size || 0;

  // A paired draft runs with its own KV cache, sized by the target's n_ctx -
  // there is no separate draft n_ctx.
  let draftKvCacheSize = 0;
  if (
    draftModel?.ggufMetadata &&
    contextSettings &&
    isValidGGUFMetadata(draftModel.ggufMetadata)
  ) {
    draftKvCacheSize = calculateKVCacheMemory(draftModel.ggufMetadata, {
      ...contextSettings,
      cache_type_k: (contextSettings.spec_draft_cache_type_k ||
        'f16') as CacheType,
      cache_type_v: (contextSettings.spec_draft_cache_type_v ||
        'f16') as CacheType,
    });
  }

  if (
    model.ggufMetadata &&
    contextSettings &&
    isValidGGUFMetadata(model.ggufMetadata)
  ) {
    const metadata = model.ggufMetadata;
    const weightsSize = model.size;
    const kvCacheSize = calculateKVCacheMemory(metadata, contextSettings);
    const computeBuffer = calculateComputeBuffer(metadata, contextSettings);

    const baseMemory = weightsSize + kvCacheSize + computeBuffer;
    const totalMemory =
      baseMemory * RUNTIME_OVERHEAD +
      mmProjSize * RUNTIME_OVERHEAD +
      (draftSize + draftKvCacheSize) * RUNTIME_OVERHEAD;

    return totalMemory;
  }

  const totalSize = model.size + mmProjSize + draftSize;
  const estimated = totalSize * RUNTIME_OVERHEAD_WITHOUT_METADATA;

  return estimated;
}
