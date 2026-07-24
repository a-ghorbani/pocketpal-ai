import {gguf} from '@huggingface/gguf';

import {
  isMTPCapable,
  probeRemoteMTPCapability,
  nEmbdOut,
  isDraftOnlyArch,
  isDraftOnlyFilename,
  isDraftOnlyModel,
} from '../mtp';
import {installTextDecoder} from '../textDecoder';
import {GGUFMetadata} from '../types';

const meta = (over: Partial<GGUFMetadata> = {}): GGUFMetadata => ({
  architecture: 'qwen3',
  n_layers: 28,
  n_embd: 1024,
  n_head: 16,
  n_head_kv: 8,
  n_vocab: 151936,
  n_embd_head_k: 64,
  n_embd_head_v: 64,
  ...over,
});

const URL = 'http://x/m.gguf';

describe('mtp utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  describe('isMTPCapable (local-derived, KV-only)', () => {
    it('is true when nextn_predict_layers > 0', () => {
      expect(
        isMTPCapable({ggufMetadata: meta({nextn_predict_layers: 1})}),
      ).toBe(true);
    });

    it('is false when nextn_predict_layers is 0', () => {
      expect(
        isMTPCapable({ggufMetadata: meta({nextn_predict_layers: 0})}),
      ).toBe(false);
    });

    it('is false when the KV is absent (safe default / KV-only caveat)', () => {
      expect(isMTPCapable({ggufMetadata: meta()})).toBe(false);
    });

    it('is false when there is no ggufMetadata at all', () => {
      expect(isMTPCapable({})).toBe(false);
    });
  });

  describe('nEmbdOut (paired width helper)', () => {
    it('prefers embedding_length_out when present', () => {
      expect(nEmbdOut(meta({embedding_length_out: 2048}))).toBe(2048);
    });

    it('falls back to n_embd when embedding_length_out is unset', () => {
      expect(nEmbdOut(meta())).toBe(1024);
    });

    it('is undefined when no metadata is available', () => {
      expect(nEmbdOut(undefined)).toBeUndefined();
    });
  });

  describe('probeRemoteMTPCapability (header fetch)', () => {
    it('is capable on a positive nextn_predict_layers KV', async () => {
      (gguf as jest.Mock).mockResolvedValueOnce({
        metadata: {
          'general.architecture': 'qwen3',
          'qwen3.nextn_predict_layers': 2,
        },
        tensorInfos: [],
      });
      await expect(probeRemoteMTPCapability(URL)).resolves.toBe('capable');
    });

    it('falls back to a nextn tensor-name probe when the KV is absent', async () => {
      (gguf as jest.Mock).mockResolvedValueOnce({
        metadata: {'general.architecture': 'qwen3'},
        tensorInfos: [
          {name: 'blk.0.attn_q.weight'},
          {name: 'blk.0.nextn.embed_tokens.weight'},
        ],
      });
      await expect(probeRemoteMTPCapability(URL)).resolves.toBe('capable');
    });

    it('is not-capable when neither the KV nor nextn tensors are present', async () => {
      (gguf as jest.Mock).mockResolvedValueOnce({
        metadata: {'general.architecture': 'qwen3'},
        tensorInfos: [{name: 'blk.0.attn_q.weight'}],
      });
      await expect(probeRemoteMTPCapability(URL)).resolves.toBe('not-capable');
    });

    it('is unknown, not not-capable, when the fetch rejects', async () => {
      (gguf as jest.Mock).mockRejectedValueOnce(new Error('network'));
      await expect(probeRemoteMTPCapability(URL)).resolves.toBe('unknown');
    });
  });

  describe('probeRemoteMTPCapability on a runtime without TextDecoder', () => {
    const nativeTextDecoder = globalThis.TextDecoder;

    beforeEach(() => {
      // The real reader builds every GGUF string through TextDecoder, so the
      // probe only works on a runtime that has one. Hermes does not.
      (gguf as jest.Mock).mockImplementation(async () => {
        const raw = new TextEncoder().encode('qwen35');
        const arch = new TextDecoder().decode(
          raw.buffer.slice(0, raw.byteLength),
        );
        return {
          metadata: {
            'general.architecture': arch,
            [`${arch}.nextn_predict_layers`]: 1,
          },
          tensorInfos: [],
        };
      });
      // @ts-expect-error deleting a global to simulate the Hermes runtime
      delete globalThis.TextDecoder;
    });

    afterEach(() => {
      globalThis.TextDecoder = nativeTextDecoder;
      (gguf as jest.Mock).mockReset();
    });

    it('reports unknown rather than passing a dead probe off as a negative', async () => {
      await expect(probeRemoteMTPCapability(URL)).resolves.toBe('unknown');
    });

    it('reads the header once the polyfill is installed', async () => {
      installTextDecoder();

      await expect(probeRemoteMTPCapability(URL)).resolves.toBe('capable');
    });
  });
});

