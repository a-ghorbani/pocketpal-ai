import {Platform} from 'react-native';
import {Model, GGUFMetadata, ContextInitParams, CacheType} from './types';
import type {Tier} from '../services/deviceRules/types';

export const GGUF_METADATA_VERSION = 2;

// llama.cpp refuses a GGUF with more layers than this at load.
const MAX_LAYERS = 512;
const MAX_PER_LAYER_VALUE = 2 ** 20;
const KV_CELL_PADDING = 256;
const F32_BYTES = 4;

// Process memory above llama.cpp's buffers at load: measured 170-451 B per
// vocabulary token across 12 GGUFs, the same at every context size.
const NON_BUFFER_BYTES_PER_VOCAB_TOKEN = 384;
const PRE_PROBE_FIT_MARGIN = 1.0;
const PROJECTOR_AND_DRAFT_OVERHEAD = 1.1;
const RUNTIME_OVERHEAD_WITHOUT_METADATA = 1.2;

type GGUFInfo = Record<string, unknown>;

function toNumber(value: unknown): number | undefined {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

const positive = (value: number | undefined) =>
  value !== undefined && value > 0 ? value : undefined;

const nonNegative = (value: number | undefined) =>
  value !== undefined && value >= 0 ? value : undefined;

const isLayerValue = (value: number | undefined): value is number =>
  value !== undefined && value >= 0 && value <= MAX_PER_LAYER_VALUE;

const isArrayText = (value: unknown) =>
  typeof value === 'string' && value.trim().startsWith('[');

/**
 * A per-layer GGUF value: `"[a, b, ...]"` with exactly one entry per layer, or
 * a scalar that applies to every layer. Anything else is undefined.
 */
function toPerLayer(value: unknown, layers: number): number[] | undefined {
  if (isArrayText(value)) {
    const text = (value as string).trim();
    if (!text.endsWith(']')) {
      return undefined;
    }
    const entries = text
      .slice(1, -1)
      .split(',')
      .map(entry => entry.trim())
      .map(entry =>
        entry === 'true' ? 1 : entry === 'false' ? 0 : toNumber(entry),
      );
    return entries.length === layers && entries.every(isLayerValue)
      ? entries
      : undefined;
  }
  const scalar = toNumber(value);
  return isLayerValue(scalar) ? new Array(layers).fill(scalar) : undefined;
}

const isValidPerLayer = (values: unknown, layers: number) =>
  Array.isArray(values) &&
  values.length === layers &&
  values.every(v => typeof v === 'number' && isLayerValue(v));

/**
 * GGUF metadata as llama.rn's `loadLlamaModelInfo` returns it (every value a
 * string, arrays as text, tokenizer arrays as `<key>.length`).
 */
export function parseGGUFMetadata(info: GGUFInfo): GGUFMetadata | undefined {
  const declaredArchitecture = info['general.architecture'];
  const architecture =
    typeof declaredArchitecture === 'string' && declaredArchitecture
      ? declaredArchitecture
      : 'llama';
  const raw = (field: string) => info[`${architecture}.${field}`];
  const num = (field: string) => toNumber(raw(field));

  const n_layers = num('block_count');
  const n_embd = positive(num('embedding_length'));
  if (
    n_layers === undefined ||
    !Number.isInteger(n_layers) ||
    n_layers <= 0 ||
    n_layers > MAX_LAYERS ||
    n_embd === undefined
  ) {
    return undefined;
  }

  const heads = toPerLayer(raw('attention.head_count'), n_layers);
  const n_head = heads ? Math.max(...heads) : 0;
  if (n_head <= 0) {
    return undefined;
  }

  const headCountKv = raw('attention.head_count_kv');
  const kvHeads =
    headCountKv === undefined || headCountKv === null
      ? [n_head]
      : toPerLayer(headCountKv, n_layers);
  const n_head_kv = kvHeads ? Math.max(...kvHeads) : 0;
  const n_head_kv_layers =
    kvHeads && isArrayText(headCountKv) ? kvHeads : undefined;

  const feedForward = toPerLayer(raw('feed_forward_length'), n_layers);

  return {
    metadataVersion: GGUF_METADATA_VERSION,
    architecture,
    n_layers,
    n_embd,
    n_head,
    n_head_kv,
    n_head_kv_layers,
    n_vocab:
      positive(num('vocab_size')) ??
      positive(toNumber(info['tokenizer.ggml.tokens.length'])) ??
      0,
    n_embd_head_k:
      positive(num('attention.key_length')) ?? Math.floor(n_embd / n_head),
    n_embd_head_v:
      positive(num('attention.value_length')) ?? Math.floor(n_embd / n_head),
    sliding_window: nonNegative(num('attention.sliding_window')),
    shortconv_l_cache: positive(num('shortconv.l_cache')),
    n_ff: feedForward ? positive(Math.max(...feedForward)) : undefined,
    context_length: nonNegative(num('context_length')),
    nextn_predict_layers: nonNegative(num('nextn_predict_layers')),
    embedding_length_out: nonNegative(num('embedding_length_out')),
  };
}

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

  return (
    requiredFields.every(
      value => typeof value === 'number' && Number.isFinite(value) && value > 0,
    ) &&
    Number.isInteger(metadata.n_layers) &&
    metadata.n_layers <= MAX_LAYERS &&
    metadata.n_head <= MAX_PER_LAYER_VALUE &&
    metadata.n_head_kv <= MAX_PER_LAYER_VALUE &&
    (metadata.n_head_kv_layers === undefined ||
      isValidPerLayer(metadata.n_head_kv_layers, metadata.n_layers))
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

type LayerKind = 'attention' | 'recurrent';

interface LayerPlan {
  kinds: LayerKind[];
  headsKv: number[];
}

function planLayers(metadata: GGUFMetadata): LayerPlan {
  const nextn = Number(metadata.nextn_predict_layers) || 0;
  const layers =
    nextn > 0 && nextn < metadata.n_layers
      ? metadata.n_layers - nextn
      : metadata.n_layers;
  const headsKv = Array.from(
    {length: layers},
    (_, il) => metadata.n_head_kv_layers?.[il] ?? metadata.n_head_kv,
  );
  const kinds = headsKv.map<LayerKind>(heads =>
    heads === 0 ? 'recurrent' : 'attention',
  );
  return {kinds, headsKv};
}

const padCells = (cells: number) =>
  Math.ceil(cells / KV_CELL_PADDING) * KV_CELL_PADDING;

const effectiveUbatch = (settings: ContextInitParams) =>
  Math.min(settings.n_ubatch, settings.n_batch, settings.n_ctx);

function kvBytes(
  metadata: GGUFMetadata,
  settings: ContextInitParams,
  typeK: string,
  typeV: string,
): number {
  const {kinds, headsKv} = planLayers(metadata);
  const cells = padCells(settings.n_ctx);
  const bytesPerHead =
    metadata.n_embd_head_k * getKVCacheTypeBytes(typeK) +
    metadata.n_embd_head_v * getKVCacheTypeBytes(typeV);
  return kinds.reduce(
    (sum, kind, il) =>
      kind === 'attention' ? sum + cells * headsKv[il] * bytesPerHead : sum,
    0,
  );
}

function recurrentStateBytes(metadata: GGUFMetadata): number {
  const recurrentLayers = planLayers(metadata).kinds.filter(
    kind => kind === 'recurrent',
  ).length;
  const lCache = metadata.shortconv_l_cache;
  const perLayer = lCache ? metadata.n_embd * (lCache - 1) : 0;
  return recurrentLayers * perLayer * F32_BYTES;
}

function computeBytes(
  metadata: GGUFMetadata,
  settings: ContextInitParams,
  countsAttentionMatrix: boolean,
): number {
  const ubatch = effectiveUbatch(settings);
  const hasAttention = planLayers(metadata).kinds.includes('attention');
  const cells = hasAttention ? padCells(settings.n_ctx) : 0;
  const attentionMatrix = countsAttentionMatrix
    ? cells * metadata.n_head * ubatch * F32_BYTES
    : 0;
  const logits = metadata.n_vocab * ubatch * F32_BYTES;
  const mask = cells * ubatch * (countsAttentionMatrix ? 4 : 2);
  const feedForward = Number(metadata.n_ff) || 4 * metadata.n_embd;
  const graph = (2 * feedForward + 2 * metadata.n_embd) * ubatch * F32_BYTES;
  return Math.max(logits, attentionMatrix) + mask + graph;
}

type FlashAttnType = NonNullable<ContextInitParams['flash_attn_type']>;

function resolveFlashAttn(
  settings: ContextInitParams,
  hasPairedDraft: boolean,
): FlashAttnType {
  if (settings.flash_attn_type) {
    return settings.flash_attn_type;
  }
  if (hasPairedDraft) {
    return 'off';
  }
  return Platform.OS === 'ios' ? 'auto' : 'off';
}

// Without flash attention llama.cpp materialises the full attention matrix in
// the compute buffer. `auto` is counted where it may resolve off.
const countsAttentionMatrix = (flashAttn: FlashAttnType) =>
  flashAttn === 'off' || (flashAttn === 'auto' && Platform.OS !== 'ios');

export function stateCacheBudgetMb(tier: Tier | null): number {
  return tier === null || tier === 'low' ? 64 : 160;
}

export type MemoryEstimateSettings = ContextInitParams & {
  state_cache_budget_mb: number;
};

function ggufNeed(
  model: Model,
  metadata: GGUFMetadata,
  settings: MemoryEstimateSettings,
  projectionModel: Model | undefined,
  draftModel: Model | undefined,
): number {
  const flashAttn = resolveFlashAttn(settings, draftModel !== undefined);
  const buffers =
    model.size +
    kvBytes(
      metadata,
      settings,
      settings.cache_type_k || CacheType.F16,
      settings.cache_type_v || CacheType.F16,
    ) +
    recurrentStateBytes(metadata) +
    computeBytes(metadata, settings, countsAttentionMatrix(flashAttn));
  const headroom = Math.max(
    metadata.n_vocab * NON_BUFFER_BYTES_PER_VOCAB_TOKEN,
    buffers * (PRE_PROBE_FIT_MARGIN - 1),
  );

  // A paired draft runs with its own KV cache, sized by the target's n_ctx —
  // there is no separate draft n_ctx.
  const draftKv =
    draftModel?.ggufMetadata && isValidGGUFMetadata(draftModel.ggufMetadata)
      ? kvBytes(
          draftModel.ggufMetadata,
          settings,
          settings.spec_draft_cache_type_k || CacheType.F16,
          settings.spec_draft_cache_type_v || CacheType.F16,
        )
      : 0;

  const checkpointBytes =
    Number(metadata.sliding_window) > 0
      ? settings.state_cache_budget_mb * 1024 * 1024
      : 0;

  return (
    buffers +
    headroom +
    (projectionModel?.size || 0) * PROJECTOR_AND_DRAFT_OVERHEAD +
    ((draftModel?.size || 0) + draftKv) * PROJECTOR_AND_DRAFT_OVERHEAD +
    checkpointBytes
  );
}

export function getModelMemoryRequirement(
  model: Model,
  projectionModel?: Model,
  contextSettings?: MemoryEstimateSettings,
  draftModel?: Model,
): number {
  if (
    model.ggufMetadata &&
    contextSettings &&
    isValidGGUFMetadata(model.ggufMetadata)
  ) {
    const need = ggufNeed(
      model,
      model.ggufMetadata,
      contextSettings,
      projectionModel,
      draftModel,
    );
    if (Number.isFinite(need)) {
      return need;
    }
  }

  const totalSize =
    model.size + (projectionModel?.size || 0) + (draftModel?.size || 0);
  return totalSize * RUNTIME_OVERHEAD_WITHOUT_METADATA;
}
