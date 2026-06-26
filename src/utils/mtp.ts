import {gguf} from '@huggingface/gguf';

import {GGUFMetadata} from './types';

/**
 * MTP (multi-token-prediction) / speculative-decoding capability detection.
 *
 * A model is MTP-capable when its GGUF carries embedded draft layers, signalled
 * by the `<arch>.nextn_predict_layers` KV being > 0. This drives whether the
 * speculative feature can engage (embedded MTP target or a valid paired draft).
 *
 * Detection has two surfaces:
 *  - local / post-download: derived from the cached `ggufMetadata` (KV-only; a
 *    converter that omits the KV but writes nextn tensors false-negatives, which
 *    degrades safely to "off" — the target still loads).
 *  - remote / pre-download: a `@huggingface/gguf` header range-fetch that has
 *    tensor names too, so it can fall back to a `nextn.` tensor-name probe.
 */

/**
 * Local (post-download) capability, derived purely from the cached GGUF metadata.
 * KV-only: a missing `nextn_predict_layers` reads as not capable (safe default).
 */
export const isMTPCapable = (model: {ggufMetadata?: GGUFMetadata}): boolean =>
  (model.ggufMetadata?.nextn_predict_layers ?? 0) > 0;

/**
 * The output embedding width the native paired assert compares
 * (`n_embd_out(draft) == n_embd(target)`). Mirrors llama.cpp's n_embd_out: use
 * `embedding_length_out` when present, otherwise fall back to `n_embd`.
 * Returns undefined when neither width is known (caller must treat as unknown).
 */
export const nEmbdOut = (meta?: GGUFMetadata): number | undefined =>
  meta?.embedding_length_out ?? meta?.n_embd;

/**
 * Remote (pre-download) capability via a GGUF header range-fetch. Reads the
 * `<arch>.nextn_predict_layers` KV first, then falls back to a tensor-name probe
 * (`nextn.` blocks) to catch converters that omit the KV. Any fetch/parse
 * failure resolves to false (unknown ≠ incapable; the caller shows no badge).
 */
export const isMTPCapableRemote = async (ggufUrl: string): Promise<boolean> => {
  try {
    const {metadata, tensorInfos} = await gguf(ggufUrl);
    const arch = metadata['general.architecture'] as string | undefined;
    const kv = arch ? Number(metadata[`${arch}.nextn_predict_layers`] ?? 0) : 0;
    if (Number.isFinite(kv) && kv > 0) {
      return true;
    }
    return (tensorInfos ?? []).some(t => /(^|\.)nextn\./.test(t.name));
  } catch (error) {
    console.warn('[mtp] remote capability probe failed:', error);
    return false;
  }
};
