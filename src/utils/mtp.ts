import {gguf} from '@huggingface/gguf';

import {GGUFMetadata} from './types';

export const isMTPCapable = (model: {ggufMetadata?: GGUFMetadata}): boolean =>
  (model.ggufMetadata?.nextn_predict_layers ?? 0) > 0;

// Width the native paired assert compares: n_embd_out(draft) == n_embd(target).
export const nEmbdOut = (meta?: GGUFMetadata): number | undefined =>
  meta?.embedding_length_out ?? meta?.n_embd;

/**
 * `unknown` means the probe could not run — no network, or a runtime the GGUF
 * reader cannot execute on. It is deliberately not folded into `not-capable`:
 * a probe that is broken everywhere must stay distinguishable from a genuine
 * negative, which reads identically at every call site.
 */
export type MTPRemoteCapability = 'capable' | 'not-capable' | 'unknown';

// Range-fetches the GGUF header. Some converters omit the KV but still write
// `nextn.*` tensors, hence the tensor-name fallback.
export const probeRemoteMTPCapability = async (
  ggufUrl: string,
): Promise<MTPRemoteCapability> => {
  try {
    const {metadata, tensorInfos} = await gguf(ggufUrl);
    const arch = metadata['general.architecture'] as string | undefined;
    const kv = arch ? Number(metadata[`${arch}.nextn_predict_layers`] ?? 0) : 0;
    if (Number.isFinite(kv) && kv > 0) {
      return 'capable';
    }
    return (tensorInfos ?? []).some(t => /(^|\.)nextn\./.test(t.name))
      ? 'capable'
      : 'not-capable';
  } catch (error) {
    console.warn('[mtp] remote capability probe could not run:', error);
    return 'unknown';
  }
};
