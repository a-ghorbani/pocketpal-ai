import {gguf} from '@huggingface/gguf';

import {GGUFMetadata} from './types';

export const isMTPCapable = (model: {ggufMetadata?: GGUFMetadata}): boolean =>
  (model.ggufMetadata?.nextn_predict_layers ?? 0) > 0;

// Width the native paired assert compares: n_embd_out(draft) == n_embd(target).
export const nEmbdOut = (meta?: GGUFMetadata): number | undefined =>
  meta?.embedding_length_out ?? meta?.n_embd;

// Range-fetches the GGUF header. Some converters omit the KV but still write
// `nextn.*` tensors, hence the tensor-name fallback.
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