describe('draft-only detection', () => {
  const dmeta = (architecture: string, nextn?: number) =>
    ({architecture, nextn_predict_layers: nextn}) as any;

  it('treats an assistant-arch file as draft-only', () => {
    expect(isDraftOnlyArch('gemma4-assistant')).toBe(true);
    expect(isDraftOnlyModel({ggufMetadata: dmeta('gemma4-assistant', 4)})).toBe(
      true,
    );
  });

  it('does NOT treat an embedded-MTP model as draft-only', () => {
    // Qwen3.5-0.8B-MTP: nextn > 0 but a normal arch, and it loads and
    // generates on device — gating it would break a shipped mode.
    expect(isDraftOnlyArch('qwen35')).toBe(false);
    expect(isDraftOnlyModel({ggufMetadata: dmeta('qwen35', 1)})).toBe(false);
    expect(isMTPCapable({ggufMetadata: dmeta('qwen35', 1)})).toBe(true);
  });

  it('leaves a plain target alone', () => {
    expect(isDraftOnlyArch('gemma4')).toBe(false);
    expect(isDraftOnlyModel({ggufMetadata: dmeta('gemma4')})).toBe(false);
  });

  it('falls back to the filename before the header is available', () => {
    expect(isDraftOnlyFilename('mtp-gemma-4-E2B-it-Q8_0.gguf')).toBe(true);
    expect(isDraftOnlyFilename('gemma-4-E2B-it-Q4_0.gguf')).toBe(false);
    expect(isDraftOnlyFilename('Qwen3.5-0.8B-Q4_0.gguf')).toBe(false);
    expect(isDraftOnlyModel({filename: 'mtp-gemma-4-E2B-it-Q8_0.gguf'})).toBe(
      true,
    );
  });

  it('accepts the separator and suffix spellings converters actually ship', () => {
    // Seen in the wild: ggml-org uses `-assistant`, AtomicChat `_assistant`,
    // Radamanthys11 the older `_mtp`.
    expect(isDraftOnlyArch('gemma4-assistant')).toBe(true);
    expect(isDraftOnlyArch('gemma4_assistant')).toBe(true);
    expect(isDraftOnlyArch('gemma4_mtp')).toBe(true);
    // A target whose name merely contains the word must not match.
    expect(isDraftOnlyArch('assistant-gemma4')).toBe(false);
  });

  it('flags a draft when either the arch or the filename says so', () => {
    expect(
      isDraftOnlyModel({
        ggufMetadata: dmeta('gemma4', undefined),
        filename: 'mtp-gemma-4-E2B-it-Q8_0.gguf',
      }),
    ).toBe(true);
    expect(
      isDraftOnlyModel({
        ggufMetadata: dmeta('gemma4-assistant', 4),
        filename: 'oddly-named.gguf',
      }),
    ).toBe(true);
    expect(
      isDraftOnlyModel({
        ggufMetadata: dmeta('qwen35', 1),
        filename: 'Qwen3.5-0.8B-Q4_0.gguf',
      }),
    ).toBe(false);
  });
});
