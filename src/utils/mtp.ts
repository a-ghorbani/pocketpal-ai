import {gguf} from '@huggingface/gguf';

import {GGUFMetadata} from './types';

export const isMTPCapable = (model: {ggufMetadata?: GGUFMetadata}): boolean =>
  (model.ggufMetadata?.nextn_predict_layers ?? 0) > 0;

/**
 * A draft-only artifact speculates for a target but cannot be a chat model:
 * loading one fails in llama.rn with "Failed to load model". Embedded-MTP
 * models also carry `nextn_predict_layers`, so the arch suffix — not the layer
 * count — is what separates the two.
 */
// Converters disagree on the separator (`gemma4-assistant`, `gemma4_assistant`)
// and some older ones tag the draft `*_mtp`, so match on the suffix word.
export const isDraftOnlyArch = (architecture?: string): boolean =>
  /[-_](assistant|mtp)$/.test((architecture ?? '').toLowerCase());

// Naming-convention signal for when no GGUF header is available yet:
// ggml-org publishes drafts as `mtp-<target>`; converters use an `assistant`
// token. Token match only — "openassistant-…" is a chat model, not a draft.
export const isDraftOnlyFilename = (filename?: string): boolean => {
  const name = (filename ?? '').toLowerCase().split('/').pop() ?? '';
  return name.startsWith('mtp-') || /(^|[-_.])assistant([-_.]|$)/.test(name);
};

// The header is authoritative: a filename convention must never override a
// valid chat architecture. The filename decides only pre-download, where the
// HF search has no header to consult.
export const isDraftOnlyModel = (model: {
  ggufMetadata?: GGUFMetadata;
  filename?: string;
}): boolean =>
  model.ggufMetadata?.architecture
    ? isDraftOnlyArch(model.ggufMetadata.architecture)
    : isDraftOnlyFilename(model.filename);

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

// Parsing a header means decoding the full metadata block — megabytes and
// ~10^5 strings on large-vocab repos — on the JS thread, so a reopened
// details sheet must not pay it twice. `unknown` is not cached: it marks a
// probe that could not run, and a retry may succeed.
const probeCache = new Map<string, MTPRemoteCapability>();
const PROBE_CACHE_MAX = 64;

// Range-fetches the GGUF header. Some converters omit the KV but still write
// `nextn.*` tensors, hence the tensor-name fallback.
export const probeRemoteMTPCapability = async (
  ggufUrl: string,
): Promise<MTPRemoteCapability> => {
  const cached = probeCache.get(ggufUrl);
  if (cached) {
    return cached;
  }
  try {
    const {metadata, tensorInfos} = await gguf(ggufUrl);
    const arch = metadata['general.architecture'] as string | undefined;
    const kv = arch ? Number(metadata[`${arch}.nextn_predict_layers`] ?? 0) : 0;
    const result: MTPRemoteCapability =
      (Number.isFinite(kv) && kv > 0) ||
      (tensorInfos ?? []).some(t => /(^|\.)nextn\./.test(t.name))
        ? 'capable'
        : 'not-capable';
    if (probeCache.size >= PROBE_CACHE_MAX) {
      probeCache.delete(probeCache.keys().next().value as string);
    }
    probeCache.set(ggufUrl, result);
    return result;
  } catch (error) {
    console.warn('[mtp] remote capability probe could not run:', error);
    return 'unknown';
  }
};
